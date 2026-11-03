"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const E = require("../engine"), Queries = require("../game/queries/match-view"), { planTiming } = require("../game/compat/legacy-timing");
const timing = { initialMs: 60000, turnMs: 60000, finalTrainThreshold: 2 };
function ready() {
  const g = E.newGame(["A", "B"], 0, 0, { initialSeconds: 60, turnSeconds: 60, ticketExtraSeconds: 30 }, { random: () => 0 });
  for (const seat of [0,1]) E.action(g, seat, { type: "choose_initial", indexes: [0,1] }, { now: 0, random: () => 0 });
  return g;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value);Object.values(value).forEach(freeze); }
  return value;
}
function references(value, found = new Set()) {
  if (value && typeof value === "object" && !found.has(value)) { found.add(value);Object.values(value).forEach(item => references(item, found)); }
  return found;
}
function fixtures() {
  const initial = E.newGame(["A", "B"], 0, 0, null, { random: () => 0 });
  const play = ready();E.action(play, 0, { type: "draw_train", index: -1 }, { now: 100, random: () => 0 });
  const offer = ready();E.action(offer, 0, { type: "draw_tickets" }, { now: 100, random: () => 0 });
  const waiting = structuredClone(offer);waiting.current = 0;E.normalize(waiting, 200);
  const closing = ready();closing.finalRemaining = 1;E.action(closing, 0, { type: "draw_tickets" }, { now: 100, random: () => 0 });
  const tunnel = ready();tunnel.routes[0] = { ...tunnel.routes[0], n: 2, color: "red", tunnel: true, ferry: 0 };
  tunnel.players[0].hand = ["red", "red", "wild"];tunnel.deck = ["blue", "wild", "red"];
  E.action(tunnel, 0, { type: "claim", routeId: 0, color: "red", wildCount: 0 }, { now: 100, random: () => 0 });
  const decision = structuredClone(tunnel);E.expire(decision, decision.pending.until, () => 0);
  const result = structuredClone(decision);E.action(result, 0, { type: "decline_tunnel" }, { now: 3000, random: () => 0 });
  const finished = ready();E.finish(finished);
  return [initial, play, offer, waiting, closing, tunnel, decision, result, finished];
}

test("every phase projects a frozen match without mutation or any shared object reference", () => {
  for (const game of fixtures()) {
    const before = structuredClone(game), source = references(game);freeze(game);
    for (const seat of [-1,0,1]) {
      const view = E.view(game, seat, { now: 12345 });
      assert.equal(view.serverNow, 12345);
      assert.deepEqual(view, E.view(game, seat, { now: 12345 }));
      assert.ok([...references(view)].every(object => !source.has(object)), `${game.phase}: shared reference at seat ${seat}`);
      // Mutate every returned object/array, including nested events and receipts.
      for (const object of references(view)) if (Array.isArray(object)) object.push("changed");else object.changed = true;
      assert.deepEqual(game, before);
    }
  }
});

test("a previously read view remains a snapshot after subsequent actions", () => {
  const g = ready(), view = E.view(g, 0, { now: 10 }), before = structuredClone(view);
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 100, random: () => 0 });
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 200, random: () => 0 });
  E.finish(g);
  assert.deepEqual(view, before);
});

test("old result reads do not hydrate state; explicit normalization preserves stored totals and is idempotent", () => {
  const g = ready();E.finish(g);g.result[0].score += 7;g.result[0].route += 7;delete g.result[0].details;
  const before = structuredClone(g), untouched = g.result[1].details, order = g.result.map(r => r.seat);
  const view = E.view(freeze(structuredClone(g)), 0, { now: 100 });
  assert.equal(view.result[0].details, undefined);assert.deepEqual(g, before);
  E.normalize(g, 100);
  assert.equal(g.result[0].details.totals.total, before.result[0].score);
  assert.equal(g.result[0].details.routeAdjustment, 7);assert.equal(g.result[1].details, untouched);
  assert.deepEqual(g.result.map(r => r.seat), order);
  const normalized = structuredClone(g);E.normalize(g, 10000);assert.deepEqual(g, normalized);
});

test("reading an old initial clock never grants time or upgrades it", () => {
  const g = E.newGame(["A", "B"], 0, 0, null, { random: () => 0 });
  delete g.initialDeadline;g.current = 1;g.turnSeat = 1;g.turnDeadline = 80000;
  const before = structuredClone(g);
  assert.equal(E.view(freeze(structuredClone(g)), 0, { now: 50000 }).initialDeadline, undefined);
  assert.deepEqual(g, before);E.normalize(g, 50000);
  assert.equal(g.initialDeadline, 80000);assert.equal(g.turnDeadline, 80000);assert.equal(g.current, 0);
  const normalized = structuredClone(g);E.normalize(g, 70000);assert.deepEqual(g, normalized);
});

