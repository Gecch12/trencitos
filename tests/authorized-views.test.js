"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const Engine = require("../backend/engine"), Directory = require("../backend/room-directory"), Timing = require("../shared/game-timing");
const { createAuthorizedViews } = require("../game/queries/authorized-views");

const ports = { engine: Engine, now: () => 1234, isPublic: Directory.isPublic, capacity: Directory.capacity, normalizeTiming: Timing.normalize };
function fixture(initial = false) {
  const game = Engine.newGame(["A", "B"], 0, 0, null, { random: () => 0 });
  if (!initial) for (const seat of [0, 1]) Engine.action(game, seat, { type: "choose_initial", indexes: [0, 1] }, { now: 0 });
  return { code: "ROOM01", matchId: "match-1", visibility: "public", revision: 7, game,
    members: [0, 1].map(i => ({ name: ["A", "B"][i], token: `private-token-${i}`, tokenHash: "private-hash",
      accountId: "private-account", guestId: "private-guest", actionIds: ["private-receipt"],
      actionReceipts: [{ id: "private-receipt", fingerprint: "private-fingerprint" }], ws: { closed: i === 1 } })) };
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value);Object.values(value).forEach(freeze); }
  return value;
}
function references(value, found = new Set()) {
  if (value && typeof value === "object" && !found.has(value)) { found.add(value);Object.values(value).forEach(v => references(v, found)); }
  return found;
}

test("lobby projections expose only the recipient's supplied credential and public members", () => {
  const room = freeze(fixture()), views = createAuthorizedViews(ports);
  for (const seat of [0, 1, -1]) {
    const lobby = views.lobby(room, seat, { token: `session-${seat}` });
    assert.equal(lobby.type, "lobby");assert.equal(lobby.seat, seat);
    assert.equal(lobby.host, seat === 0);assert.equal(lobby.members[0].connected, true);assert.equal(lobby.members[1].connected, false);
    assert.equal(lobby.token, seat === -1 ? undefined : `session-${seat}`);
    assert.doesNotMatch(JSON.stringify(lobby), /private-token|private-hash|private-account|private-guest|private-receipt|private-fingerprint|"ws"/);
    if (seat === -1) { assert.equal(lobby.spectator, true);assert.equal(Object.hasOwn(lobby, "token"), false); }
  }
});

test("initial choices, private offers and blind draws stay confined to the correct live seat", () => {
  const views = createAuthorizedViews(ports), initial = freeze(fixture(true));
  assert.deepEqual(views.state(initial, 0).game.initial, initial.game.players[0].pending);
  assert.deepEqual(views.state(initial, 1).game.initial, initial.game.players[1].pending);
  assert.equal(views.state(initial, -1).game.initial, null);
  const room = fixture();
  Engine.action(room.game, 0, { type: "draw_tickets" }, { now: 100 });
  Engine.action(room.game, 1, { type: "draw_train", index: -1 }, { now: 200 });
  freeze(room);
  for (const seat of [-1, 0, 1]) {
    const game = views.state(room, seat).game;
    assert.equal(Boolean(game.ticketOffer), seat === 0);
    assert.equal(Object.hasOwn(game.drawEvent, "color"), seat === 1);
    assert.equal(Object.hasOwn(game.history.find(e => e.draw).draw, "color"), seat === 1);
    assert.ok(game.players.every(p => !p.hand && !p.tickets));
    if (seat === -1) { assert.deepEqual(game.hand, []);assert.deepEqual(game.tickets, []);assert.equal(game.tunnel, null); }
  }
});

test("spectators retain public tunnel payments and scores while private result details remain hidden", () => {
  const room = fixture(), g = room.game, views = createAuthorizedViews(ports);
  g.routes[0] = { ...g.routes[0], color: "red", n: 2, tunnel: true, ferry: 0 };
  g.players[0].hand = ["red", "red", "wild"];g.deck = ["blue", "wild", "red"];
  Engine.action(g, 0, { type: "claim", routeId: 0, color: "red", wildCount: 0 }, { now: 100 });
  const live = views.state(room, -1).game;
  assert.deepEqual(live.sharedTunnel.revealed, g.pending.revealed);assert.deepEqual(live.sharedTunnel.base, g.pending.base);
  assert.equal(live.tunnel, null);assert.deepEqual(live.hand, []);
  Engine.finish(g, true);
  const own = views.state(room, 0).game, outside = views.state(room, -1).game;
  assert.ok(own.result.every(row => row.tickets.length && row.details.destinations.length));
  assert.deepEqual(outside.result.map(r => r.score), own.result.map(r => r.score));
  for (const row of outside.result) {
    for (const key of ["tickets", "individualTickets", "stationRoutes"]) assert.deepEqual(row[key], []);
    assert.deepEqual(row.details.destinations, []);
  }
});

