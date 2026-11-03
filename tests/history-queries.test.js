"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Engine = require("../engine"), Replay = require("../replay-state");
const { createMatchArchive } = require("../match-archive");
const { createHistoryQueries } = require("../game/application/history-queries");
const { verifyAudit } = require("../scripts/verify-match-audit");

function fixture() {
  const archive = createMatchArchive(), room = { code: "ROOM01", visibility: "public", archiveFull: true,
    members: [{ name: "Same", guestId: "guest-a" }, { name: "Same", guestId: "guest-b" }],
    game: Engine.newGame(["Same", "Same"], 0, 0, null, { random: () => 0 }) };
  archive.capture(room);
  for (const seat of [0, 1]) Engine.action(room.game, seat, { type: "choose_initial", indexes: [0, 1] }, { now: 0 });
  Engine.action(room.game, 0, { type: "draw_train", index: -1 }, { now: 1 });
  room.archiveAction = { seat: 0, action: { type: "draw_train", index: -1 } };
  archive.capture(room);Engine.finish(room.game, true);archive.capture(room);archive.commit(archive.prepare());
  const { frames, ...record } = archive.state.matches[room.matchId], claims = {};
  let reads = 0;
  const queries = createHistoryQueries({ repository: {
    records: async () => ({ matches: [record], claims }),
    frames: async () => { reads++;return frames; },
  } });
  return { record, frames, claims, queries, reads: () => reads };
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value);Object.values(value).forEach(freeze); }
  return value;
}

test("access decisions happen before remote frame reads for private, active, unsupported and audit requests", async () => {
  const f = fixture();
  for (const [changes, identity, audit, status] of [
    [{ visibility: "private" }, {}, false, 404],
    [{ visibility: "public", status: "active" }, { guestId: "guest-a" }, false, 409],
    [{ status: "completed", schemaVersion: 99 }, { guestId: "guest-a" }, false, 409],
    [{ schemaVersion: 1 }, {}, true, 403],
  ]) {
    Object.assign(f.record, changes);
    await assert.rejects(f.queries.replay(identity, f.record.id, audit), error => error.status === status);
    assert.equal(f.reads(), 0);
  }
  const missing = createHistoryQueries({ repository: { records: async () => ({ matches: [], claims: {} }), frames: () => assert.fail("unauthorized read") } });
  await assert.rejects(missing.replay({}, "missing"), error => error.status === 404);
  assert.equal((await f.queries.replay({}, f.record.id)).full, false);assert.equal(f.reads(), 1);
});

test("identity claims revoke guest ownership; nicknames and bot identities cannot grant participant access", async () => {
  const f = fixture();f.record.visibility = "private";
  assert.equal((await f.queries.list({ guestId: "guest-b" }))[0].ownSeat, 1);
  f.claims["guest-b"] = "account-b";
  assert.deepEqual(await f.queries.list({ guestId: "guest-b" }), []);
  await assert.rejects(f.queries.replay({ guestId: "guest-b" }, f.record.id), error => error.status === 404);
  assert.equal((await f.queries.replay({ accountId: "account-b" }, f.record.id)).full, true);
  for (const identity of [{ name: "Same" }, { seat: 0 }, { accountId: "account-other" }]) {
    await assert.rejects(f.queries.replay(identity, f.record.id), error => error.status === 404);
  }
  f.record.players[1].bot = true;
  await assert.rejects(f.queries.replay({ accountId: "account-b" }, f.record.id), error => error.status === 404);
});

test("closed participants retain all recorded seats; public replay strips private actions, draws and final destinations", async () => {
  const f = fixture(), outside = await f.queries.replay({}, f.record.id), own = await f.queries.replay({ guestId: "guest-a" }, f.record.id);
  assert.equal(own.full, true);assert.equal(outside.full, false);
  assert.ok(own.frames.some(frame => frame.action));
  const last = Replay.at(own.frames, own.frames.length - 1);
  assert.ok(last.views[2].hand.length > 0);assert.ok(last.views[2].tickets.length > 0);
  for (let step = 0; step < outside.frames.length; step++) {
    const data = Replay.at(outside.frames, step), frame = outside.frames[step];
    assert.equal(data.game, undefined);assert.equal(data.views.length, 1);assert.equal(frame.action, undefined);
    const view = data.views[0];assert.deepEqual(view.hand, []);assert.deepEqual(view.tickets, []);
    for (const event of frame.events.filter(e => e.draw)) assert.equal(event.draw.color, undefined);
    for (const row of view.result || []) { assert.deepEqual(row.tickets, []);assert.deepEqual(row.details.destinations, []); }
  }
  assert.ok(outside.match.scores.every(score => score.details === undefined && score.tickets === undefined));
  assert.ok(outside.match.players.every(p => !p.guestId && !p.accountId));
});

test("list, full replay and audit return detached data without mutating metadata, frames or hashes", async () => {
  const f = fixture(), before = structuredClone({ record: f.record, frames: f.frames });
  freeze(f.record);freeze(f.frames);
  const list = await f.queries.list({ guestId: "guest-a" });list[0].scores[0].score = -999;
  const own = await f.queries.replay({ guestId: "guest-a" }, f.record.id);
  own.frames[0].snapshot.views[1].hand.push("changed");own.frames[1].events.push({ text: "changed" });
  own.frames[1].action.action.type = "changed";
  const audit = await f.queries.replay({ guestId: "guest-a" }, f.record.id, true);
  assert.equal(verifyAudit(audit).integrity, true);
  audit.frames[0].snapshot.game.players[0].hand.push("changed");audit.match.scores[0].score = -999;
  assert.deepEqual({ record: f.record, frames: f.frames }, before);
  assert.equal(Object.hasOwn(f.record, "frames"), false);
});
