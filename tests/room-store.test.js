"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { saveRooms, loadState, loadRooms, hashToken, serializableRoom } = require("../backend/room-store");
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
test("unknown local envelope versions never downgrade to a legacy backup", t => {
  const f=fixture(t);saveRooms(f.file,f.rooms);
  const legacy=fs.readFileSync(f.file,"utf8");fs.writeFileSync(f.file+".bak",legacy);
  for(const version of [3,"2",null]){
    const unknown=JSON.stringify({version,rooms:[serializableRoom(f.room)]});fs.writeFileSync(f.file,unknown);
    assert.throws(()=>loadState(f.file),{code:"UNSUPPORTED_STORAGE_VERSION"});
    assert.equal(fs.readFileSync(f.file,"utf8"),unknown);assert.equal(fs.readFileSync(f.file+".bak","utf8"),legacy);
  }
});
test("write failures propagate to the authoritative server", t => {
  const f = fixture(t); assert.throws(() => saveRooms(path.join(f.dir, "missing", "state"), f.rooms));
});

function archiveFixture(t) {
  const f = fixture(t), id = 'match-1';
  const archive = { matches: { [id]: { id, status: 'completed', frames: [{ seq: 0, snapshot: { value: 'original' } }] } }, claims: { guest: 'account' } };
  return { ...f, id, archive, log: path.join(f.file + '.archive', hashToken(id) + '.jsonl') };
}
test('legacy history migrates without losing rooms, frames, claims or the old backup', t => {
  const f = archiveFixture(t);
  const legacy = JSON.parse(JSON.stringify({ rooms: [serializableRoom(f.room)], archive: f.archive }));
  fs.writeFileSync(f.file, JSON.stringify(legacy));
  assert.deepEqual(loadState(f.file), legacy);
  saveRooms(f.file, f.rooms, f.archive);
  const manifest = JSON.parse(fs.readFileSync(f.file));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.archive.matches[f.id].frames, undefined);
  assert.deepEqual(loadState(f.file), legacy);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file + '.bak')), legacy);
});
test('changing a lobby color neither reads nor serializes committed replay frames', t => {
  const f = archiveFixture(t);
  f.archive.matches[f.id].frames[0].snapshot.value = 'x'.repeat(2_000_000);
  saveRooms(f.file, f.rooms, f.archive);
  const before = fs.readFileSync(f.log), stat = fs.statSync(f.log);
  f.archive.matches[f.id].frames[0].toJSON = () => { throw Error('Old frame serialized again'); };
  const read = t.mock.method(fs, 'readFileSync', () => { throw Error('Old state read again'); });
  f.room.members[0].color = '#9a75ba';
  saveRooms(f.file, f.rooms, f.archive);
  read.mock.restore();
  assert.deepEqual(fs.readFileSync(f.log), before);
  assert.equal(fs.statSync(f.log).mtimeMs, stat.mtimeMs);
  assert.ok(fs.statSync(f.file).size < 2000);
  assert.ok(fs.statSync(f.file + '.bak').size < 2000);
  assert.equal(loadState(f.file).rooms[0].members[0].color, '#9a75ba');
});
test('failed manifest commit keeps the previous replay prefix and retry replaces its uncommitted tail', t => {
  const f = archiveFixture(t);
  saveRooms(f.file, f.rooms, f.archive);
  f.archive.matches[f.id].frames.push({ seq: 1, action: 'uncommitted' });
  f.room.revision = 1;
  const rename = fs.renameSync;
  const failure = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === f.file) throw Error('Simulated commit failure');
    return rename(from, to);
  });
  assert.throws(() => saveRooms(f.file, f.rooms, f.archive), /commit failure/);
  failure.mock.restore();
  const restored = loadState(f.file);
  assert.equal(restored.rooms[0].revision, 0);
  assert.equal(restored.archive.matches[f.id].frames.length, 1);
  restored.archive.matches[f.id].frames.push({ seq: 1, action: 'retry' });
  saveRooms(f.file, f.rooms, restored.archive);
  assert.deepEqual(loadState(f.file).archive.matches[f.id].frames.map(f => f.action), [undefined, 'retry']);
  assert.doesNotMatch(fs.readFileSync(f.log, 'utf8'), /uncommitted/);
});
test('a corrupt manifest recovers its matching room and replay prefix from backup', t => {
  const f = archiveFixture(t);
  saveRooms(f.file, f.rooms, f.archive);
  f.archive.matches[f.id].frames.push({ seq: 1, action: 'new' });
  f.room.revision = 1; saveRooms(f.file, f.rooms, f.archive);
  fs.writeFileSync(f.file, 'broken');
  const restored = loadState(f.file);
  assert.equal(restored.rooms[0].revision, 0);
  assert.equal(restored.archive.matches[f.id].frames.length, 1);
  restored.archive.matches[f.id].frames.push({ seq: 1, action: 'replacement' });
  saveRooms(f.file, f.rooms, restored.archive);
  assert.equal(loadState(f.file).archive.matches[f.id].frames[1].action, 'replacement');
});
test('missing replay files fail closed instead of treating the store as empty', t => {
  const f = archiveFixture(t);
  saveRooms(f.file, f.rooms, f.archive);
  fs.unlinkSync(f.log);
  const before = fs.readFileSync(f.file);
  assert.throws(() => loadState(f.file), /conservan los archivos/);
  assert.deepEqual(fs.readFileSync(f.file), before);
});
test('truncated replay tails fall back to the last complete prefix', t => {
  const f = archiveFixture(t);
  saveRooms(f.file, f.rooms, f.archive);
  const bytes = fs.statSync(f.log).size;
  f.archive.matches[f.id].frames.push({ seq: 1, action: 'new' });
  f.room.revision = 1; saveRooms(f.file, f.rooms, f.archive);
  fs.truncateSync(f.log, bytes + 3);
  const restored = loadState(f.file);
  assert.equal(restored.rooms[0].revision, 0);
  assert.equal(restored.archive.matches[f.id].frames.length, 1);
});
test('unrecoverable replay truncation identifies the file and expected bytes without rewriting it', t => {
  const f = archiveFixture(t);
  saveRooms(f.file, f.rooms, f.archive);
  saveRooms(f.file, f.rooms, f.archive);
  const expected = fs.statSync(f.log).size;
  fs.truncateSync(f.log, expected - 3);
  const before = [f.file, f.file + '.bak', f.log].map(file => fs.readFileSync(file));
  assert.throws(() => loadState(f.file), error => {
    assert.equal(error.code, 'STATE_LOAD_FAILED');
    assert.ok(error.message.includes(f.log));
    assert.ok(error.message.includes(`se esperaban ${expected} bytes y hay ${expected - 3}`));
    assert.ok(error.message.includes(`Estado (${f.file})`));
    assert.ok(error.message.includes(`Copia (${f.file}.bak)`));
    return true;
  });
  assert.deepEqual([f.file, f.file + '.bak', f.log].map(file => fs.readFileSync(file)), before);
});
test('corrupt JSON diagnostics never expose fragments of private save contents', t => {
  const f = fixture(t), secret = 'private-recovery-credential';
  fs.writeFileSync(f.file, secret);
  fs.writeFileSync(f.file + '.bak', secret);
  assert.throws(() => loadState(f.file), error => {
    assert.equal(error.code, 'STATE_LOAD_FAILED');
    assert.match(error.message, /JSON inválido/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
test('corrupt replay JSON identifies its file and line without exposing or overwriting saved contents', t => {
  const f = archiveFixture(t), secret = 'private-replay-credential';
  f.archive.matches[f.id].frames.push({ seq: 1, secret });
  saveRooms(f.file, f.rooms, f.archive);
  saveRooms(f.file, f.rooms, f.archive);
  const bytes = fs.readFileSync(f.log);
  bytes[bytes.indexOf('\n') + 1] = '!'.charCodeAt(0);
  fs.writeFileSync(f.log, bytes);
  const before = [f.file, f.file + '.bak', f.log].map(file => fs.readFileSync(file));
  assert.throws(() => loadState(f.file), error => {
    assert.equal(error.code, 'STATE_LOAD_FAILED');
    assert.ok(error.message.includes(f.log));
    assert.match(error.message, /JSON inválido en repetición: .*; línea 2\./);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  assert.deepEqual([f.file, f.file + '.bak', f.log].map(file => fs.readFileSync(file)), before);
});
test('invalid JSON beyond the backup replay prefix still recovers the prior checkpoint', t => {
  const f = archiveFixture(t);
  saveRooms(f.file, f.rooms, f.archive);
  const prefix = fs.statSync(f.log).size;
  f.archive.matches[f.id].frames.push({ seq: 1, action: 'new' });
  f.room.revision = 1;
  saveRooms(f.file, f.rooms, f.archive);
  const bytes = fs.readFileSync(f.log);
  bytes[prefix] = '!'.charCodeAt(0);
  fs.writeFileSync(f.log, bytes);
  const restored = loadState(f.file);
  assert.equal(restored.rooms[0].revision, 0);
  assert.equal(restored.archive.matches[f.id].frames.length, 1);
  assert.deepEqual(fs.readFileSync(f.log), bytes);
});
