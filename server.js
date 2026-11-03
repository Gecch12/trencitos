"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const Engine = require("./engine");
const { createPlayerActionHandler } = require("./game/application/player-action");
const { actionReply } = require("./game/compat/legacy-action-reply");
const { createLegacyAutomaticPlay } = require("./game/compat/legacy-automatic-play");
const { createCheckpointHandler } = require("./game/application/checkpoint");
const { createRoomStager } = require("./game/application/room-stage");
const { createFileCheckpointCommitter, createRemoteCheckpointCommitter } = require("./game/infrastructure/checkpoint-committer");
const GameTiming = require("./game-timing");
const {createMatchArchive,safePublic}=require("./match-archive");
const {guestId,ensureGuest}=require("./guest-identity");
const LobbyUI = require("./lobby-ui");
const { createPracticeController } = require("./practice");
const { createGameClock } = require("./game-clock");
const { createMultiplayerController, shiftDeadlines, GRACE_MS } = require("./multiplayer");
const { hashToken, loadState } = require("./room-store");
const { createSupabaseStore } = require("./supabase-store");
const { createDurableQueue } = require("./durable-queue");
const { createAccountAuth } = require("./account-auth");
const { createAccountSeats } = require("./account-seats");
const Directory = require("./room-directory");
const { createRoomBots } = require("./room-bots");
const PORT = Number(process.env.PORT || 3000),
  ROOT = __dirname;
const STORE = process.env.STATE_FILE || path.join(ROOT, "room-state.json");
const backend = process.env.STATE_BACKEND || "file";
if (!["file", "supabase"].includes(backend)) throw new Error("STATE_BACKEND debe ser file o supabase.");
if (process.env.RENDER === "true" && backend !== "supabase")
  throw new Error("Render requiere STATE_BACKEND=supabase; no se guardarán partidas en su disco efímero.");
const remoteStore = backend === "supabase" ? createSupabaseStore({ url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY }) : null;
let storageReady = !remoteStore, stopping = false;
const TTL = 24 * 60 * 60 * 1000,
  rooms = new Map(),
  peers = new Set();
function restoreLoaded(data) {
  for (const r of data) {
    if (!r.practice && Date.now() - r.updated < TTL) {
      if (r.emptySince != null && Date.now() - r.emptySince >= GRACE_MS) continue;
      shiftDeadlines(r.game, Math.max(0, Date.now() - (r.savedAt || Date.now())));
      if (r.game) Engine.normalize(r.game);
      r.emptySince = Date.now();
      const colors = LobbyUI.restoreColors(r.members, r.game?.players);
      r.members.forEach((m, i) => { m.color = colors[i]; m.ws = null; m.disconnectedAt = Date.now(); });
      rooms.set(r.code, r);
    }
  }
}
const initialState=remoteStore?null:loadState(STORE);
const archive=createMatchArchive({remote:remoteStore,saved:initialState?.archive});
if (!remoteStore) restoreLoaded(Array.isArray(initialState)?initialState:initialState.rooms);
let storageFailureAt = null;
const committed = new WeakMap();
for (const r of rooms.values()) committed.set(r, snapshot(r));
function captureRuntime() {
  return { failureAt: storageFailureAt, archivePending:archive.snapshot(),
    rooms: [...rooms.values()].map(r => ({ room: r, data: { ...r, game: r.game ? structuredClone(r.game) : null },
      members: r.members.map(member => ({ member, data: { ...member, actionIds: [...(member.actionIds || [])] } })) })),
    peers: [...peers].map(peer => ({ peer, room: peer.room, watching: peer.watching, seat: peer.seat, token: peer.token })) };
}
function restoreRuntime(saved) {
  archive.rollback(saved.archivePending);
  for (const r of rooms.values()) { clocks.cancel(r); multiplayer.cancel(r); roomBots.cancel(r); }
  rooms.clear();
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
  storageFailureAt = saved.failureAt;
}
const checkpoint = createCheckpointHandler({ repository: rooms,
  committer: remoteStore ? createRemoteCheckpointCommitter({ store: remoteStore, archive }) : createFileCheckpointCommitter({ file: STORE, archive }),
  now: () => Date.now(), deferCommit: remoteStore ? () => durable.dirty() : null,
  onLocalCommit: () => { for (const room of rooms.values()) committed.set(room, snapshot(room)); },
  onLocalFailure: restoreLocalCheckpoint,
});
const persist = checkpoint.persist;
const durable = remoteStore ? createDurableQueue({ capture: captureRuntime, restore: restoreRuntime,
  commit: checkpoint.commit,
  onFailure: error => {
    console.error("Remote storage paused:", error.code || "INTERNAL");
    storageFailureAt ??= Date.now();
    for (const r of rooms.values()) { clocks.cancel(r); multiplayer.cancel(r); roomBots.cancel(r); }
    for (const peer of peers) {
      peer.send({ type: "storage", paused: true, requiresRestart: true });
      peer.send({ type: "error", code: "STORAGE_FAILED", message: "No se pudo confirmar el guardado. La partida está pausada; reinicia el servidor y reconecta para recuperar el estado guardado." });
      if (peer.room?.game) peer.send({ type: "state", game: { ...Engine.view(peer.room.game, peer.seat), revision: peer.room.revision || 0, storagePaused: true } });
    }
  },
}) : null;
const dispatch = job => stopping ? undefined : durable ? durable.run(() => { if (!stopping) job(); }) : job();
const sendRoom = createRoomStager({ repository: rooms, engine: Engine, history: archive, checkpoint,
  now: () => Date.now(), storagePaused: () => storageFailureAt !== null,
  watchRoom: watchRecording, reconcileRoom: room => multiplayer.reconcile(room), queueViews: queueRoomViews,
  scheduleRoom: room => {
    if (room.practice) practice.sync(room);
    else { multiplayer.sync(room); roomBots.sync(room); }
    clocks.sync(room);
  },
  queueDirectory: sendDirectory,
});
const submitPlayerAction = createPlayerActionHandler({ engine: Engine, stageRoom: sendRoom,
  storagePaused: () => storageFailureAt !== null, now: () => Date.now(), random: max => crypto.randomInt(max) });