test("normalization upgrades a legacy tunnel without repeating reveal or extending its deadline", () => {
  const g = fixtures()[6], deadline = g.turnDeadline, events = structuredClone(g.events), hand = [...g.players[0].hand];
  for (const key of ["stage", "startedAt", "until", "turnRemaining", "offerRemaining"]) delete g.pending[key];
  E.normalize(g, 5000);assert.equal(g.pending.stage, "decision");assert.equal(g.turnDeadline, deadline);
  assert.equal(g.pending.turnRemaining, deadline - 5000);assert.deepEqual(g.events, events);assert.deepEqual(g.players[0].hand, hand);
  const normalized = structuredClone(g);E.normalize(g, 6000);assert.deepEqual(g, normalized);
});

test("legacy ticket normalization advances once, including the last turn with a pending choice", () => {
  for (const finalRemaining of [null,1]) {
    const g = ready(), serial = g.turnSerial;g.phase = "tickets";g.finalRemaining = finalRemaining;
    g.pending = { tickets: g.shortDeck.splice(0,3) };E.normalize(g, 5000);
    assert.equal(g.players[0].offer.deadline, 65000);assert.equal(g.offerSerial, 1);
    assert.equal(g.phase, finalRemaining ? "closing" : "play");
    assert.equal(g.turnSerial, serial + (finalRemaining ? 0 : 1));
    const normalized = structuredClone(g);E.normalize(g, 6000);assert.deepEqual(g, normalized);
  }
});

test("commands normalize legacy state before resolving a late action", () => {
  const g = ready();delete g.turnSeat;delete g.turnClockPhase;g.turnDeadline = null;
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 5000, random: () => 0 });
  assert.equal(g.turnDeadline, 65000);assert.equal(g.drawCount, 1);
  assert.throws(() => E.action(g, 0, { type: "draw_train", index: -1 }, { now: 65000, random: () => 0 }), /turno/);
  assert.equal(g.current, 1);assert.equal(g.drawSerial, 2);
});

test("history helpers return detached records and redact blind colors without changing the source", () => {
  const entry = freeze({ seat: 0, text: "draw", message: { key: "draw", args: ["A"] }, draw: { index: -1, color: "red" } });
  for (const seat of [-1,0,1]) {
    const view = E.historyEntryView(entry, seat);
    assert.equal(Object.hasOwn(view.draw, "color"), seat === 0);view.message.args.push("changed");
    assert.deepEqual(entry.message.args, ["A"]);
  }
  const ordinary = freeze({ seat: 0, text: "joined", message: { args: ["A"] } });
  E.historyEntryView(ordinary, -1).message.args.push("changed");assert.deepEqual(ordinary.message.args, ["A"]);
});

test("invalid seats are rejected rather than coerced into a private player view", () => {
  const g = freeze(ready());
  for (const seat of ["0", null, undefined, -2, 2, 0.5, NaN]) assert.throws(() => E.view(g, seat, { now: 0 }), /Puesto inválido/);
});

test("queries and legacy timing plans have no ambient clock, random source or external imports", () => {
  const forbidden = () => { throw Error("ambient dependency"); }, math = Object.create(Math);math.random = forbidden;
  function load(file, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { module,
      require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : forbidden(), structuredClone,
      Date: class { constructor() { forbidden(); } static now() { forbidden(); } }, Math: math, fetch: forbidden, setTimeout: forbidden });
    return module.exports;
  }
  const turn = load("game/domain/turn.js"), legacy = load("game/compat/legacy-timing.js", { "../domain/turn": turn });
  const query = load("game/queries/match-view.js"), g = freeze(ready());
  assert.equal(query.projectMatch(g, 0, { now: 42, tunnelCardMs: 3, destinationDetails: () => ({ progress: [], paths: [] }) }).serverNow, 42);
  const legacyGame = { ...g, phase: "tickets", pending: { tickets: g.shortDeck.slice(0,3) } }, before = structuredClone(legacyGame);
  const plan = legacy.planTiming(freeze(legacyGame), { now: 42, rules: timing, offerMs: 100 });
  assert.equal(plan.offer.value.deadline, 142);assert.equal(plan.changes.current, 1);
  assert.deepEqual(legacyGame, before);
});