test("recording and live views share the public filter, omit volatile clocks in storage and own all output objects", () => {
  const room = fixture();Engine.finish(room.game, true);freeze(room);
  const views = createAuthorizedViews(ports), before = structuredClone(room), source = references(room);
  const recording = views.recording(room), live = views.state(room, -1).game;
  delete live.serverNow;delete live.revision;delete live.storagePaused;
  assert.deepEqual(recording.views[0], live);
  assert.ok(recording.views.every(view => !Object.hasOwn(view, "serverNow")));
  assert.deepEqual(recording.views[2].hand, room.game.players[1].hand);
  assert.doesNotMatch(JSON.stringify(recording.members), /private-/);
  for (const output of [recording, views.lobby(room, 0), views.state(room, 0), views.state(room, -1)]) {
    for (const ref of references(output)) {
      assert.equal(source.has(ref), false);
      if (Array.isArray(ref)) ref.push("changed");else ref.changed = true;
    }
  }
  assert.deepEqual(room, before);
});

test("recovery projections retain their legacy envelope and invalid seats cannot select private data", () => {
  const room = fixture(), views = createAuthorizedViews(ports);
  const recovery = views.state(room, 0, { storagePaused: true, includeEarlyFinish: false });
  assert.equal(recovery.game.storagePaused, true);assert.equal(recovery.game.revision, 7);
  assert.equal(Object.hasOwn(recovery.game, "earlyFinish"), false);
  assert.equal(views.state(room, 0).game.earlyFinish, false);
  for (const seat of [null, undefined, "0", -2, 2, NaN, 0.5]) {
    assert.throws(() => views.state(room, seat), /Puesto inválido/);
    assert.throws(() => views.lobby(room, seat), /Puesto inválido/);
  }
});

test("live draw correlations include only the recipient's bounded IDs and never their private receipt context", () => {
  const room = fixture(), views = createAuthorizedViews(ports);
  room.members[0].actionReceipts = Array.from({length:20}, (_, i) => ({
    id:`own-draw-${i}`, drawEventId:i + 1, fingerprint:'private-fingerprint',
    after:'private-parent', drawContext:{face:['red'], revision:3, eventFloor:1},
  }));
  room.members[1].actionReceipts = [{id:'rival-draw', drawEventId:30}];
  freeze(room);
  const own = views.state(room, 0), rival = views.state(room, 1), spectator = views.state(room, -1);
  assert.deepEqual(own.drawReceipts, Array.from({length:16}, (_, i) => ({id:`own-draw-${i+4}`, eventId:i+5})));
  assert.deepEqual(rival.drawReceipts, [{id:'rival-draw', eventId:30}]);
  assert.equal(Object.hasOwn(spectator, 'drawReceipts'), false);
  assert.doesNotMatch(JSON.stringify(own), /private-fingerprint|private-parent|drawContext|rival-draw/);
  assert.doesNotMatch(JSON.stringify(rival), /own-draw/);
  assert.doesNotMatch(JSON.stringify(views.recording(room)), /own-draw|rival-draw|drawReceipts|drawContext/);
  assert.equal(views.lobby(room, 0).drawPipelineVersion, 1);
});

test("authorized queries read frozen state with only injected dependencies and never normalize it", () => {
  const forbidden = () => { throw Error("ambient dependency"); }, module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../game/queries/authorized-views.js"), "utf8"), {
    module, structuredClone, require: forbidden, Date: class { static now() { forbidden(); } }, fetch: forbidden, setTimeout: forbidden,
  });
  const views = module.exports.createAuthorizedViews({ ...ports, engine: { ...Engine, normalize: forbidden } }), room = freeze(fixture());
  assert.equal(views.state(room, 0).game.serverNow, 1234);
  assert.equal(views.lobby(room, -1).members.length, 2);assert.equal(views.recording(room).views.length, 3);
});
