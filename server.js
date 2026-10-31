"use strict";
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const Engine = require("./engine");
const { createPracticeController } = require("./practice");
const { createGameClock } = require("./game-clock");
const { createMultiplayerController, shiftDeadlines, GRACE_MS } = require("./multiplayer");
const { hashToken, loadRooms, saveRooms } = require("./room-store");
const { createSupabaseStore } = require("./supabase-store");
const { createDurableQueue } = require("./durable-queue");
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
      r.emptySince = Date.now();
      r.members.forEach((m) => { m.ws = null; m.disconnectedAt = Date.now(); });
      rooms.set(r.code, r);
    }
  }
}
if (!remoteStore) restoreLoaded(loadRooms(STORE));
let storageFailureAt = null;
const committed = new WeakMap();
for (const r of rooms.values()) committed.set(r, snapshot(r));
function captureRuntime() {
  return { failureAt: storageFailureAt,
    rooms: [...rooms.values()].map(r => ({ room: r, data: { ...r, game: r.game ? structuredClone(r.game) : null },
      members: r.members.map(member => ({ member, data: { ...member, actionIds: [...(member.actionIds || [])] } })) })),
    peers: [...peers].map(peer => ({ peer, room: peer.room, seat: peer.seat, token: peer.token })) };
}
function restoreRuntime(saved) {
  for (const r of rooms.values()) { clocks.cancel(r); multiplayer.cancel(r); }
  rooms.clear();
  for (const { room, data, members } of saved.rooms) {
    for (const key of Object.keys(room)) delete room[key];
    Object.assign(room, data);
    room.members = members.map(({ member, data }) => {
      for (const key of Object.keys(member)) delete member[key];
      return Object.assign(member, data);
    });
    rooms.set(room.code, room);
  }
  for (const { peer, room, seat, token } of saved.peers) Object.assign(peer, { room, seat, token });
  storageFailureAt = saved.failureAt;
}
const durable = remoteStore ? createDurableQueue({ capture: captureRuntime, restore: restoreRuntime,
  commit: () => remoteStore.save(rooms),
  onFailure: error => {
    console.error("Remote storage paused:", error.code || "INTERNAL");
    storageFailureAt ??= Date.now();
    for (const r of rooms.values()) if (!r.practice) { clocks.cancel(r); multiplayer.cancel(r); }
    for (const peer of peers) if (!peer.room?.practice) {
      peer.send({ type: "storage", paused: true, requiresRestart: true });
      peer.send({ type: "error", code: "STORAGE_FAILED", message: "No se pudo confirmar el guardado. La partida está pausada; reinicia el servidor y reconecta para recuperar el estado guardado." });
      if (peer.room?.game) peer.send({ type: "state", game: { ...Engine.view(peer.room.game, peer.seat), revision: peer.room.revision || 0, storagePaused: true } });
    }
  },
}) : null;
const dispatch = job => stopping ? undefined : durable ? durable.run(() => { if (!stopping) job(); }) : job();
const practice = createPracticeController({ rooms, sendRoom, dispatch, onRemove: room => clocks.cancel(room) });
const clocks = createGameClock({ rooms, sendRoom, dispatch, canTick: r => r.practice || (storageFailureAt === null && r.emptySince == null),
  expireGame: r => { const changed = Engine.expire(r.game); if (changed) r.revision = (r.revision || 0) + 1; return changed; } });
const multiplayer = createMultiplayerController({ rooms, sendRoom, removeRoom, dispatch,
  blocked: () => storageFailureAt !== null,
  expireGame: r => { if (!Engine.expire(r.game)) return false; r.revision = (r.revision || 0) + 1; sendRoom(r, true); return true; },
  performAction: (r, seat, action) => { try { Engine.action(r.game, seat, action); r.revision = (r.revision || 0) + 1; sendRoom(r, true); } catch (e) { console.error("Replacement bot:", e.message); } } });
