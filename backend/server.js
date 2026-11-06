"use strict";
const http = require("node:http"),
  path = require("node:path"),
  crypto = require("node:crypto");
const Engine = require("./engine");
const Commitment = require("./commitment");
const { createPeerOutput } = require("./peer-output");
const metrics = require("./runtime-metrics").createRuntimeMetrics();
const processMetrics = require("./process-metrics").createProcessMetrics({ record: metrics.record });
// Instrument adapters at composition; domain/application code has no telemetry dependency.
function observed(target, methods) {
  const wrapped = Object.create(target);
  for (const [method, name] of Object.entries(methods)) wrapped[method] = (...args) => metrics.span(name, () => target[method](...args));
  return wrapped;
}
const { servePublicAsset } = require("./public-assets");
const { createPlayerActionHandler } = require("../game/application/player-action");
const { fingerprintAction } = require("../game/infrastructure/command-fingerprint");
const { actionReply } = require("../game/compat/legacy-action-reply");
const { createLegacyAutomaticPlay } = require("../game/compat/legacy-automatic-play");
const { createLegacyAuthorizedViews } = require("../game/compat/legacy-authorized-views");
const { createCheckpointHandler } = require("../game/application/checkpoint");
const { createRoomStager } = require("../game/application/room-stage");
const { createFileCheckpointCommitter, createRemoteCheckpointCommitter } = require("../game/infrastructure/checkpoint-committer");
const GameTiming = require("../shared/game-timing");
const {createMatchArchive}=require("./match-archive");
const {guestId,ensureGuest}=require("./guest-identity");
const LobbyUI = require("../shared/lobby-ui");
const ProfileRules = require("../shared/profile-rules");
const { createPracticeController } = require("./practice");
const { createGameClock } = require("./game-clock");
const { createMultiplayerController, shiftDeadlines, GRACE_MS, soloWithBots, reconnectGrace } = require("./multiplayer");
const { hashToken, loadState } = require("./room-store");
const { createSupabaseStore } = require("./supabase-store");
const { createDurableQueue } = require("./durable-queue");
const { createPartitionedQueue } = require("./partitioned-queue");
const { createAccountAuth } = require("./account-auth");
const { createAccountSeats } = require("./account-seats");
const Directory = require("./room-directory");
const {selectMap,roomMapReference} = require("./room-map");
const { createRoomBots } = require("./room-bots");
const PORT = Number(process.env.PORT || 3000),
  ROOT = path.resolve(__dirname, "..");
const STORE = process.env.STATE_FILE || path.join(ROOT, "room-state.json");
const backend = process.env.STATE_BACKEND || "file";
if (!["file", "supabase"].includes(backend)) throw new Error("STATE_BACKEND debe ser file o supabase.");
if (process.env.RENDER === "true" && backend !== "supabase")
  throw new Error("Render requiere STATE_BACKEND=supabase; no se guardarán partidas en su disco efímero.");
const remoteStore = backend === "supabase" ? createSupabaseStore({ url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY, span: metrics.span }) : null;
let storageReady = !remoteStore, stopping = false;
const TTL = 24 * 60 * 60 * 1000,
  rooms = new Map(),
  peers = new Set();
