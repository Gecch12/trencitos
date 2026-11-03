"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const Engine = require("../engine"), { createMatchArchive } = require("../match-archive");
const { loadState } = require("../room-store"), { createSupabaseStore } = require("../supabase-store");
const { createDurableQueue } = require("../durable-queue");
const { fakeSupabase } = require("./helpers/fake-supabase");
const { createCheckpointHandler } = require("../game/application/checkpoint");
const { createRoomStager } = require("../game/application/room-stage");
const { createFileCheckpointCommitter, createRemoteCheckpointCommitter } = require("../game/infrastructure/checkpoint-committer");

const json = value => JSON.parse(JSON.stringify(value));

function fixture(t, remote = null) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-application-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const room = { code: "ROOM01", revision: 0, updated: 1000,
    members: [{ name: "A", token: "private-recovery", actionIds: ["command-0001"] }, { name: "B" }],
    game: Engine.newGame(["A", "B"], 0, 1000, null, { random: () => 0 }) };
  const practice = { ...structuredClone(room), code: "TEMP01", practice: true };
  const repository = new Map([[room.code, room], [practice.code, practice]]);
  const archive = createMatchArchive({ remote });
  for (const r of repository.values()) archive.capture(r);
  return { file: path.join(directory, "state.json"), room, practice, repository, archive };
}

test("file preparation detaches room state and receipts, includes practice history, and commits them together", t => {
  const f = fixture(t), committer = createFileCheckpointCommitter(f), batch = committer.prepare(f.repository);
  assert.equal(batch.rooms.length, 1);assert.equal(Object.keys(batch.archive.matches).length, 2);
  assert.equal(Object.keys(f.archive.state.matches).length, 0);assert.equal(f.archive.pending.length, 2);
  assert.ok(!JSON.stringify(batch).includes("private-recovery"));
  f.room.revision++;f.room.members[0].actionIds.push("later-command");f.room.game.players[0].hand.push("red");
  committer.commit(batch);
  const saved = loadState(f.file);
  assert.deepEqual(saved.rooms, json(batch.rooms));assert.deepEqual(saved.archive, json(batch.archive));
  assert.equal(saved.rooms[0].revision, 0);assert.deepEqual(saved.rooms[0].members[0].actionIds, ["command-0001"]);
  assert.equal(saved.rooms[0].archiveHash, saved.archive.matches[f.room.matchId].digest);
  assert.equal(f.archive.pending.length, 0);
});

test("a lobby-only commit reuses old replay frames without cloning or serializing their contents", t => {
  const f = fixture(t), committer = createFileCheckpointCommitter(f);
  committer.commit(committer.prepare(f.repository));
  const frame = f.archive.state.matches[f.room.matchId].frames[0];
  frame.toJSON = () => { throw Error("old replay serialized again"); };
  f.room.members[0].color = "blue";
  const batch = committer.prepare(f.repository);
  assert.equal(batch.archive.matches[f.room.matchId].frames[0], frame);
  committer.commit(batch);
  assert.equal(loadState(f.file).rooms[0].members[0].color, "blue");
});

function localStager(t) {
  const f = fixture(t), sent = [], events = [];
  let saved, paused = false;
  const checkpoint = createCheckpointHandler({ repository: f.repository, committer: createFileCheckpointCommitter(f), now: () => 2000,
    onLocalCommit: () => { saved = structuredClone(f.room);events.push("committed"); },
    onLocalFailure: () => { Object.assign(f.room, structuredClone(saved));f.archive.rollback([]);paused = true;events.push("restored"); },
  });
  const stage = createRoomStager({ repository: f.repository, engine: Engine, history: f.archive, checkpoint,
    now: () => 2000, storagePaused: () => paused, watchRoom() {}, reconcileRoom() {},
    queueViews: room => { sent.push({ room: structuredClone(room), paused });events.push("views"); },
    scheduleRoom: () => events.push("schedule"), queueDirectory: () => events.push("directory"),
  });
  assert.equal(stage(f.room), true);sent.length = events.length = 0;
  return { ...f, checkpoint, stage, sent, events };
}

test("a failed local manifest restores state before publishing recovery, including the matching replay prefix", t => {
  const f = localStager(t), before = loadState(f.file), revision = f.room.revision;
  Engine.action(f.room.game, 0, { type: "choose_initial", indexes: [0, 1] }, { now: 2000 });f.room.revision++;
  f.room.members[0].actionIds.push("uncommitted-command");
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, "renameSync", (from, to) => { if (to === f.file) throw Error("manifest failed");return rename(from, to); });
  assert.equal(f.stage(f.room), false);mock.mock.restore();
  assert.deepEqual(f.events, ["restored", "views", "schedule", "directory"]);
  assert.equal(f.sent[0].paused, true);assert.equal(f.sent[0].room.revision, revision);
  assert.deepEqual(f.sent[0].room.game, before.rooms[0].game);
  assert.deepEqual(f.sent[0].room.members[0].actionIds, before.rooms[0].members[0].actionIds);
  assert.deepEqual(loadState(f.file), before);assert.equal(f.archive.pending.length, 0);
});

test("a delivery exception after a file commit cannot roll back the stored room or replay", t => {
  const f = localStager(t);
  Engine.action(f.room.game, 0, { type: "choose_initial", indexes: [0, 1] }, { now: 2000 });f.room.revision++;
  const stage = createRoomStager({ repository: f.repository, engine: Engine, history: f.archive, checkpoint: f.checkpoint,
    now: () => 2000, storagePaused: () => false, watchRoom() {}, reconcileRoom() {},
    queueViews: () => { throw Error("socket failed"); }, scheduleRoom() {}, queueDirectory() {},
  });
  assert.throws(() => stage(f.room), /socket failed/);
  const saved = loadState(f.file);
  assert.equal(saved.rooms[0].revision, 1);assert.equal(saved.rooms[0].game.initialDone, 1);
  assert.equal(saved.archive.matches[f.room.matchId].digest, f.room.archiveHash);
  assert.deepEqual(f.events, ["committed"]);
});

