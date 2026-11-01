"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

function serializableRoom(room) {
  const { code, updated, game, hostSeat = 0, revision = 0, emptySince, savedAt, rematchCode, visibility = "private", maxPlayers = 5 } = room;
  return { code, updated, game, hostSeat, revision, emptySince, savedAt, rematchCode, visibility, maxPlayers,
    matchId:room.matchId,archiveHash:room.archiveHash,archiveSeq:room.archiveSeq,archiveFull:room.archiveFull,archiveStartedAt:room.archiveStartedAt,archiveClosedAt:room.archiveClosedAt,
    members: room.members.map(({ name, color, accountId, guestId, token, tokenHash, bot, autopilot, reclaim, reclaimSerial, disconnectedAt, actionIds }) =>
      ({ name, color, accountId, guestId, bot: !!bot, tokenHash: tokenHash || (token ? hashToken(token) : undefined), autopilot, reclaim, reclaimSerial, disconnectedAt, actionIds })) };
}
function loadState(file) {
  function read(candidate) {
    const data = JSON.parse(fs.readFileSync(candidate, "utf8"));
    validateRooms(Array.isArray(data)?data:data.rooms);
    return data;
  }
  try { return read(file); }
  catch (error) {
    if (error.code === "ENOENT" && !fs.existsSync(file + ".bak")) return {rooms:[],archive:{matches:{},claims:{}}};
    try { const saved = read(file + ".bak"); console.error("Recuperando partidas desde la copia de seguridad."); return saved; }
    catch { throw new Error("No se pudo leer el estado ni su copia. Se conservan los archivos para recuperación."); }
  }
}
function loadRooms(file) { const data=loadState(file); return Array.isArray(data)?data:data.rooms; }
function validateRooms(data) {
  if (!Array.isArray(data) || data.some(r => !r || !r.code || !Array.isArray(r.members) || r.members.length > 5))
    throw new Error("Formato de partidas inválido");
}
function saveRooms(file, rooms, archive) {
  const records=[...rooms.values()].filter(r=>!r.practice).map(serializableRoom);
  const data = JSON.stringify(archive?{rooms:records,archive}:records);
  const temp = file + ".tmp";
  const fd = fs.openSync(temp, "w", 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // Back up only a readable snapshot, never replace the backup with corruption.
  if (fs.existsSync(file)) {
    let valid = false;
    try { const old=JSON.parse(fs.readFileSync(file, "utf8")); valid=Array.isArray(old)||Array.isArray(old.rooms); } catch {}
    if (valid) fs.copyFileSync(file, file + ".bak");
  }
  fs.renameSync(temp, file);
}
module.exports = { loadState, hashToken, loadRooms, saveRooms, serializableRoom, validateRooms };