function restoreLoaded(data) {
  // Prepare every persisted match before installing rooms or touching history.
  // A bad reference must not leave a partially restored checkpoint to be saved.
  const restored = data.map(r => {
    const game=r.game!=null?Engine.restoreState(r.game):r.game;
    if(game&&game.players.length!==r.members.length)throw Object.assign(Error("Invalid saved match: room seats"),{code:"INVALID_MATCH_STATE"});
    return {...r,members:r.members.map(m=>({...m})),game,mapRef:roomMapReference({...r,game})};
  }), live=[];
  for (const r of restored) {
    if (Date.now() - (r.practice ? r.practicePausedAt ?? r.savedAt ?? r.updated : r.updated) < TTL) {
      if (r.practice) r.practicePausedAt ??= r.savedAt || Date.now();
      else if (soloWithBots(r)) {
        r.emptySince ??= r.savedAt || Date.now();
        if(Date.now()-r.emptySince>=reconnectGrace(r))continue;
      }
      else {
        if (r.emptySince != null && (r.savedAt || r.updated) - r.emptySince >= reconnectGrace(r)) continue;
        shiftDeadlines(r.game, Math.max(0, Date.now() - (r.savedAt || Date.now())));
        if (r.game) Engine.normalize(r.game);
        r.emptySince = Date.now();
      }
      Commitment.restart(r);
      const colors = LobbyUI.restoreColors(r.members, r.game?.players);
      r.members.forEach((m, i) => { m.color = colors[i]; if (r.game) r.game.players[i].color = colors[i]; m.ws = null; m.disconnectedAt = Date.now(); });
      live.push(r);
    }
  }
  for(const r of live)rooms.set(r.code,r);
}
const initialState=remoteStore?null:loadState(STORE);
const projections = observed(createLegacyAuthorizedViews(), { lobby: 'lobbyView', state: 'stateView', recording: 'recordingViews' });
const archive=observed(createMatchArchive({remote:remoteStore,saved:initialState?.archive,projections}), { capture: 'history' });
if (!remoteStore) restoreLoaded(Array.isArray(initialState)?initialState:initialState.rooms);
let storageFailureAt = null;
const pausedRooms = new Set();
const storageBlocked = room => storageFailureAt !== null || pausedRooms.has(room?.code ?? durable?.transaction?.key);
const committed = new WeakMap();
for (const r of rooms.values()) committed.set(r, snapshot(r));
function captureRuntime(key=null) {
  return { failureAt: storageFailureAt, archivePending:archive.snapshot(key),
    rooms: [...rooms.values()].filter(r=>key===null||r.code===key).map(r => ({ room: r, data: { ...r, commitment: structuredClone(r.commitment), game: r.game ? structuredClone(r.game) : null },
      members: r.members.map(member => ({ member, data: { ...member, actionIds: [...(member.actionIds || [])], actionReceipts: structuredClone(member.actionReceipts || []) } })) })),
    peers: [...peers].filter(peer=>key===null||peer.room?.code===key||peer.watching?.code===key).map(peer => ({ peer, room: peer.room, watching: peer.watching, seat: peer.seat, token: peer.token })) };
}
function restoreRuntime(saved,key=null) {
  archive.rollback(saved.archivePending,key);
  for (const r of rooms.values()) if(key===null||r.code===key) { clocks.cancel(r); multiplayer.cancel(r); roomBots.cancel(r); }
  if(key===null)rooms.clear();else rooms.delete(key);
  for (const { room, data, members } of saved.rooms) {
    for (const key of Object.keys(room)) delete room[key];
    Object.assign(room, data);
    room.members = members.map(({ member, data }) => {
      for (const key of Object.keys(member)) delete member[key];
      return Object.assign(member, data);
    });
    rooms.set(room.code, room);
    watchRecording(room);
  }
  for (const { peer, room, watching, seat, token } of saved.peers) Object.assign(peer, { room, watching, seat, token });
  if(key===null)storageFailureAt = saved.failureAt;
}
const checkpoint = createCheckpointHandler({ repository: rooms,
  committer: observed(remoteStore ? createRemoteCheckpointCommitter({ store: remoteStore, archive, blocked: room => pausedRooms.has(room.code) }) : createFileCheckpointCommitter({ file: STORE, archive }), { prepare: 'checkpointPrepare' }),
  now: () => Date.now(), deferCommit: remoteStore ? () => durable.dirty() : null,
  onLocalCommit: () => { for (const room of rooms.values()) committed.set(room, snapshot(room)); },
  onLocalFailure: restoreLocalCheckpoint, transaction: () => durable?.transaction,
});
const persist = checkpoint.persist;
const queueOptions = { capture: captureRuntime, restore: restoreRuntime,
  commit: checkpoint.commit, measure: metrics.record, batchSize:16,
  scope: metrics.scope, spans: metrics.spans,
  onFailure: (error,key=null) => {
    console.error("Remote storage paused:", error.code || "INTERNAL");
    if(key===null||error.code==='STORE_CONFLICT')storageFailureAt ??= Date.now();else pausedRooms.add(key);
    for (const r of rooms.values()) if(storageBlocked(r)) { clocks.cancel(r); multiplayer.cancel(r); roomBots.cancel(r); }
    for (const peer of peers) if(storageFailureAt!==null||peer.room?.code===key||peer.watching?.code===key) {
      const requiresRestart=storageFailureAt!==null||!remoteStore.perRoom;
      peer.send({ type: "storage", paused: true, requiresRestart });
      peer.send({ type: "error", code: "STORAGE_FAILED", message: requiresRestart ? "No se pudo confirmar el guardado. La partida está pausada; reinicia el servidor y reconecta para recuperar el estado guardado." : "No se pudo confirmar el guardado. Reintenta para recuperar esta partida desde el estado guardado." });
      if (peer.room?.game) peer.send(projections.state(peer.room, peer.seat, { storagePaused: true, includeEarlyFinish: false }));
    }
  },
};
const serialQueue = remoteStore ? createDurableQueue(queueOptions) : null;
const roomQueue = remoteStore ? createPartitionedQueue(queueOptions) : null;
const activeQueue = () => remoteStore?.perRoom ? roomQueue : serialQueue;
const durable = remoteStore ? {
  run: (...args) => activeQueue().run(...args), dirty: () => activeQueue().dirty(),
  defer: work => activeQueue().defer(work), idle: () => activeQueue().idle(),
  get mutating() { return activeQueue().mutating; }, get transaction() { return activeQueue().transaction; },
} : null;
const dispatch = (job, kind, observe, key=null) => stopping ? undefined : durable ? durable.run(() => { if (!stopping) job(); }, kind, observe, remoteStore.perRoom?key:undefined) : job();
const dispatchRoom = (job, room, kind='other') => dispatch(job,kind,undefined,room.code);
const recoveringRooms=new Set();
async function recoverRoom(peer){
  const room=peer.room,key=room?.code;
  if(!key||room.members[peer.seat]?.ws!==peer||!pausedRooms.has(key)||recoveringRooms.has(key))return;
  recoveringRooms.add(key);
  try {
    const restored=await roomQueue.exclusive(key,async()=>{
      const saved=await remoteStore.readRoom(key),record=saved.room;
      if(record){
        const game=record.game?Engine.restoreState(record.game):null;
        if(game&&game.players.length!==record.members.length)throw Error('Invalid recovered seats');
        const next={...record,game,mapRef:roomMapReference({...record,game})};
        const elapsed=Math.max(0,Date.now()-(record.savedAt||Date.now()));
        shiftDeadlines(next.game,elapsed);Commitment.shift(next,elapsed);
        next.members=record.members.map((member,i)=>{
          const connection=room.members[i]?.ws;
          const owns=connection&&!connection.closed&&member.tokenHash===hashToken(connection.token||'');
          return {...member,ws:owns?connection:null,...owns?{token:connection.token}:{},
            ...(member.disconnectedAt!=null?{disconnectedAt:member.disconnectedAt+elapsed}:{})};
        });
        if(rooms.get(key)!==room)throw Error('Room changed during recovery');
        for(const field of Object.keys(room))delete room[field];Object.assign(room,next);
        watchRecording(room);
      }
      archive.rollback([],key);remoteStore.acceptRecovery(key,saved);
      return record!==null;
    });
    await dispatchRoom(()=>{
      if(rooms.get(key)!==room)return;
      pausedRooms.delete(key);
      if(restored){sendRoom(room);return;}
      // A lost response may have committed removal. Do not manufacture another
      // abandonment frame from the rolled-back runtime candidate.
      for(const member of room.members)if(member.ws){member.ws.send({type:'room_closed'});member.ws.room=null;member.ws.seat=-1;}
      for(const watcher of peers)if(watcher.watching===room){watcher.watching=null;watcher.send({type:'room_closed'});}
      rooms.delete(key);persist(room);sendDirectory(room);
    },room);
  }catch(error){queueOptions.onFailure(error,key);}
  finally{recoveringRooms.delete(key);}
}
const sendRoom = createRoomStager({ repository: rooms, engine: Engine, history: archive, checkpoint,
  now: () => Date.now(), storagePaused: storageBlocked,
  watchRoom: watchRecording, reconcileRoom: room => room.practice ? practice.reconcile(room) : multiplayer.reconcile(room), queueViews: queueRoomViews,
  scheduleRoom: room => {
    if (room.practice) practice.sync(room);
    else { multiplayer.sync(room); roomBots.sync(room); }
    clocks.sync(room);
  },
  queueDirectory: sendDirectory,
});
const submitPlayerAction = createPlayerActionHandler({ engine: observed(Engine, { action: 'action' }), stageRoom: sendRoom,
  storagePaused: storageBlocked, now: () => Date.now(), random: max => crypto.randomInt(max), fingerprintAction });