test("remote preparation is detached and commits only after storage, retrying the same rooms and new frames", async t => {
  const api = fakeSupabase(), store = createSupabaseStore({ url: "https://fixture.supabase.co", secret: "sb_secret_test_only", fetchImpl: api.fetch });
  await store.load();
  const f = fixture(t, store), committer = createRemoteCheckpointCommitter({ store, archive: f.archive });
  const batch = committer.prepare(f.repository), expected = structuredClone(batch), release = api.hold();
  const done = committer.commit(batch);
  f.room.revision++;
  f.archive.pending[0].frames[0].events.push({ text: "later runtime mutation" });
  assert.deepEqual(batch, expected);assert.equal(f.archive.pending.length, 2);assert.equal(api.state.rooms.length, 0);
  api.lostResponses = 1;release();await done;
  const writes = api.calls.filter(call => call.method === "ferrovia_save_checkpoint_v2");
  assert.equal(writes.length, 2);assert.deepEqual(writes[0].body, writes[1].body);
  assert.deepEqual(api.state.rooms, json(expected.rooms));assert.equal(f.archive.pending.length, 0);
  assert.deepEqual(api.state.matches[f.room.matchId].frames, json(expected.archive[0].frames));
});

test("multiple stages share one remote checkpoint and a queued job cannot overtake its commit", async t => {
  const api = fakeSupabase(), store = createSupabaseStore({ url: "https://fixture.supabase.co", secret: "sb_secret_test_only", fetchImpl: api.fetch });
  await store.load();
  const f = fixture(t, store), sent = [], failures = [];
  const checkpoint = createCheckpointHandler({ repository: f.repository, committer: createRemoteCheckpointCommitter({ store, archive: f.archive }),
    now: () => 2000, deferCommit: () => queue.dirty(),
    onLocalCommit: () => assert.fail("remote used local acceptance"), onLocalFailure: () => assert.fail("remote used local rollback"),
  });
  const queue = createDurableQueue({ capture: () => ({ room: structuredClone(f.room), pending: f.archive.snapshot() }),
    restore: saved => { Object.assign(f.room, saved.room);f.archive.rollback(saved.pending); },
    commit: checkpoint.commit, onFailure: error => failures.push(error),
  });
  const release = api.hold();
  const first = queue.run(() => {
    for (let i = 0; i < 2; i++) { f.room.revision++;checkpoint.persist(); }
    queue.defer(() => sent.push(f.room.revision));
  });
  const second = queue.run(() => { f.room.revision++;checkpoint.persist();queue.defer(() => sent.push(f.room.revision)); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.room.revision, 2);assert.deepEqual(sent, []);assert.equal(api.state.rooms.length, 0);
  release();await Promise.all([first, second]);
  assert.deepEqual(sent, [2, 3]);assert.deepEqual(failures, []);
  assert.deepEqual(api.calls.filter(c => c.method === "ferrovia_save_checkpoint_v2").map(c => c.body.p_rooms[0].revision), [2, 3]);
  assert.equal(f.practice.savedAt, undefined);assert.equal(f.room.savedAt, 2000);
  const before = structuredClone(api.state), runtime = structuredClone(f.room);
  api.fail = true;
  await queue.run(() => { f.room.revision++;f.archive.capture(f.room);checkpoint.persist();queue.defer(() => sent.push("failed")); });
  assert.deepEqual(api.state, before);assert.deepEqual(f.room, runtime);assert.equal(f.archive.pending.length, 0);
  assert.deepEqual(sent, [2, 3]);assert.equal(failures.length, 1);
});

test("removed and paused rooms cannot create another checkpoint; automatic staging preserves activity time", t => {
  const f = fixture(t), sent = [];
  const forbidden = () => assert.fail("unexpected checkpoint or reconciliation");
  const ports = { repository: f.repository, engine: Engine, history: { capture: forbidden }, checkpoint: { persist: forbidden },
    now: () => 2000, storagePaused: () => true, watchRoom() {}, reconcileRoom: forbidden,
    queueViews: room => sent.push(room.code), scheduleRoom() {}, queueDirectory() {},
  };
  const stage = createRoomStager(ports);
  assert.equal(stage(f.room, true), false);assert.equal(f.room.updated, 1000);assert.deepEqual(sent, [f.room.code]);
  f.repository.delete(f.room.code);assert.equal(stage(f.room), undefined);assert.equal(sent.length, 1);
  f.repository.set(f.room.code, f.room);
  const removingStage = createRoomStager({ ...ports, storagePaused: () => false, reconcileRoom: room => f.repository.delete(room.code) });
  assert.equal(removingStage(f.room), undefined);assert.equal(sent.length, 1);
});

test("the legacy save entry still rejects asynchronously and checks writer authority before reading rooms", async () => {
  const api = fakeSupabase(), store = createSupabaseStore({ url: "https://fixture.supabase.co", secret: "sb_secret_test_only", fetchImpl: api.fetch });
  const unreadable = { values: () => { throw Error("room read failed"); } };
  let result;
  assert.doesNotThrow(() => { result = store.save(unreadable); });
  await assert.rejects(result, { code: "STORE_CONFLICT" });
  await store.load();
  assert.doesNotThrow(() => { result = store.save(unreadable); });
  await assert.rejects(result, /room read failed/);
});