function snapshot(r) {
  return { game: r.game ? structuredClone(r.game) : null, revision: r.revision || 0,
    members: r.members.map(m => ({ member: m, data: { token: m.token || m.ws?.token, tokenHash: m.tokenHash,
      actionIds: [...(m.actionIds || [])], autopilot: m.autopilot, reclaim: m.reclaim, reclaimSerial: m.reclaimSerial } })) };
}
function persist() {
  if (remoteStore) {
    for (const r of rooms.values()) if (!r.practice) r.savedAt = Date.now();
    durable.dirty();
    return true; // State and acknowledgements are still held by the queue.
  }
  try {
    for (const r of rooms.values()) if (!r.practice) r.savedAt = Date.now();
    saveRooms(STORE, rooms);
    for (const r of rooms.values()) if (!r.practice) committed.set(r, snapshot(r));
    return true;
  } catch (e) {
    console.error("Could not persist rooms:", e.message);
    storageFailureAt ??= Date.now();
    for (const r of rooms.values()) if (!r.practice) {
      const saved = committed.get(r);
      if (saved) {
        r.game = structuredClone(saved.game); r.revision = saved.revision;
        for (const { member, data } of saved.members) if (r.members.includes(member)) {
          Object.assign(member, data);
          if (member.ws && data.token) member.ws.token = data.token;
        }
      }
      clocks.cancel(r); multiplayer.cancel(r);
      for (const member of r.members) member.ws?.send({ type: "storage", paused: true });
    }
    return false;
  }
}
function removeRoom(r, message = "La sala ya no existe.") {
  clocks.cancel(r); multiplayer.cancel(r); rooms.delete(r.code);
  for (const m of r.members) if (m.ws) {
    m.ws.send({ type: "room_closed", message }); m.ws.room = null; m.ws.seat = -1; m.ws = null;
  }
  if (!r.practice) persist();
}
const TYPES = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8",
  "/style.css": "text/css; charset=utf-8",
  "/data.js": "text/javascript; charset=utf-8",
  "/map-layout.js": "text/javascript; charset=utf-8",
  "/game-ui.js": "text/javascript; charset=utf-8",
  "/game.css": "text/css; charset=utf-8",
};
const server = http.createServer((req, res) => {
  let url = new URL(req.url, "http://localhost");
  if (req.method !== "GET") {
    res.writeHead(405);
    return res.end();
  }
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
  fs.createReadStream(path.join(ROOT, file)).pipe(res);
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
  const r = peer.room;
  if (!r || r.members[peer.seat]?.ws !== peer) return;
  r.members[peer.seat].ws = null;
  r.members[peer.seat].disconnectedAt = disconnectedAt;
  if (r.practice) practice.disconnected(r, disconnectedAt);
  sendRoom(r);
}
function sendRoom(r, automatic = false) {
  if (rooms.get(r.code) !== r) return;
  if (!automatic) r.updated = Date.now();
  if (!r.practice && storageFailureAt === null) multiplayer.reconcile(r);
  if (rooms.get(r.code) !== r) return;
  if (r.game) Engine.ensureTiming(r.game);
  r.savedAt = Date.now();
  if (!r.practice && storageFailureAt === null) persist();
  r.members.forEach((m, i) => {
    if (!m.ws || m.ws.closed) return;
    m.ws.send({
      type: "lobby",
      code: r.code,
      seat: i,
      token: m.ws.token || m.token,
      host: i === (r.hostSeat ?? 0),
      started: !!r.game,
      practice: !!r.practice,
      sessionVersion: 1,
      members: r.members.map((x, j) => ({
        name: x.name,
        connected: !!x.bot || !!(x.ws && !x.ws.closed),
        bot: !!x.bot,
        host: j === (r.hostSeat ?? 0),
        autopilot: !!x.autopilot,
        reclaim: !!x.reclaim,
        seat: j,
      })),
    });
    m.ws.send({ type: "storage", paused: !r.practice && storageFailureAt !== null, requiresRestart: !!remoteStore });
    if (r.game) m.ws.send({ type: "state", game: { ...Engine.view(r.game, i), earlyFinish: !!r.earlyFinish,
      revision: r.revision || 0, storagePaused: !r.practice && storageFailureAt !== null } });
  });
  if (r.practice) practice.sync(r);
  else multiplayer.sync(r);
  clocks.sync(r);
  return r.practice || storageFailureAt === null;
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
  if (msg.type === "retry_save" && peer.room && !peer.room.practice && storageFailureAt !== null) {
    if (remoteStore) return deny(peer, "El guardado remoto requiere reiniciar el servidor y reconectar para recuperar el checkpoint.", "STORAGE_FAILED");
    const elapsed = Date.now() - storageFailureAt;
    const absenceTimes = new Map();
    for (const r of rooms.values()) if (!r.practice) {
      absenceTimes.set(r, { emptySince: r.emptySince, members: r.members.map(m => m.disconnectedAt) });
      shiftDeadlines(r.game, elapsed);
      if (r.emptySince != null) r.emptySince += elapsed;
      r.members.forEach(m => { if (m.disconnectedAt != null) m.disconnectedAt += elapsed; });
    }
    if (persist()) {
      storageFailureAt = null;
      for (const r of rooms.values()) if (!r.practice) sendRoom(r);
    } else {
      for (const [r, times] of absenceTimes) {
        r.emptySince = times.emptySince;
        r.members.forEach((m, i) => m.disconnectedAt = times.members[i]);
      }
      deny(peer, "El guardado sigue fallando. La partida permanece pausada.", "STORAGE_FAILED");
    }
    return;
  }
  if (storageFailureAt !== null && !peer.room?.practice && !["join", "leave", "create_test"].includes(msg.type))
    return deny(peer, "Partida pausada: no se pudo guardar. Reintenta el guardado.", "STORAGE_FAILED");
  if (["create", "create_test"].includes(msg.type) && !peer.room) {
    let code;
    do {
      code = crypto
        .randomInt(36 ** 6)
        .toString(36)
        .toUpperCase()
        .padStart(6, "0");
    } while (rooms.has(code));
    const r = { code, hostSeat: 0, updated: Date.now(), game: null, members: [], revision: 0 };
    rooms.set(code, r);
    const human = {
      name: cleanName(msg.name),
      token: crypto.randomBytes(24).toString("hex"),
    };
    if (msg.type === "create_test") {
      r.practice = true;
      peer.room = r;
      peer.seat = 0;
      human.ws = peer;
      peer.token = human.token;
      r.members = [human, ...[1, 2, 3].map((i) => ({ name: `Bot ${i}`, bot: true }))];
      r.game = Engine.newRandomGame(r.members.map((m) => m.name));
      return sendRoom(r);
    }
    return attach(peer, r, human);
  }
  if (msg.type === "join" && !peer.room) {
    const code = String(msg.code || "")
        .toUpperCase()
        .trim(),
      r = rooms.get(code);
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
    if (r.members.length >= 5) return deny(peer, "La sala está completa.");
    return attach(peer, r, {
      name: cleanName(msg.name),
      token: crypto.randomBytes(24).toString("hex"),
    });
  }
  if (!peer.room) return deny(peer, "Crea o únete primero a una sala.");
  const r = peer.room;
  if (rooms.get(r.code) !== r) { peer.room = null; return deny(peer, "La sala ya no existe.", "ROOM_NOT_FOUND"); }
  if (r.members[peer.seat]?.ws !== peer)
    return deny(peer, "Esta sesión fue reemplazada por otra conexión.");
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
      let code; do { code = crypto.randomInt(36 ** 6).toString(36).toUpperCase().padStart(6, "0"); } while (rooms.has(code));
      r.rematchCode = code;
      rooms.set(code, { code, updated: Date.now(), hostSeat: 0, members: [], game: null, revision: 0 });
    }
    const next = rooms.get(r.rematchCode), member = r.members[peer.seat];
    if (next.game) return deny(peer, "La revancha ya empezó. Crea otra sala desde el inicio.");
    member.ws = null; member.disconnectedAt = Date.now();
    peer.send({ type: "room_closed", preserveIdentity: true }); peer.room = null; peer.seat = -1;
    sendRoom(r);
    return attach(peer, next, { name: member.name, token: crypto.randomBytes(24).toString("hex") });
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
    if (r.members.some((m) => !m.ws || m.ws.closed))
      return deny(peer, "Todos deben estar conectados para iniciar.");
    r.game = Engine.newRandomGame(r.members.map((m) => m.name));
    return sendRoom(r);
  }
  if (msg.type === "action") {
    if (!r.game) return deny(peer, "La partida aún no empieza.");
    const member = r.members[peer.seat];
    if (msg.id !== undefined && (typeof msg.id !== "string" || !/^[\w-]{8,80}$/.test(msg.id))) return deny(peer, "Identificador de acción inválido.");
    if (msg.id && member.actionIds?.includes(msg.id)) {
      sendRoom(r); peer.send({ type: "ack", id: msg.id }); return;
    }
    if (!r.practice && Engine.expire(r.game)) { r.revision = (r.revision || 0) + 1; sendRoom(r, true); }
    if (storageFailureAt !== null && !r.practice) return deny(peer, "No se pudo guardar.", "STORAGE_FAILED");
    if (member.autopilot) return deny(peer, "El bot controla tu puesto. Pulsa Recuperar control.");
    // Private choices are independent: simultaneous confirmations must not
    // invalidate one another. Their pending/offer ID checks live in the engine.
    const privateChoice = ["choose_initial", "keep_tickets"].includes(msg.action?.type);
    if (!privateChoice && msg.revision !== undefined && msg.revision !== (r.revision || 0)) {
      sendRoom(r); return deny(peer, "La mesa cambió. Revisa la jugada e inténtalo otra vez.", "STALE_ACTION");
    }
    try {
      Engine.action(r.game, peer.seat, msg.action);
      r.revision = (r.revision || 0) + 1;
      if (msg.id) member.actionIds = [...(member.actionIds || []), msg.id].slice(-128);
      if (sendRoom(r)) peer.send({ type: "ack", id: msg.id });
      else deny(peer, "La acción no se guardó y no fue aplicada. Partida pausada.", "STORAGE_FAILED");
    } catch (e) {
      sendRoom(r); // Expiration may have resolved a deadline before rejecting a late action.
      deny(peer, e.message);
    }
    return;
  }
  deny(peer, "Acción desconocida.");
}
function attach(peer, r, m) {
  peer.room = r;
  peer.seat = r.members.length;
  m.ws = peer;
  peer.token = m.token;
  m.tokenHash = hashToken(m.token);
  r.members.push(m);
  sendRoom(r);
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
  createPeer(socket);
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
const ready = (remoteStore ? remoteStore.load().then(restoreLoaded) : Promise.resolve()).then(() => {
  storageReady = true;
  for (const room of rooms.values()) { multiplayer.sync(room); clocks.sync(room); }
});
async function shutdown() {
  if (stopping) return;
  stopping = true; clocks.close(); multiplayer.close();
  // Finish an in-flight durable commit, then disconnect without recording a
  // voluntary abandonment. The next process restores the saved clock budget.
  await durable?.idle();
  for (const peer of peers) peer.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
if (require.main === module) {
  ready.then(() => server.listen(PORT, "0.0.0.0", () =>
    console.log(`Ferrovía Europa: http://localhost:${PORT} · storage=${backend}`),
  )).catch(() => { console.error("No se pudo cargar el almacenamiento. Comprueba la configuración y la migración SQL; no se sobrescribieron partidas."); process.exitCode = 1; });
  process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
}
module.exports = { server, rooms, ready, shutdown, drain: () => durable?.idle() || Promise.resolve() };