const automaticPlay = createLegacyAutomaticPlay({ stageRoom: sendRoom });
const botPlanner = require("./bot-planner").createBotPlanner({measure:metrics.record});
const runBot = require("./bot-runner").createBotRunner({planner:botPlanner,dispatch:(job,room)=>dispatchRoom(job,room,'bot'),automaticPlay,active:()=>!stopping,stageRoom:sendRoom,engine:Engine,
  schedule:room=>{if(room.practice)practice.sync(room);else{roomBots.sync(room);multiplayer.sync(room);}},
  onError:()=>console.error("Bot planning deferred; room will retry.")});
const practice = createPracticeController({ rooms, sendRoom, automaticPlay, runBot, dispatch:dispatchRoom, blocked:storageBlocked, onRemove: room => { clocks.cancel(room); archive.capture(room,"Práctica cerrada."); return persist(); } });
const clocks = createGameClock({ rooms, sendRoom, automaticPlay, runBot, dispatch:dispatchRoom, canTick: r => !storageBlocked(r) && (r.practice ? r.practicePausedAt == null && !!r.members[0]?.ws && !r.members[0].ws.closed : r.emptySince == null) });
const multiplayer = createMultiplayerController({ rooms, sendRoom, automaticPlay, runBot, removeRoom, dispatch, blocked:storageBlocked });
const roomBots = createRoomBots({ rooms, sendRoom, automaticPlay, runBot, dispatch:dispatchRoom, blocked:storageBlocked });
function snapshot(r) {
  return { commitment: structuredClone(r.commitment), emptySince:r.emptySince, archiveHash:r.archiveHash,matchId:r.matchId,archiveSeq:r.archiveSeq,archiveFull:r.archiveFull,archiveStartedAt:r.archiveStartedAt,archiveClosedAt:r.archiveClosedAt,_archiveState:r._archiveState,_archiveIdentity:r._archiveIdentity, game: r.game ? structuredClone(r.game) : null, revision: r.revision || 0,
    hostSeat: r.hostSeat, practicePausedAt:r.practicePausedAt, visibility: r.visibility, maxPlayers: r.maxPlayers, mapRef: r.mapRef ? {...r.mapRef} : undefined, timing: r.timing ? {...r.timing} : undefined,
    members: r.members.map(m => ({ member: m, data: { token: m.token || m.ws?.token, tokenHash: m.tokenHash,
      name: m.name, username:m.username, displayName:m.displayName, avatar:m.avatar, participation:structuredClone(m.participation), disconnectedAt:m.disconnectedAt, bot: m.bot, color: m.color, accountId: m.accountId, guestId:m.guestId, actionIds: [...(m.actionIds || [])], actionReceipts: structuredClone(m.actionReceipts || []), autopilot: m.autopilot, autopilotSince: m.autopilotSince, reclaim: m.reclaim, reclaimSerial: m.reclaimSerial } })) };
}
function restoreLocalCheckpoint(e) {
  console.error("Could not persist rooms:", e.message);
  storageFailureAt ??= Date.now();
  for (const r of rooms.values()) {
    const saved = committed.get(r);
    if (saved) {
      r.game = structuredClone(saved.game); r.revision = saved.revision; r.commitment=structuredClone(saved.commitment); r.emptySince=saved.emptySince;
      for(const key of ["archiveHash","matchId","archiveSeq","archiveFull","archiveStartedAt","archiveClosedAt","_archiveState","_archiveIdentity"])r[key]=saved[key];
      watchRecording(r);
      r.hostSeat = saved.hostSeat; r.practicePausedAt=saved.practicePausedAt; r.visibility = saved.visibility; r.maxPlayers = saved.maxPlayers; r.mapRef = saved.mapRef; r.timing = saved.timing;
      for (const member of r.members) if (!saved.members.some(entry => entry.member === member) && member.ws) {
        const peer = member.ws;
        peer.room = null; peer.seat = -1; member.ws = null;
        peer.send({ type: "room_closed", message: "No se pudo guardar tu entrada. Reinténtalo cuando se recupere el servicio." });
      }
      r.members = saved.members.map(({member}) => member);
      for (const [seat, { member, data }] of saved.members.entries()) {
        Object.assign(member, data);
        // A removed peer may already have returned to the directory. Restore
        // its reserved seat without silently attaching that connection again.
        if (member.ws?.room !== r) member.ws = null;
        if (member.ws) member.ws.seat = seat;
        if (member.ws && data.token) member.ws.token = data.token;
      }
    }
    clocks.cancel(r); multiplayer.cancel(r); roomBots.cancel(r);
    for (const member of r.members) member.ws?.send({ type: "storage", paused: true });
  }
  archive.rollback([]);
}
function removeRoom(r, message = "La sala ya no existe.") {
  archive.capture(r,message);
  clocks.cancel(r); multiplayer.cancel(r); roomBots.cancel(r); rooms.delete(r.code);
  for (const m of r.members) if (m.ws) {
    m.ws.send({ type: "room_closed", message }); m.ws.room = null; m.ws.seat = -1; m.ws = null;
  }
  for (const peer of peers) if (peer.watching === r) {
    peer.watching = null; peer.send({ type: "room_closed", message });
  }
  persist();
  sendDirectory(r);
}
const APP_ROUTES = new Set(["/rooms", "/play", "/more", "/profile", "/replay"]);
const nativeClient = require("./native-client");
async function linkGuest(req,res,accountId) {
  const id=guestId(req); if(!id)return;
  try {
    if(remoteStore) { await archive.claim(id,accountId); return; }
    // Read and write local ownership inside the same queue: concurrent sign-ins
    // must never overwrite another guest claim or a newly recorded match.
    await dispatch(()=>{
      const claim=archive.claim(id,accountId),old=archive.state;
      archive.restore({...old,claims:claim.claims});
      if(!persist()){archive.restore(old);throw Error('Guest claim failed');}
    });
  } catch(error) {
    if(error.status===409){ensureGuest(req,res,true);return;}
    throw error;
  }
}
const accountAuth = createAccountAuth({linkGuest,socialPresence:id=>({online:[...rooms.values()].some(r=>r.members.some(m=>m.accountId===id&&m.ws&&!m.ws.closed))}), logoutGuest:(req,res)=>ensureGuest(req,res,true),seats:createAccountSeats({rooms,dispatch,sendRoom,
  unavailable:()=>!storageReady || stopping || storageFailureAt!==null})});
