"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { saveRooms, loadRooms, hashToken } = require("../room-store");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rail-store-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "state.json");
  const room = { code: "ABC123", game: null, members: [{ name: "A", token: "private-token", ws: { secret: "socket" } }] };
  return { dir, file, room, rooms: new Map([[room.code, room]]) };
}
test("snapshots contain token hashes, never recovery credentials or sockets", t => {
  const f = fixture(t); saveRooms(f.file, f.rooms);
  const raw = fs.readFileSync(f.file, "utf8");
  assert.ok(!raw.includes("private-token") && !raw.includes("socket"));
  assert.equal(loadRooms(f.file)[0].members[0].tokenHash, hashToken("private-token"));
});
test("atomic snapshots recover the prior valid save when the main file is corrupted", t => {
  const f = fixture(t); saveRooms(f.file, f.rooms); f.room.revision = 1; saveRooms(f.file, f.rooms);
  fs.writeFileSync(f.file, "broken"); assert.equal(loadRooms(f.file)[0].revision, 0);
  saveRooms(f.file, f.rooms); assert.equal(loadRooms(f.file)[0].revision, 1);
});
test("corrupt saves without a valid backup fail closed instead of overwriting games", t => {
  const f = fixture(t); fs.writeFileSync(f.file, "broken");
  assert.throws(() => loadRooms(f.file), /conservan los archivos/);
  assert.equal(fs.readFileSync(f.file, "utf8"), "broken");
});
test("write failures propagate to the authoritative server", t => {
  const f = fixture(t); assert.throws(() => saveRooms(path.join(f.dir, "missing", "state"), f.rooms));
});
