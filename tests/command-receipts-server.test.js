"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { once } = require("node:events");
const { connect } = require("./helpers/ws-client"), { loadState } = require("../backend/room-store");
const { fingerprintAction } = require("../game/infrastructure/command-fingerprint");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "command-receipts-"));
Object.assign(process.env, { STATE_BACKEND: "file", STATE_FILE: path.join(directory, "state.json"), AUTH_ENABLED: "false" });
let app, port;const peers = [];
async function boot() {
  delete require.cache[require.resolve("../backend/server")];app = require("../backend/server");await app.ready;
  app.server.listen(0, "127.0.0.1");await once(app.server, "listening");port = app.server.address().port;
}
async function stop() { for (const peer of peers.splice(0)) peer.close();await app.shutdown(); }
async function client() { const peer = await connect(port);peers.push(peer);return peer; }
test.before(boot);
test.after(async () => { await stop();fs.rmSync(directory, { recursive: true, force: true }); });

test("file receipts survive reconnection/restart and roll back atomically without changing legacy IDs or replay", async () => {
  const a = await client(), b = await client();
  a.send({ type: "create", name: "A" });const la = await a.next("lobby");
  b.send({ type: "join", code: la.code, name: "B" });const lb = await b.next("lobby");
  await a.next("lobby", m => m.members.length === 2);
  a.send({ type: "start" });await a.next("state");await b.next("state");
  for (const peer of [a, b]) {
    peer.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });await peer.next("ack");
  }
  let room = app.rooms.get(la.code);const seat = room.game.current, original = [a, b][seat], credentials = [la, lb];
  // A migrated ID has no payload to recover. Do not invent a fingerprint for it.
  room.members[seat].actionIds = ["legacy-command-01"];
  const command = { type: "action", id: "durable-draw-001", revision: room.revision, action: { type: "draw_train", index: -1 } };
  original.send(command);await original.next("ack", m => m.id === command.id);
  const savedMember = loadState(process.env.STATE_FILE).rooms.find(r => r.code === la.code).members[seat];
  assert.deepEqual(savedMember.actionReceipts, [{ id: command.id, fingerprint: fingerprintAction(command.action) }]);
  assert.deepEqual(savedMember.actionIds, ["legacy-command-01", command.id]);
  const reconnected = await client();
  reconnected.send({ type: "join", code: la.code, token: credentials[seat].token });
  await original.next("session_replaced");const lobby = await reconnected.next("lobby"), state = await reconnected.next("state");
  assert.doesNotMatch(JSON.stringify([lobby, state]), /actionIds|actionReceipts|fingerprint/);
  reconnected.send(command);await reconnected.next("ack", m => m.id === command.id);
  await stop();await boot();room = app.rooms.get(la.code);
  const restored = [];
  for (const credential of credentials) {
    const peer = await client();peer.send({ type: "join", code: la.code, token: credential.token });
    await peer.next("lobby");await peer.next("state");restored.push(peer);
  }
  const current = restored[seat], before = structuredClone(room.game), revision = room.revision, hash = room.archiveHash, seq = room.archiveSeq;
  current.send({ ...command, revision: -1, action: { index: -1, type: "draw_train" } });
  await current.next("ack", m => m.id === command.id);
  current.send({ ...command, action: { type: "draw_tickets" } });
  const conflict = await current.next("error", m => m.code === "COMMAND_ID_CONFLICT");
  assert.doesNotMatch(JSON.stringify(conflict), /fingerprint|sha256|draw_train/);
  await assert.rejects(current.next("ack", m => m.id === command.id, 60));
  current.send({ ...command, id: "legacy-command-01", action: { type: "not-an-action" } });
  await current.next("ack", m => m.id === "legacy-command-01");
  assert.deepEqual(room.game, before);assert.equal(room.revision, revision);
  assert.equal(room.archiveHash, hash);assert.equal(room.archiveSeq, seq);
  const receipts = structuredClone(room.members[seat].actionReceipts), ids = [...room.members[seat].actionIds];
  const failed = { ...command, id: "failed-receipt-01", revision }, temporary = process.env.STATE_FILE + ".tmp";
  fs.mkdirSync(temporary);
  try {
    current.send(failed);await current.next("error", m => m.code === "STORAGE_FAILED");
    await assert.rejects(current.next("ack", m => m.id === failed.id, 60));
    assert.deepEqual(room.game, before);assert.equal(room.revision, revision);
    assert.deepEqual(room.members[seat].actionReceipts, receipts);assert.deepEqual(room.members[seat].actionIds, ids);
    assert.equal(room.archiveHash, hash);assert.equal(room.archiveSeq, seq);
    assert.deepEqual(loadState(process.env.STATE_FILE).rooms.find(r => r.code === la.code).members[seat].actionReceipts, receipts);
  } finally { fs.rmdirSync(temporary); }
  current.send({ type: "retry_save" });await current.next("storage", m => !m.paused);
  // A failed commit did not reserve the ID; a different valid action can use it.
  const retry = { ...failed, action: { type: "draw_train", index: room.game.face.findIndex(color => color !== "wild") } };
  current.send(retry);await current.next("ack", m => m.id === retry.id);
  assert.equal(room.members[seat].actionReceipts.at(-1).fingerprint, fingerprintAction(retry.action));
  assert.equal(room.revision, revision + 1);
  const persisted = loadState(process.env.STATE_FILE), record = persisted.archive.matches[room.matchId];
  assert.doesNotMatch(JSON.stringify(record.frames), /actionReceipts|fingerprint/);
});
