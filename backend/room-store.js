"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");
// A small atomic manifest commits rooms and the exact prefix of each replay.
// Uncommitted tails are ignored after a crash and truncated on the next append.
const checkpoints = new Map();
const archivePath = (file, id) => path.join(file + ".archive", hashToken(id) + ".jsonl");
function readArchive(file, archive) {
  const matches = {};
  for (const [id, record] of Object.entries(archive.matches)) {
    const { frameStore, ...match } = record;
    if (!frameStore || !Number.isSafeInteger(frameStore.bytes) || frameStore.bytes < 0 || !Number.isSafeInteger(frameStore.count) || frameStore.count < 0) throw Error("Archivo de repetición inválido");
    const target = archivePath(file, id), fd = fs.openSync(target, "r");
    let data;
    try {
      const actual = fs.fstatSync(fd).size;
      if (actual < frameStore.bytes)
        throw Object.assign(Error(`Repetición incompleta: ${target}; se esperaban ${frameStore.bytes} bytes y hay ${actual}.`), { code: "INCOMPLETE_REPLAY" });
      data = Buffer.alloc(frameStore.bytes);
      let read = 0;
      while (read < data.length) {
        const n = fs.readSync(fd, data, read, data.length - read, read);
        if (!n) throw Object.assign(Error(`Repetición incompleta: ${target}; se esperaban ${data.length} bytes y se leyeron ${read}.`), { code: "INCOMPLETE_REPLAY" });
        read += n;
      }
    } finally { fs.closeSync(fd); }
    match.frames = data.toString("utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    if (match.frames.length !== frameStore.count)
      throw Object.assign(Error(`Repetición incompleta: ${target}; se esperaban ${frameStore.count} pasos y hay ${match.frames.length}.`), { code: "INCOMPLETE_REPLAY" });
    matches[id] = match;
  }
  return { matches, claims: archive.claims };
}
function writeDurable(file, data) {
  const fd = fs.openSync(file, "w", 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function serializableRoom(room) {
  const { code, updated, game, hostSeat = 0, revision = 0, emptySince, savedAt, rematchCode, visibility = "private", maxPlayers = 5, timing, mapRef } = room;
  return { code, updated, game, hostSeat, revision, emptySince, savedAt, rematchCode, visibility, maxPlayers, timing, mapRef, commitment:room.commitment,
    ...(room.practice ? {practice:true,practicePausedAt:room.practicePausedAt} : {}),
    matchId:room.matchId,archiveHash:room.archiveHash,archiveSeq:room.archiveSeq,archiveFull:room.archiveFull,archiveStartedAt:room.archiveStartedAt,archiveClosedAt:room.archiveClosedAt,
    members: room.members.map(({ name, username, displayName, avatar, participation, color, accountId, guestId, token, tokenHash, bot, autopilot, autopilotSince, reclaim, reclaimSerial, disconnectedAt, actionIds, actionReceipts }) =>
      ({ name, username, displayName, avatar, participation, color, accountId, guestId, bot: !!bot, tokenHash: tokenHash || (token ? hashToken(token) : undefined), autopilot, autopilotSince, reclaim, reclaimSerial, disconnectedAt, actionIds, actionReceipts })) };
}
function loadState(file) {
  file = path.resolve(file);
  function read(candidate) {
    const raw = fs.readFileSync(candidate, "utf8"), data = JSON.parse(raw);
    if (data && !Array.isArray(data) && Object.hasOwn(data,"version") && data.version !== 2)
      throw Object.assign(new Error("Versión de almacenamiento local no compatible; se conservan los archivos."),{code:"UNSUPPORTED_STORAGE_VERSION"});
    validateRooms(Array.isArray(data)?data:data.rooms);
    const result = data.version === 2 ? { rooms: data.rooms, archive: readArchive(file, data.archive) } : data;
    checkpoints.set(file, { raw, manifests: data.version === 2 ? data.archive.matches : {} });
    return result;
  }
  try { return read(file); }
  catch (error) {
    // A newer format is not corruption: never downgrade to an older backup.
    if (error.code === "UNSUPPORTED_STORAGE_VERSION") throw error;
    if (error.code === "ENOENT" && !fs.existsSync(file) && !fs.existsSync(file + ".bak")) {
      checkpoints.set(file, { raw: null, manifests: {} });
      return {rooms:[],archive:{matches:{},claims:{}}};
    }
    try { const saved = read(file + ".bak"); console.error("Recuperando partidas desde la copia de seguridad."); return saved; }
    catch (backupError) {
      if (backupError.code === "UNSUPPORTED_STORAGE_VERSION") throw backupError;
      // JSON parser messages can include private save contents. Report the
      // location and type of failure, never a fragment of the stored payload.
      const detail = cause => cause instanceof SyntaxError ? "JSON inválido." : cause.message;
      throw Object.assign(new Error(`No se pudo leer el estado ni su copia. Se conservan los archivos para recuperación.\nEstado (${file}): ${detail(error)}\nCopia (${file}.bak): ${detail(backupError)}`), { code: "STATE_LOAD_FAILED" });
    }
  }
}
function loadRooms(file) { const data=loadState(file); return Array.isArray(data)?data:data.rooms; }
function validateRooms(data) {
  if (!Array.isArray(data) || data.some(r => !r || !r.code || !Array.isArray(r.members) || r.members.length > 5))
    throw new Error("Formato de partidas inválido");
}
function saveRooms(file, rooms, archive) {
  return saveCheckpoint(file, { rooms: [...rooms.values()].map(serializableRoom), archive });
}
function saveCheckpoint(file, { rooms: records, archive }) {
  file = path.resolve(file);
  if (!checkpoints.has(file)) loadState(file);
  const checkpoint = checkpoints.get(file);
  const manifests = {};
  if (archive) {
    fs.mkdirSync(file + ".archive", { recursive: true, mode: 0o700 });
    for (const [id, { frames, ...match }] of Object.entries(archive.matches)) {
      const prior = checkpoint.manifests[id]?.frameStore || { bytes: 0, count: 0 };
      if (frames.length < prior.count) throw Error("No se puede acortar una repetición confirmada");
      let bytes = prior.bytes;
      if (frames.length > prior.count || !checkpoint.manifests[id]) {
        const target = archivePath(file, id);
        const fd = fs.openSync(target, fs.existsSync(target) ? "r+" : "w+", 0o600);
        try {
          if (fs.fstatSync(fd).size < prior.bytes) throw Error("Repetición incompleta");
          fs.ftruncateSync(fd, prior.bytes);
          // Only new frames are serialized. Completed matches cost O(1).
          const data = Buffer.from(frames.slice(prior.count).map(frame => JSON.stringify(frame) + "\n").join(""));
          let written = 0;
          while (written < data.length) written += fs.writeSync(fd, data, written, data.length - written, prior.bytes + written);
          fs.fsyncSync(fd); bytes += data.length;
        } finally { fs.closeSync(fd); }
      }
      manifests[id] = { ...match, frameStore: { bytes, count: frames.length } };
    }
  }
  const data = JSON.stringify(archive ? { version: 2, rooms: records, archive: { matches: manifests, claims: archive.claims } } : records);
  const temp = file + ".tmp";
  writeDurable(temp, data);
  // Cache only verified/committed manifests; no repeated parse of old history.
  if (checkpoint.raw !== null) {
    writeDurable(file + ".bak.tmp", checkpoint.raw);
    fs.renameSync(file + ".bak.tmp", file + ".bak");
  }
  fs.renameSync(temp, file);
  checkpoints.set(file, { raw: data, manifests });
}
module.exports = { loadState, hashToken, loadRooms, saveRooms, saveCheckpoint, serializableRoom, validateRooms };
