"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");

function serializableRoom(room) {
  const { code, updated, game, hostSeat = 0, revision = 0, emptySince, savedAt, rematchCode } = room;
  return { code, updated, game, hostSeat, revision, emptySince, savedAt, rematchCode,
    members: room.members.map(({ name, color, accountId, token, tokenHash, autopilot, reclaim, reclaimSerial, disconnectedAt, actionIds }) =>
      ({ name, color, accountId, tokenHash: tokenHash || (token ? hashToken(token) : undefined), autopilot, reclaim, reclaimSerial, disconnectedAt, actionIds })) };
}
function loadRooms(file) {
  function read(candidate) {
    const data = JSON.parse(fs.readFileSync(candidate, "utf8"));
    validateRooms(data);
    return data;
  }
  try { return read(file); }
  catch (error) {
    if (error.code === "ENOENT" && !fs.existsSync(file + ".bak")) return [];
    try { const saved = read(file + ".bak"); console.error("Recuperando partidas desde la copia de seguridad."); return saved; }
    catch { throw new Error("No se pudo leer el estado ni su copia. Se conservan los archivos para recuperación."); }
  }
}
function validateRooms(data) {
  if (!Array.isArray(data) || data.some(r => !r || !r.code || !Array.isArray(r.members) || r.members.length > 5))
    throw new Error("Formato de partidas inválido");
}
function saveRooms(file, rooms) {
  const data = JSON.stringify([...rooms.values()].filter(r => !r.practice).map(serializableRoom));
  const temp = file + ".tmp";
  const fd = fs.openSync(temp, "w", 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  // Back up only a readable snapshot, never replace the backup with corruption.
  if (fs.existsSync(file)) {
    let valid = false;
    try { valid = Array.isArray(JSON.parse(fs.readFileSync(file, "utf8"))); } catch {}
    if (valid) fs.copyFileSync(file, file + ".bak");
  }
  fs.renameSync(temp, file);
}
module.exports = { hashToken, loadRooms, saveRooms, serializableRoom, validateRooms };