const automaticPlay = createLegacyAutomaticPlay({ stageRoom: sendRoom });
const practice = createPracticeController({ rooms, sendRoom, automaticPlay, dispatch, blocked:()=>storageFailureAt!==null, onRemove: room => { clocks.cancel(room); archive.capture(room,"Práctica cerrada."); return persist(); } });
const clocks = createGameClock({ rooms, sendRoom, automaticPlay, dispatch, canTick: r => storageFailureAt === null && (r.practice || r.emptySince == null) });
const multiplayer = createMultiplayerController({ rooms, sendRoom, automaticPlay, removeRoom, dispatch, blocked: () => storageFailureAt !== null });
const roomBots = createRoomBots({ rooms, sendRoom, automaticPlay, dispatch, blocked: () => storageFailureAt !== null });
function snapshot(r) {
  return { archiveHash:r.archiveHash,matchId:r.matchId,archiveSeq:r.archiveSeq,archiveFull:r.archiveFull,archiveStartedAt:r.archiveStartedAt,archiveClosedAt:r.archiveClosedAt,_archiveState:r._archiveState, game: r.game ? structuredClone(r.game) : null, revision: r.revision || 0,
    hostSeat: r.hostSeat, visibility: r.visibility, maxPlayers: r.maxPlayers, timing: r.timing ? {...r.timing} : undefined,
    members: r.members.map(m => ({ member: m, data: { token: m.token || m.ws?.token, tokenHash: m.tokenHash,
      name: m.name, bot: m.bot, color: m.color, accountId: m.accountId, guestId:m.guestId, actionIds: [...(m.actionIds || [])], autopilot: m.autopilot, reclaim: m.reclaim, reclaimSerial: m.reclaimSerial } })) };
}
function restoreLocalCheckpoint(e) {
  console.error("Could not persist rooms:", e.message);
  storageFailureAt ??= Date.now();
  for (const r of rooms.values()) {
    const saved = committed.get(r);
    if (saved) {
      r.game = structuredClone(saved.game); r.revision = saved.revision;
      for(const key of ["archiveHash","matchId","archiveSeq","archiveFull","archiveStartedAt","archiveClosedAt","_archiveState"])r[key]=saved[key];
      watchRecording(r);
      r.hostSeat = saved.hostSeat; r.visibility = saved.visibility; r.maxPlayers = saved.maxPlayers; r.timing = saved.timing;
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
  sendDirectory();
}
const TYPES = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/privacy.html": "text/html; charset=utf-8",
  "/privacy.css": "text/css; charset=utf-8",
  "/board-3d.js": "text/javascript; charset=utf-8",
  "/wagon-renderer.js": "text/javascript; charset=utf-8",
  "/wagon-preview.js": "text/javascript; charset=utf-8",
  "/wagon-models.mjs": "text/javascript; charset=utf-8",
  "/board-camera.js": "text/javascript; charset=utf-8",
  "/board-3d.css": "text/css; charset=utf-8",
  "/vendor/three.module.js": "text/javascript; charset=utf-8",
  "/vendor/three.core.js": "text/javascript; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8",
  "/style.css": "text/css; charset=utf-8",
  "/data.js": "text/javascript; charset=utf-8",
  "/map-layout.js": "text/javascript; charset=utf-8",
  "/game-timing.js": "text/javascript; charset=utf-8",
  "/game-ui.js": "text/javascript; charset=utf-8",
  "/game.css": "text/css; charset=utf-8",
  "/responsive.css": "text/css; charset=utf-8",
  "/lobby.css": "text/css; charset=utf-8",
  "/lobby-ui.js": "text/javascript; charset=utf-8",
  "/account-ui.js": "text/javascript; charset=utf-8",
  "/translations.js": "text/javascript; charset=utf-8",
  "/replay-state.js": "text/javascript; charset=utf-8",
  "/history-ui.js": "text/javascript; charset=utf-8",
  "/i18n.js": "text/javascript; charset=utf-8",
  "/shell.js": "text/javascript; charset=utf-8",
  "/shell.css": "text/css; charset=utf-8",
  "/shell-icons.js": "text/javascript; charset=utf-8",
};
const APP_ROUTES = new Set(["/rooms", "/play", "/more", "/profile", "/replay"]);
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
const accountAuth = createAccountAuth({linkGuest, logoutGuest:(req,res)=>ensureGuest(req,res,true),seats:createAccountSeats({rooms,dispatch,sendRoom,
  unavailable:()=>!storageReady || stopping || storageFailureAt!==null})});
const server = http.createServer(async (req, res) => {
  let url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && (APP_ROUTES.has(url.pathname)||url.pathname === "/")) ensureGuest(req,res);
  if (await accountAuth.handle(req,res,url)) return;
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
      const data=id?await archive.replay(identity,id,audit):{matches:await archive.list(identity)};
      if(audit)res.setHeader("Content-Disposition",`attachment; filename="trencitos-${id}.json"`);
      res.end(JSON.stringify(data));
    } catch(error){res.statusCode=error.status||503;res.end(JSON.stringify({message:error.status?error.message:"El historial no está disponible ahora."}));}
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
    return res.end(JSON.stringify({ ok, storage: backend, rooms: rooms.size }));
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const asset = /^assets\/(?:cards\/[a-z]+|favicon|ticket)\.svg$/.test(file);
  if ((!TYPES[url.pathname] && !asset) || (asset && !fs.existsSync(path.join(ROOT, file)))) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": asset ? "image/svg+xml; charset=utf-8" : TYPES[url.pathname],
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; connect-src 'self' ws: wss:; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  const served = file === "vendor/three.module.js" || file === "vendor/three.core.js"
    ? path.join(ROOT, "node_modules/three/build", path.basename(file)) : path.join(ROOT, file);
  const stream = fs.createReadStream(served);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
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
      const deliver = () => { if (!this.closed && this.socket.writable) this.socket.write(wsFrame(1, data)); };
      if (durable) durable.defer(deliver); else deliver();
    },
    close(disconnectedAt = Date.now()) {
      if (durable?.mutating) { durable.defer(() => this.close(disconnectedAt)); return; }
      if (!this.closed) {
        this.closed = true;
        peers.delete(this);
        dispatch(() => detachPeer(this, disconnectedAt));
        try {
          this.socket.end(wsFrame(8, ""));
        } catch (_) {}
      }
    },
  };
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
        dispatch(() => { if (!peer.closed) onMessage(peer, message); });
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
  if(r.game) Engine.observe(r.game,event=>{r.archiveAction={...event,actor:r.members[event.seat]?.bot?"bot":r.members[event.seat]?.autopilot?"replacement":event.automatic?"timer":"player"};archive.capture(r);});
}
function queueRoomViews(r) {
  r.members.forEach((m, i) => {
    if (!m.ws || m.ws.closed) return;
    m.ws.send({
      type: "lobby",
      matchId:r.matchId,
      code: r.code,
      seat: i,
      token: m.ws.token || m.token,
      host: i === (r.hostSeat ?? 0),
      started: !!r.game,
      practice: !!r.practice,
      visibility: Directory.isPublic(r) ? "public" : "private",
      maxPlayers: Directory.capacity(r), timing: GameTiming.normalize(r.timing),
      sessionVersion: 1,
      members: r.members.map((x, j) => ({
        name: x.name,
        color: x.color,
        connected: !!x.bot || !!(x.ws && !x.ws.closed),
        bot: !!x.bot,
        host: j === (r.hostSeat ?? 0),
        autopilot: !!x.autopilot,
        reclaim: !!x.reclaim,
        seat: j,
      })),
    });
    m.ws.send({ type: "storage", paused: storageFailureAt !== null, requiresRestart: !!remoteStore });
    if (r.game) m.ws.send({ type: "state", game: { ...Engine.view(r.game, i), earlyFinish: !!r.earlyFinish,
      revision: r.revision || 0, storagePaused: storageFailureAt !== null } });
  });
  for (const peer of peers) if (peer.watching === r) sendSpectator(peer, r);
}
function sendDirectory() {
  const message = { type: "directory", rooms: storageFailureAt === null ? Directory.listRooms(rooms) : [], unavailable: storageFailureAt !== null };
  for (const peer of peers) if (peer.directory) peer.send(message);
}
function sendSpectator(peer, r) {
  if (!Directory.isPublic(r) || !r.game) {
    peer.watching = null; peer.send({ type: "room_closed", message: "Esta partida ya no está disponible para observar." }); return;
  }
  peer.send({ type: "lobby", code: r.code, seat: -1, spectator: true, host: false, started: true,
    sessionVersion: 1, visibility: "public", maxPlayers: Directory.capacity(r), timing: GameTiming.normalize(r.timing),
    members: r.members.map(m => ({ name: m.name, color: m.color, bot: !!m.bot, connected: !!m.bot || !!(m.ws && !m.ws.closed), autopilot: !!m.autopilot })) });
  peer.send({ type: "state", game: { ...safePublic(Engine.view(r.game, -1)), revision: r.revision || 0, storagePaused: storageFailureAt !== null } });
}
function deny(peer, msg, code) {
  peer.send({ type: "error", message: msg, code });
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
  if (msg.type === "list_rooms") { peer.directory = true; sendDirectory(); return; }
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
  if (msg.type === "retry_save" && peer.room && storageFailureAt !== null) {
    if (remoteStore) return deny(peer, "El guardado remoto requiere reiniciar el servidor y reconectar para recuperar el checkpoint.", "STORAGE_FAILED");
    const elapsed = Date.now() - storageFailureAt;
    const absenceTimes = new Map();
    for (const r of rooms.values()) {
      absenceTimes.set(r, { emptySince: r.emptySince, members: r.members.map(m => m.disconnectedAt) });
      shiftDeadlines(r.game, elapsed);
      if (r.emptySince != null) r.emptySince += elapsed;
      r.members.forEach(m => { if (m.disconnectedAt != null) m.disconnectedAt += elapsed; });
    }
    if (persist()) {
      storageFailureAt = null;
      for (const r of rooms.values()) sendRoom(r);
    } else {
      for (const [r, times] of absenceTimes) {
        r.emptySince = times.emptySince;
        r.members.forEach((m, i) => m.disconnectedAt = times.members[i]);
      }
      deny(peer, "El guardado sigue fallando. La partida permanece pausada.", "STORAGE_FAILED");
    }
    return;
  }
  if (storageFailureAt !== null && !["join", "leave"].includes(msg.type))
    return deny(peer, "Partida pausada: no se pudo guardar. Reintenta el guardado.", "STORAGE_FAILED");
  if (["create", "create_test"].includes(msg.type) && !peer.room) {
    if (msg.visibility !== undefined && !["public", "private"].includes(msg.visibility)) return deny(peer, "Visibilidad inválida.");
    if (msg.maxPlayers !== undefined && (!Number.isInteger(msg.maxPlayers) || msg.maxPlayers < 2 || msg.maxPlayers > 5)) return deny(peer, "Elige entre 2 y 5 jugadores.");
    if (msg.timing !== undefined && !GameTiming.valid(msg.timing)) return deny(peer, "Configuración de tiempos inválida.");
    if (msg.color !== undefined && !LobbyUI.isColor(msg.color)) return deny(peer, "Color inválido.", "INVALID_COLOR");
    let code = msg.type === "create" ? msg.code : undefined;
    if (code !== undefined) {
      if (!LobbyUI.isNewCode(code)) return deny(peer, "El código debe tener entre 6 y 10 números.", "INVALID_CODE");
      if (rooms.has(code)) return deny(peer, "Ese código ya está en uso. Elige otro o genera uno nuevo.", "CODE_TAKEN");
    } else do { code = LobbyUI.randomCode(crypto.randomInt); } while (rooms.has(code));
    const r = { code, hostSeat: 0, updated: Date.now(), game: null, members: [], revision: 0,
      visibility: msg.type === "create_test" ? "private" : msg.visibility || "public", maxPlayers: msg.maxPlayers || 5, timing: GameTiming.normalize(msg.timing) };
    rooms.set(code, r);
    const human = {
      name: cleanName(msg.name),
      color: LobbyUI.freeColor([], msg.color),
      token: crypto.randomBytes(24).toString("hex"),
    };
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
    if (!r.practice && storageFailureAt === null) multiplayer.reconcile(r);
    if (rooms.get(code) !== r) return deny(peer, "La partida fue abandonada.", "ROOM_NOT_FOUND");
    if (msg.token) {
      const tokenHash = typeof msg.token === "string" ? hashToken(msg.token) : "";
      const index = r.members.findIndex((m) => !m.bot && (m.tokenHash === tokenHash || m.token === msg.token));
      if (index >= 0) {
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
    return attach(peer, r, {
      name: cleanName(msg.name),
      color: LobbyUI.freeColor(r.members, msg.color),
      token: crypto.randomBytes(24).toString("hex"),
    });
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
  if (msg.type === "leave" && !r.practice) {
    if (!r.game) multiplayer.removeSeat(r, peer.seat);
    else {
      const leavingSeat = peer.seat;
      r.members[peer.seat].autopilot = true;
      r.members[peer.seat].reclaim = false;
      r.members[peer.seat].ws = null;
      r.members[peer.seat].disconnectedAt = Date.now();
      if (r.hostSeat === leavingSeat) r.hostSeat = r.members.findIndex(m => m.ws && !m.ws.closed);
      peer.room = null; peer.seat = -1;
      peer.send({ type: "room_closed", preserveIdentity: true, message: "Saliste. Puedes recuperar tu puesto con tu enlace privado mientras la partida exista." });
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
      rooms.set(code, { code, updated: Date.now(), hostSeat: 0, members: [], game: null, revision: 0,
        visibility: r.visibility || "private", maxPlayers: Directory.capacity(r), timing: GameTiming.normalize(r.game?.timing || r.timing) });
    }
    const next = rooms.get(r.rematchCode), member = r.members[peer.seat];
    if (next.game) return deny(peer, "La revancha ya empezó. Crea otra sala desde el inicio.");
    member.ws = null; member.disconnectedAt = Date.now();
    peer.send({ type: "room_closed", preserveIdentity: true }); peer.room = null; peer.seat = -1;
    sendRoom(r);
    return attach(peer, next, { name: member.name, accountId:member.accountId, color: LobbyUI.freeColor(next.members, member.color), token: crypto.randomBytes(24).toString("hex") });
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
    return sendRoom(r);
  }
  if (msg.type === "action") {
    const result = submitPlayerAction(r, peer.seat, {
      commandId: msg.id, expectedRevision: msg.revision, action: msg.action,
    });
    // In remote mode peer.send stages the reply until the outer dispatch commits.
    peer.send(actionReply(result));
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
  const game = Engine.newRandomGame(r.members.map(m => m.name), Date.now(), crypto.randomInt, GameTiming.normalize(r.timing));
  game.players.forEach((player, i) => { player.color = r.members[i].color; });
  return game;
}
function cleanName(s) {
  return (
    String(s || "Jugador")
      .replace(/[<>"'&]/g, "")
      .trim()
      .slice(0, 24) || "Jugador"
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
  if (originHost && originHost !== expectedHost) {
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
      "\r\n\r\n",
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
      peer.close();
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
  clearInterval(heartbeat);
  clearInterval(multiplayerHeartbeat);
  practice.close();
  clocks.close();
  multiplayer.close();
  roomBots.close();
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
  for (const room of rooms.values()) { watchRecording(room); multiplayer.sync(room); clocks.sync(room); roomBots.sync(room); }
});
async function shutdown() {
  if (stopping) return;
  await dispatch(()=>practice.close());
  stopping = true; clocks.close(); multiplayer.close(); roomBots.close();
  // Finish an in-flight durable commit, then disconnect without recording a
  // voluntary abandonment. The next process restores the saved clock budget.
  await durable?.idle();
  for (const peer of peers) peer.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (require.main === module) {
  ready.then(() => server.listen(PORT, "0.0.0.0", () =>
    console.log(`Trencitos: http://localhost:${PORT} · storage=${backend}`),
  )).catch(() => { console.error("No se pudo cargar el almacenamiento. Comprueba la configuración y la migración SQL; no se sobrescribieron partidas."); process.exitCode = 1; });
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}
module.exports = { server, rooms, ready, shutdown, drain: () => durable?.idle() || Promise.resolve() };