const server = http.createServer(async (req, res) => {
  let url = new URL(req.url, "http://localhost");
  if (nativeClient.handleNativeHttp(req, res, url)) return;
  if (req.method === "GET" && (APP_ROUTES.has(url.pathname)||url.pathname === "/")) ensureGuest(req,res);
  if (await accountAuth.handle(req,res,url)) return;
  if (url.pathname === '/api/stats') {
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
    try {
      if(req.method!=='GET')throw Object.assign(Error('Método no permitido.'),{status:405});
      const Stats=require('./player-statistics'), identity={guestId:guestId(req),accountId:await accountAuth.identify(req,res)}, filters=Stats.filters(url.searchParams);
      const global=remoteStore?await remoteStore.statisticsSnapshot(filters):Stats.snapshot(Object.values(archive.state.matches),archive.state.claims,filters);
      const social=identity.accountId?await accountAuth.socialFor(req,res):null;
      res.end(JSON.stringify(await Stats.overview({archive,identity,params:url.searchParams,social,global})));
    }catch(error){res.statusCode=error.status||503;res.end(JSON.stringify({message:error.status?error.message:'Las estadísticas no están disponibles ahora.'}));}
    return;
  }
  if (url.pathname.startsWith("/api/history")) {
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Content-Type","application/json; charset=utf-8");
    try {
      if(req.method!=="GET") throw Object.assign(Error("Método no permitido."),{status:405});
      const identity={guestId:guestId(req),accountId:await accountAuth.identify(req,res)};
      const path=url.pathname.slice("/api/history".length).replace(/^\//, "").split("/");
      const id=path[0], audit=path[1]==="audit";
      if(path.length>2||path[1]&&!audit)throw Object.assign(Error("Esta repetición no está disponible."),{status:404});
      if(id&&!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(Error("Esta repetición no está disponible."),{status:404});
      if(id){
        const compact=!audit&&req.headers.accept==='application/x-ndjson';
        const source=await archive.replayStream(identity,id,audit,url.searchParams.get("analysis")==="1",compact);
        // Validate the first frame before committing HTTP headers. A later
        // corrupt page closes the response; it can never become a partial replay.
        const first=await source.next();
        if(compact)res.setHeader("Content-Type","application/x-ndjson; charset=utf-8");
        if(audit)res.setHeader("Content-Disposition",`attachment; filename="trencitos-${id}.json"`);
        async function* chunks(){try{if(!first.done)yield first.value;yield* source;}finally{await source.return();}}
        await require('node:stream/promises').pipeline(require('node:stream').Readable.from(chunks()),res);
      }else res.end(JSON.stringify({matches:await archive.list(identity)}));
    } catch(error){if(res.headersSent||res.destroyed){res.destroy();return;}res.statusCode=error.status||503;res.end(JSON.stringify({message:error.status?error.message:"El historial no está disponible ahora."}));}
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end();
  }
  if (APP_ROUTES.has(url.pathname)) url = new URL("/", url);
  if (url.pathname === "/healthz") {
    const ok = storageReady && storageFailureAt === null && !stopping;
    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok, storage: backend, rooms: rooms.size, mobileProtocolVersion: 1, ...(url.searchParams.get("timings")==="1"?{timingsMs:metrics.summary(),runtime:processMetrics.snapshot(),diagnosticsVersion:1,persistenceMode:remoteStore?.perRoom?'room':'checkpoint',pausedRooms:pausedRooms.size}:{}) }));
  }
  servePublicAsset(url.pathname, res);
});
function wsFrame(op, data) {
  let payload = Buffer.isBuffer(data) ? data : Buffer.from(data || "");
  let header =
    payload.length < 126
      ? Buffer.from([128 | op, payload.length])
      : payload.length < 65536
        ? Buffer.from([
            128 | op,
            126,
            payload.length >> 8,
            payload.length & 255,
          ])
        : Buffer.concat([
            Buffer.from([128 | op, 127]),
            Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]),
          ]);
  if (payload.length >= 65536)
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}
function createPeer(socket) {
  const peer = {
    socket,
    buffer: Buffer.alloc(0),
    room: null,
    seat: -1,
    closed: false,
    actions: [],
    lastSeen: Date.now(),
    send(obj) {
      const data = JSON.stringify(obj);
      const deliver = () => output.send(data, this.compactMessages);
      if (durable) durable.defer(deliver); else deliver();
    },
    close(disconnectedAt = Date.now()) {
      if (durable?.mutating) { durable.defer(() => this.close(disconnectedAt)); return; }
      if (!this.closed) {
        output.flush();
        this.closed = true;
        peers.delete(this);
        dispatch(() => detachPeer(this, disconnectedAt));
        try {
          this.socket.end(wsFrame(8, ""));
        } catch (_) {}
      }
    },
  };
  socket.setNoDelay(true);
  const output = createPeerOutput({ write: data => socket.write(data), frame: wsFrame, live: () => !peer.closed && socket.writable });
  peers.add(peer);
  socket.on("data", (chunk) => {
    peer.buffer = Buffer.concat([peer.buffer, chunk]);
    if (peer.buffer.length > 131072) return peer.close();
    while (peer.buffer.length >= 2) {
      const b = peer.buffer,
        opcode = b[0] & 15,
        mask = !!(b[1] & 128);
      if ((b[0] & 0x80) === 0 || (b[0] & 0x70) !== 0 || !mask) return peer.close();
      let n = b[1] & 127,
        h = 2;
      if (n === 126) {
        if (b.length < 4) break;
        n = b.readUInt16BE(2);
        h = 4;
      } else if (n === 127) {
        if (b.length < 10) break;
        const big = b.readBigUInt64BE(2);
        if (big > 65536n) return peer.close();
        n = Number(big);
        h = 10;
      }
      if (n > 65536) return peer.close();
      if (b.length < h + 4 + n) break;
      peer.lastSeen = Date.now();
      const key = b.subarray(h, h + 4),
        pay = Buffer.from(b.subarray(h + 4, h + 4 + n));
      for (let i = 0; i < pay.length; i++) pay[i] ^= key[i % 4];
      peer.buffer = b.subarray(h + 4 + n);
      if (opcode === 8) {
        peer.close();
        return;
      }
      if (opcode === 9) {
        socket.write(wsFrame(10, pay));
        continue;
      }
      if (opcode === 10) continue;
      if (opcode !== 1) return peer.close();
      try {
        const message = JSON.parse(pay.toString("utf8"));
        const kind = message?.type === "action" ? message.action?.type === "draw_train" ? "draw" :
          ["claim", "station", "pay_tunnel"].includes(message.action?.type) ? "build" : "other" : "other";
        const traceId = typeof message?.traceId === 'string' && /^[\w-]{8,80}$/.test(message.traceId) ? message.traceId : null;
        if(message?.type==='retry_save'&&remoteStore?.perRoom&&storageFailureAt===null&&pausedRooms.has(peer.room?.code)){
          void recoverRoom(peer);continue;
        }
        const expectedRoom = message?.type === 'action' ? peer.room : null;
        dispatch(() => {
          if(peer.closed)return;
          if(expectedRoom && peer.room!==expectedRoom)return deny(peer,'Tu sala cambió. Reconecta antes de repetir la acción.','STALE_SESSION');
          onMessage(peer,message);
        }, kind, traceId ? timing => { if (!peer.closed) peer.send({ type: 'timing', id: traceId, timing }); } : undefined, expectedRoom?.code??null);
      } catch (e) {
        peer.send({ type: "error", message: "Mensaje mal formado." });
      }
    }
  });
  socket.on("close", () => {
    peers.delete(peer);
    peer.closed = true;
    dispatch(() => detachPeer(peer));
  });
  // An upgraded HTTP socket can remain half-open after a client FIN. End our
  // side immediately instead of waiting for the next heartbeat/deploy timeout.
  socket.on("end", () => peer.close());
  socket.on("error", () => {});
  return peer;
}
function detachPeer(peer, disconnectedAt = Date.now()) {
  peer.watching = null;
  const r = peer.room;
  if (!r || r.members[peer.seat]?.ws !== peer) return;
  r.members[peer.seat].ws = null;
  r.members[peer.seat].disconnectedAt = disconnectedAt;
  if (r.practice) practice.disconnected(r, disconnectedAt);
  sendRoom(r);
}
function watchRecording(r) {
  if(r.game) {
    let seen=r.game.eventSerial||0;
    Engine.observe(r.game,event=>{
      const build=r.game.events?.findLast(e=>e.id>seen&&e.type==='build');seen=r.game.eventSerial||seen;
      require('../game/application/construction-pause').pauseForConstruction(r.game,build,Date.now());
      r.archiveAction={...event,actor:r.members[event.seat]?.bot?"bot":r.members[event.seat]?.autopilot?"replacement":event.automatic?"timer":"player"};archive.capture(r);
    });
  }
}
function queueRoomViews(r) {
  r.members.forEach((m, i) => {
    if (!m.ws || m.ws.closed) return;
    m.ws.send(projections.lobby(r, i, { token: m.ws.token || m.token }));
    m.ws.send({ type: "storage", paused: storageBlocked(r), requiresRestart: !!remoteStore && (!remoteStore.perRoom || storageFailureAt!==null) });
    if (r.game) m.ws.send(projections.state(r, i, { storagePaused: storageBlocked(r) }));
  });
  for (const peer of peers) if (peer.watching === r) sendSpectator(peer, r);
}
const directorySnapshot = new Map();
function sendDirectory(changedRoom) {
  if(!remoteStore?.perRoom){
    const message={type:'directory',rooms:storageFailureAt===null?Directory.listRooms(rooms):[],unavailable:storageFailureAt!==null};
    for(const peer of peers)if(peer.directory)peer.send(message);
    return;
  }
  // Capture only this transaction's candidate. Publish it into the directory
  // cache after its commit; never inspect another room's in-flight mutation.
  const entries = changedRoom ? Directory.listRooms(new Map(rooms.has(changedRoom.code)&&!storageBlocked(changedRoom)?[[changedRoom.code,changedRoom]]:[])) :
    Directory.listRooms(new Map([...rooms].filter(([,room])=>!storageBlocked(room))));
  durable.defer(()=>{
    if(changedRoom){directorySnapshot.delete(changedRoom.code);if(entries[0])directorySnapshot.set(changedRoom.code,entries[0]);}
    else {directorySnapshot.clear();for(const entry of entries)directorySnapshot.set(entry.code,entry);}
    const message={type:'directory',rooms:storageFailureAt===null?[...directorySnapshot.values()]:[],unavailable:storageFailureAt!==null};
    for(const peer of peers)if(peer.directory)peer.send(message);
  });
}
function sendSpectator(peer, r) {
  if (!Directory.isPublic(r) || !r.game) {
    peer.watching = null; peer.send({ type: "room_closed", message: "Esta partida ya no está disponible para observar." }); return;
  }
  peer.send(projections.lobby(r, -1));
  peer.send(projections.state(r, -1, { storagePaused: storageBlocked(r) }));
}
function deny(peer, msg, code) {
  peer.send({ type: "error", message: msg, code });
}
function enteringIdentity(peer,msg,room) {
  const profile=msg.accountTicket?accountAuth.roomProfile(msg.accountTicket,peer.guestId):null;
  if(msg.accountTicket&&!profile)throw Error('Tu acceso caducó. Vuelve a entrar a la sala.');
  if(profile&&room.members.some(m=>m.accountId===profile.id))throw Error('Tu cuenta ya tiene un puesto en esta sala.');
  let name=profile?.username;
  if(!name){do{name='guest_'+crypto.randomBytes(3).toString('hex');}while(room.members.some(m=>m.name===name));}
  return {name,username:name,displayName:profile?profile.displayName:cleanName(msg.name),avatar:profile?.avatar||(ProfileRules.avatars.includes(msg.avatar)?msg.avatar:'person'),accountId:profile?.id,
    color:LobbyUI.freeColor(room.members,profile?.color||msg.color,profile?profile.secondaryColor:msg.secondaryColor)};
}
function onMessage(peer, msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg))
    return deny(peer, "Mensaje incorrecto.");
  let now = Date.now();
  peer.actions = peer.actions.filter((t) => now - t < 10000);
  peer.actions.push(now);
  if (peer.actions.length > 45) return deny(peer, "Demasiadas acciones.");
  if (msg.type === "ping") {
    peer.send({ type: "pong" });
    return;
  }
  if (msg.type === "list_rooms") { peer.compactMessages = [1,2].includes(msg.compactMessages) ? msg.compactMessages : 0; peer.directory = true; sendDirectory(); return; }
  if (msg.type === "spectate") {
    if (peer.room) return deny(peer, "Sal de tu sala antes de observar otra partida.");
    const code = String(msg.code || "").trim().toUpperCase(), r = rooms.get(code);
    if (!r || !Directory.isPublic(r) || !r.game || r.emptySince != null)
      return deny(peer, "Esta partida no está disponible para observar.", "ROOM_NOT_FOUND");
    peer.watching = r; sendSpectator(peer, r); return;
  }
  if (peer.watching) {
    if (msg.type === "leave") { peer.watching = null; peer.send({ type: "room_closed" }); return; }
    return deny(peer, "Estás observando. No puedes modificar la partida.", "SPECTATOR_READ_ONLY");
  }
  if(msg.type==='leave'&&remoteStore?.perRoom&&pausedRooms.has(peer.room?.code)){
    const member=peer.room.members[peer.seat];if(member?.ws===peer)member.ws=null;
    peer.room=null;peer.seat=-1;peer.send({type:'room_closed',preserveIdentity:true});return;
  }
  if (msg.type === "retry_save" && peer.room && storageBlocked(peer.room)) {
    if (remoteStore) return deny(peer, "El guardado remoto requiere reiniciar el servidor y reconectar para recuperar el checkpoint.", "STORAGE_FAILED");
    const elapsed = Date.now() - storageFailureAt;
    const absenceTimes = new Map();
    for (const r of rooms.values()) {
      absenceTimes.set(r, { emptySince: r.emptySince, commitment: structuredClone(r.commitment), autopilotTimes:r.members.map(m=>m.autopilotSince), members: r.members.map(m => m.disconnectedAt) });
      shiftDeadlines(r.game, elapsed);
      Commitment.shift(r, elapsed);
      if (r.emptySince != null) r.emptySince += elapsed;
      r.members.forEach(m => { if (m.disconnectedAt != null) m.disconnectedAt += elapsed; });
    }
    if (persist()) {
      storageFailureAt = null;
      for (const r of rooms.values()) sendRoom(r);
    } else {
      for (const [r, times] of absenceTimes) {
        r.emptySince = times.emptySince;
        r.commitment = times.commitment;
        r.members.forEach((m,i)=>m.autopilotSince=times.autopilotTimes[i]);
        r.members.forEach((m, i) => m.disconnectedAt = times.members[i]);
      }
      deny(peer, "El guardado sigue fallando. La partida permanece pausada.", "STORAGE_FAILED");
    }
    return;
  }
  if (storageBlocked(peer.room) && !["join", "leave"].includes(msg.type))
    return deny(peer, "Partida pausada: no se pudo guardar. Reintenta el guardado.", "STORAGE_FAILED");
  if (["create", "create_test"].includes(msg.type) && !peer.room) {
    let mapRef;
    try { mapRef = selectMap(msg.mapRef); }
    catch { return deny(peer, "El mapa o su versión no están disponibles.", "INVALID_ROOM_MAP"); }
    if (msg.visibility !== undefined && !["public", "private"].includes(msg.visibility)) return deny(peer, "Visibilidad inválida.");
    if (msg.maxPlayers !== undefined && (!Number.isInteger(msg.maxPlayers) || msg.maxPlayers < 2 || msg.maxPlayers > 5)) return deny(peer, "Elige entre 2 y 5 jugadores.");
    if (msg.timing !== undefined && !GameTiming.valid(msg.timing)) return deny(peer, "Configuración de tiempos inválida.");
    if (msg.color !== undefined && !LobbyUI.isColor(msg.color)) return deny(peer, "Color inválido.", "INVALID_COLOR");
    let code = msg.type === "create" ? msg.code : undefined;
    if (code !== undefined) {
      if (!LobbyUI.isNewCode(code)) return deny(peer, "El código debe tener entre 6 y 10 números.", "INVALID_CODE");
      if (rooms.has(code)) return deny(peer, "Ese código ya está en uso. Elige otro o genera uno nuevo.", "CODE_TAKEN");
    } else do { code = LobbyUI.randomCode(crypto.randomInt); } while (rooms.has(code));
    const r = { code, hostSeat: 0, updated: Date.now(), game: null, mapRef, members: [], revision: 0,
      visibility: msg.type === "create_test" ? "private" : msg.visibility || "public", maxPlayers: msg.maxPlayers || 5, timing: GameTiming.normalize(msg.timing) };
    rooms.set(code, r);
    let identity;try{identity=enteringIdentity(peer,msg,r);}catch(error){rooms.delete(r.code);return deny(peer,error.message);}
    const human = {...identity,token:crypto.randomBytes(24).toString('hex')};
    if (msg.type === "create_test") {
      r.practice = true; r.archiveFull=true; human.guestId=peer.guestId;
      peer.room = r;
      peer.seat = 0;
      human.ws = peer;
      peer.token = human.token;
      r.members = [human, ...[1, 2, 3].map((i) => ({ name: `Bot ${i}`, bot: true }))];
      const colors = LobbyUI.restoreColors(r.members);
      r.members.forEach((m, i) => { m.color = colors[i]; });
      r.game = startRoomGame(r);
      return sendRoom(r);
    }
    return attach(peer, r, human);
  }
  if (msg.type === "join" && !peer.room) {
    const code = String(msg.code || "")
        .toUpperCase()
        .trim(),
      r = rooms.get(code);
    if (!LobbyUI.isJoinCode(code)) return deny(peer, "Introduce un código de sala válido.", "INVALID_CODE");
    if (!r || (r.practice && practice.expired(r)))
      return deny(peer, "La sala ya no existe. Puedes crear una partida nueva.", "ROOM_NOT_FOUND");
    if (!r.practice && !storageBlocked(r)) multiplayer.reconcile(r);
    if (rooms.get(code) !== r) return deny(peer, "La partida fue abandonada.", "ROOM_NOT_FOUND");
    if (msg.token) {
      const tokenHash = typeof msg.token === "string" ? hashToken(msg.token) : "";
      const index = r.members.findIndex((m) => !m.bot && (m.tokenHash === tokenHash || m.token === msg.token));
      if (index >= 0) {
        if (r.members[index].participation?.definitive) return deny(peer, "Abandonaste definitivamente esta partida.", "SEAT_ABANDONED");
        let prev = r.members[index].ws;
        if (prev && prev !== peer) {
          prev.send({ type: "session_replaced" });
          prev.room = null; prev.seat = -1;
          prev.close();
        }
        peer.room = r;
        peer.seat = index;
        peer.token = msg.token;
        r.members[index].ws = peer;
        r.members[index].guestId ||= peer.guestId;
        if (!r.practice && r.game) multiplayer.requestControl(r, index);
        return sendRoom(r);
      }
      return deny(peer, "Enlace privado inválido o revocado. Usa tu enlace vigente.", "INVALID_TOKEN");
    }
    if (r.practice) return deny(peer, "La sala de pruebas es solo para su creador.");
    if (r.game)
      return deny(
        peer,
        "La partida ya comenzó. Solo pueden reconectarse quienes estaban dentro.",
      );
    if (r.members.length >= Directory.capacity(r)) return deny(peer, "La sala está completa.", "ROOM_FULL");
    if (msg.color !== undefined && !LobbyUI.isColor(msg.color)) return deny(peer, "Color inválido.", "INVALID_COLOR");
    let identity;try{identity=enteringIdentity(peer,msg,r);}catch(error){return deny(peer,error.message);}
    return attach(peer,r,{...identity,token:crypto.randomBytes(24).toString('hex')});
  }
  if (!peer.room) return deny(peer, "Crea o únete primero a una sala.");
  const r = peer.room;
  if (rooms.get(r.code) !== r) { peer.room = null; return deny(peer, "La sala ya no existe.", "ROOM_NOT_FOUND"); }
  if (r.members[peer.seat]?.ws !== peer)
    return deny(peer, "Esta sesión fue reemplazada por otra conexión.");
  if (msg.type === "room_settings" || msg.type === "add_bot") {
    if (r.practice || r.game || peer.seat !== (r.hostSeat ?? 0)) return deny(peer, "Solo el anfitrión puede configurar la sala antes de empezar.", "HOST_ONLY");
    if (msg.type === "add_bot") {
      if (r.members.length >= Directory.capacity(r)) return deny(peer, "La sala está llena. No puedes añadir más bots.", "ROOM_FULL");
      let n = 1; while (r.members.some(m => m.name === `Bot ${n}`)) n++;
      const availableColors = LobbyUI.PALETTE.filter(({ color }) => !r.members.some(member => member.color === color));
      r.members.push({ name: `Bot ${n}`, bot: true, color: availableColors[crypto.randomInt(availableColors.length)].color });
    } else {
      if (!["public", "private"].includes(msg.visibility) || !Number.isInteger(msg.maxPlayers) || msg.maxPlayers < 2 || msg.maxPlayers > 5)
        return deny(peer, "Elige una visibilidad y una capacidad de 2 a 5 jugadores.");
      if (msg.maxPlayers < r.members.length) return deny(peer, "Retira participantes antes de reducir las plazas.");
      if (msg.timing !== undefined && !GameTiming.valid(msg.timing)) return deny(peer, "Configuración de tiempos inválida.");
      let mapRef;
      try { mapRef = selectMap(msg.mapRef === undefined ? r.mapRef : msg.mapRef); }
      catch { return deny(peer, "El mapa o su versión no están disponibles.", "INVALID_ROOM_MAP"); }
      r.mapRef = mapRef;
      r.visibility = msg.visibility; r.maxPlayers = msg.maxPlayers;
      r.timing = GameTiming.normalize(msg.timing || r.timing);
    }
    if (!sendRoom(r)) deny(peer, "No se pudo guardar la configuración de la sala.", "STORAGE_FAILED");
    return;
  }
  if (msg.type === "select_color") {
    if (r.game) return deny(peer, "Solo puedes cambiar de color antes de empezar.", "COLOR_LOCKED");
    if (!LobbyUI.isColor(msg.color)) return deny(peer, "Color inválido.", "INVALID_COLOR");
    if (r.members.some((m, i) => i !== peer.seat && m.color === msg.color))
      return deny(peer, "Ese color ya está ocupado. Elige otro.", "COLOR_TAKEN");
    r.members[peer.seat].color = msg.color;
    if (!sendRoom(r)) deny(peer, "No se pudo guardar el color. Reintenta cuando vuelva la conexión.", "STORAGE_FAILED");
    return;
  }
  if (["leave", "abandon"].includes(msg.type) && !r.practice) {
    if (soloWithBots(r)) return removeRoom(r, "Abandonaste la partida con bots.");
    if (!r.game) multiplayer.removeSeat(r, peer.seat);
    else {
      const leavingSeat = peer.seat;
      if (msg.type === "abandon") Commitment.abandon(r, leavingSeat);
      r.members[peer.seat].autopilot = true;
      r.members[peer.seat].autopilotSince ??= Date.now();
      r.members[peer.seat].reclaim = false;
      r.members[peer.seat].ws = null;
      r.members[peer.seat].disconnectedAt = Date.now();
      if (r.hostSeat === leavingSeat) r.hostSeat = r.members.findIndex(m => m.ws && !m.ws.closed);
      peer.room = null; peer.seat = -1;
      peer.send({ type: "room_closed", preserveIdentity: msg.type !== "abandon", message: msg.type === "abandon" ? "Abandonaste definitivamente la partida. Puedes consultar sus resultados en tu historial." : "Saliste. Puedes recuperar tu puesto con tu enlace privado mientras la partida exista." });
    }
    if (rooms.has(r.code)) sendRoom(r);
    return;
  }
  if (msg.type === "kick" && !r.practice) {
    if (r.game || peer.seat !== (r.hostSeat ?? 0) || !Number.isInteger(msg.seat) || msg.seat === peer.seat || !r.members[msg.seat])
      return deny(peer, "Solo el anfitrión puede retirar a otro participante antes de empezar.");
    multiplayer.removeSeat(r, msg.seat, "El anfitrión te retiró de la sala."); sendRoom(r); return;
  }
  if (msg.type === "reclaim" && r.game && !r.practice) {
    multiplayer.requestControl(r, peer.seat); sendRoom(r); return;
  }
  if (msg.type === "rotate_token" && !r.practice) {
    peer.token = crypto.randomBytes(24).toString("hex");
    r.members[peer.seat].token = peer.token;
    r.members[peer.seat].tokenHash = hashToken(peer.token);
    sendRoom(r); return;
  }
  if (msg.type === "rematch" && !r.practice) {
    if (r.game?.phase !== "finished") return deny(peer, "La revancha está disponible al terminar.");
    if (!rooms.has(r.rematchCode)) {
      let code; do { code = LobbyUI.randomCode(crypto.randomInt); } while (rooms.has(code));
      r.rematchCode = code;
      rooms.set(code, { code, updated: Date.now(), hostSeat: 0, members: [], game: null, mapRef:roomMapReference(r), revision: 0,
        visibility: r.visibility || "private", maxPlayers: Directory.capacity(r), timing: GameTiming.normalize(r.game?.timing || r.timing) });
    }
    const next = rooms.get(r.rematchCode), member = r.members[peer.seat];
    if (next.game) return deny(peer, "La revancha ya empezó. Crea otra sala desde el inicio.");
    member.ws = null; member.disconnectedAt = Date.now();
    peer.send({ type: "room_closed", preserveIdentity: true }); peer.room = null; peer.seat = -1;
    sendRoom(r);
    return attach(peer, next, { name: member.name, username:member.username, displayName:member.displayName, avatar:member.avatar, accountId:member.accountId, color: LobbyUI.freeColor(next.members, member.color), token: crypto.randomBytes(24).toString("hex") });
  }
  if (msg.type === "finish_test" || msg.type === "leave_test") {
    if (!r.practice || peer.seat !== 0)
      return deny(peer, "Este control solo está disponible en tu sala de pruebas.");
    if (msg.type === "finish_test") practice.finish(r);
    else practice.remove(r);
    return;
  }
  if (msg.type === "start") {
    if (peer.seat !== (r.hostSeat ?? 0)) return deny(peer, "Solo el anfitrión puede iniciar.");
    if (r.game) return deny(peer, "La partida ya comenzó.");
    if (r.members.length < 2)
      return deny(peer, "Se necesitan al menos dos jugadores.");
    if (r.members.some((m) => !m.bot && (!m.ws || m.ws.closed)))
      return deny(peer, "Todos deben estar conectados para iniciar.");
    r.archiveFull=true;
    r.game = startRoomGame(r);
    Commitment.initialize(r);
    return sendRoom(r);
  }
  if (msg.type === "action") {
    const result = submitPlayerAction(r, peer.seat, {
      commandId: msg.id, expectedRevision: msg.revision, action: msg.action, after: msg.after, chainDraws: msg.chainDraws,
    });
    // In remote mode peer.send stages the reply until the outer dispatch commits.
    peer.send({ ...actionReply(result), ...(result.status === 'rejected' && typeof msg.id === 'string' ? { id: msg.id } : {}) });
    return;
  }
  deny(peer, "Acción desconocida.");
}
function attach(peer, r, m) {
  peer.room = r;
  peer.seat = r.members.length;
  m.ws = peer;
  m.guestId ||= peer.guestId;
  peer.token = m.token;
  m.tokenHash = hashToken(m.token);
  r.members.push(m);
  if (!sendRoom(r)) {
    if (!committed.has(r)) {
      rooms.delete(r.code); peer.room = null; peer.seat = -1; m.ws = null;
      peer.send({ type: "room_closed", message: "No se pudo guardar la sala. Reinténtalo cuando se recupere el servicio." });
    }
    deny(peer, "No se pudo guardar tu entrada a la sala.", "STORAGE_FAILED");
  }
}
function startRoomGame(r) {
  const game = Engine.newRandomGame(r.members.map(m => m.name), Date.now(), crypto.randomInt, GameTiming.normalize(r.timing), {mapRef:roomMapReference(r)});
  game.players.forEach((player, i) => { player.color = r.members[i].color; });
  return game;
}
function cleanName(s) {
  return (
    [...String(s ?? "").replace(/[<>"'&\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "").trim()].slice(0,20).join("")
  );
}
server.on("upgrade", (req, socket) => {
  if (!storageReady || stopping) { socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); return; }
  const key = req.headers["sec-websocket-key"];
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    socket.destroy();
    return;
  }
  const expectedHost = req.headers["x-forwarded-host"] || req.headers.host;
  let originHost;
  try {
    originHost = req.headers.origin ? new URL(req.headers.origin).host : null;
  } catch {
    originHost = "invalid";
  }
  const native = nativeClient.isNativeRequest(req);
  if (native ? !nativeClient.nativeToken(req) : originHost && originHost !== expectedHost) {
    socket.destroy();
    return;
  }
  if (
    url.pathname !== "/socket" ||
    !key ||
    req.headers.upgrade?.toLowerCase() !== "websocket" ||
    Buffer.from(key, "base64").length !== 16
  ) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
      accept +
      "\r\n" + (native ? `Sec-WebSocket-Protocol: ${nativeClient.PROTOCOL}\r\n` : "") + "\r\n",
  );
  createPeer(socket).guestId=guestId(req);
});
// WebSocket protocol pings are answered by the browser even in a background tab.
// For a silent network failure, count absence from the last response, not from
// detection, so the stale socket cannot keep a practice room alive indefinitely.
const heartbeat = setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.practice) continue;
    const peer = r.members[0]?.ws;
    if (!peer || peer.closed) continue;
    if (Date.now() - peer.lastSeen >= 10000) peer.close(peer.lastSeen);
    else peer.socket.write(wsFrame(9, ""));
  }
}, 5000);
heartbeat.unref();
// Multiplayer keeps its longer reconnect window; practice uses the timer above.
const multiplayerHeartbeat = setInterval(() => {
  for (const peer of peers) {
    if (peer.closed || peer.room?.practice) continue;
    if (Date.now() - peer.lastSeen > 70000) {
      peer.close(peer.lastSeen);
      continue;
    }
    try {
      peer.socket.write(wsFrame(9, ""));
    } catch {
      peer.close();
    }
  }
}, 25000);
multiplayerHeartbeat.unref();
server.on("close", () => {
  stopping = true;
  processMetrics.close();
  clearInterval(heartbeat);
  clearInterval(multiplayerHeartbeat);
  practice.close();
  clocks.close();
  multiplayer.close();
  roomBots.close(); botPlanner.close();
});
const cleanup = setInterval(
  () => dispatch(() => {
    if (storageFailureAt !== null) return;
    for (const [key, r] of rooms)
      if (!r.practice && Date.now() - r.updated > TTL) {
        removeRoom(r, "La sala caducó tras 24 horas sin actividad.");
      }
  }),
  60 * 60 * 1000,
);
cleanup.unref();
server.on("close", () => clearInterval(cleanup));
const ready = (remoteStore ? remoteStore.load().then(restoreLoaded) : Promise.resolve()).then(async () => {
  await archive.bootstrap(rooms);
  await dispatch(()=>{for(const room of rooms.values())archive.capture(room);if(rooms.size||(!remoteStore&&Object.keys(archive.state.matches).length))persist();});
  storageReady = true;
  for (const room of rooms.values()) { watchRecording(room); if(room.practice)practice.sync(room);else{multiplayer.sync(room);roomBots.sync(room);} clocks.sync(room); }
});
async function shutdown() {
  if (stopping) return;
  await dispatch(()=>{
    for (const room of rooms.values()) if(room.practice) room.practicePausedAt ??= Date.now();
    persist();
    practice.close();
  });
  stopping = true; clocks.close(); multiplayer.close(); roomBots.close();
  // Finish an in-flight durable commit, then disconnect without recording a
  // voluntary abandonment. The next process restores the saved clock budget.
  await durable?.idle();
  await botPlanner.close();
  for (const peer of peers) peer.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
function start() {
  ready.then(() => server.listen(PORT, "0.0.0.0", () =>
    console.log(`Trencitos: http://localhost:${PORT} · storage=${backend}`),
  )).catch(() => { console.error("No se pudo cargar el almacenamiento. Comprueba la configuración y la migración SQL; no se sobrescribieron partidas."); process.exitCode = 1; });
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}
if (require.main === module) start();
module.exports = { server, rooms, ready, shutdown, start, drain: () => durable?.idle() || Promise.resolve() };
