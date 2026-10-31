"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../engine"), P = require("../practice-planner"), T = require("../practice-tactics"), S = require("../practice-search");
const { chooseBotAction } = require("../bots");
const first = () => 0;
const route = (id, a, b, n, color = "red", extra = {}) => ({ id, a, b, n, color, owner: null, ferry: 0, tunnel: false, ...extra });
const ticket = (a, b, p = 10, id = 100) => ({ id, a, b, p });
function fixture(routes, hand = [], tickets = []) {
  const g = E.newGame(["Bot", "Rival 1", "Rival 2", "Rival 3"]);
  g.phase = "play"; g.current = 0; g.routes = routes;
  g.players[0].hand = hand; g.players[0].tickets = tickets;
  g.face = ["red", "green", "blue", "black", "yellow"];
  return g;
}

test("keeps three or four initial destinations when they share the same achievable corridor", () => {
  for (const count of [3, 4]) {
    const g = fixture([route(0, "PAR", "BRU", 2), route(1, "BRU", "AMS", 2), route(2, "AMS", "ESS", 2)], Array(6).fill("red"));
    g.phase = "initial";
    g.players[0].pending = [ticket("PAR", "AMS", 8, 100), ticket("PAR", "BRU", 5, 101),
      ticket("BRU", "AMS", 5, 102), ticket("PAR", "ESS", 8, 103)].slice(0, count);
    const action = chooseBotAction(g, 0, first);
    assert.equal(action.indexes.length, count);
    E.action(g, 0, action);
    assert.equal(g.players[0].tickets.length, count);
  }
});

test("builds a station to rescue a blocked ticket, paying the escalating cost legally", () => {
  for (const remaining of [3, 2, 1]) {
    const cost = 4 - remaining;
    const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 1 })], Array(cost).fill("blue"), [ticket("PAR", "BRU", 12)]);
    g.players[0].stations = remaining;
    g.players[0].placed = ["MAD", "LIS"].slice(0, 3 - remaining);
    const action = chooseBotAction(g, 0, first);
    assert.equal(action.type, "station");
    E.action(g, 0, action);
    assert.equal(g.players[0].stations, remaining - 1);
    assert.equal(g.players[0].hand.length, 0);
    assert.equal(E.stationAssignments(g, 0).score, 12);
  }
});

test("one station cannot borrow different edges for incompatible destinations", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 1 }), route(1, "PAR", "AMS", 2, "blue", { owner: 2 })],
    ["green"], [ticket("PAR", "BRU", 12), ticket("PAR", "AMS", 10, 101)]);
  g.players[0].placed = ["PAR"]; g.players[0].stations = 2;
  const view = P.observe(g, 0), outcome = P.ticketOutcome(view, 0);
  assert.deepEqual(outcome.tickets, [true, false]);
  assert.equal(outcome.score, 2);
  assert.equal(outcome.assigned.length, 1);
  const context = P.networks(view, 0, g.players[0].tickets, P.countCards(g.players[0].hand), 10);
  assert.equal(context.pending.length, 1);
});

test("a station placed before the last own segment remains part of the next-turn plan", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 0 }), route(1, "BRU", "AMS", 2, "red", { owner: 1 }),
    route(2, "AMS", "ESS", 2, "blue")], ["red", "blue", "blue"], [ticket("PAR", "ESS", 20)]);
  const station = chooseBotAction(g, 0, first, { search: false });
  assert.equal(station.type, "station");
  E.action(g, 0, station);
  g.current = 0;
  const next = chooseBotAction(g, 0, first);
  assert.equal(next.type, "claim"); assert.equal(next.routeId, 2);
  E.action(g, 0, next);
  assert.equal(E.stationAssignments(g, 0).score, 20);
});

test("does not waste station points when a cheap own connection yields more", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 1 }), route(1, "PAR", "BRU", 1, "blue")],
    ["blue"], [ticket("PAR", "BRU", 12)]);
  g.finalRemaining = 1;
  assert.equal(chooseBotAction(g, 0, first).type, "claim");
});

test("station candidates respect occupied cities and exhausted station supply", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 1 })], ["blue"], [ticket("PAR", "BRU", 12)]);
  g.players[1].placed = ["PAR", "BRU"];
  assert.equal(T.stationCandidates(P.observe(g, 0), 0).length, 0);
  g.players[1].placed = []; g.players[0].stations = 0;
  assert.equal(T.stationCandidates(P.observe(g, 0), 0).length, 0);
});

test("chooses all completed offered tickets and discards an impossible one outside its turn", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 0 }), route(1, "BRU", "AMS", 2, "blue", { owner: 0 })], [], []);
  g.current = 1;
  g.players[0].offer = { id: 17, deadline: Date.now() + 60000, tickets: [ticket("PAR", "AMS", 8), ticket("PAR", "BRU", 5, 101), ticket("MAD", "BAR", 15, 102)] };
  const action = chooseBotAction(g, 0, first);
  assert.deepEqual(action, { type: "keep_tickets", offerId: 17, indexes: [0, 1] });
  const serial = g.turnSerial;
  E.action(g, 0, action);
  assert.equal(g.current, 1);
  assert.equal(g.turnSerial, serial + 1); // fixture timing is first normalized for seat 1
  assert.equal(g.players[0].offer, null);
});

test("mandatory ticket choice takes the smallest penalty if every offer is unreachable", () => {
  const g = fixture([], [], []);
  g.players[0].offer = { id: 19, deadline: Date.now() + 60000, tickets: [ticket("PAR", "AMS", 8), ticket("MAD", "BAR", 5, 101), ticket("LIS", "CAD", 12, 102)] };
  assert.deepEqual(chooseBotAction(g, 0, first).indexes, [1]);
});

test("closing resolves a bot offer immediately and scores before any new turn", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 0 })], [], []);
  g.phase = "closing"; g.finalRemaining = 0; g.current = 2;
  g.players[0].offer = { id: 21, deadline: Date.now() + 60000, tickets: [ticket("PAR", "BRU", 8), ticket("MAD", "BAR", 10, 101)] };
  const action = chooseBotAction(g, 0, first);
  assert.deepEqual(action.indexes, [0]);
  E.action(g, 0, action);
  assert.equal(g.phase, "finished");
  assert.equal(g.result.find(r => r.seat === 0).destination, 8);
});

test("draws new destinations for a broad completed network without reading the actual destination deck", () => {
  const g = E.newGame(["Bot", "Rival 1", "Rival 2", "Rival 3"]);
  g.phase = "play"; g.current = 0; g.finalRemaining = 1;
  g.players[0].tickets = []; g.players[0].hand = [];
  g.routes.forEach(r => { r.owner = 0; });
  assert.equal(chooseBotAction(g, 0, first).type, "draw_tickets");
  g.shortDeck = [];
  assert.equal(chooseBotAction(g, 0, first).type, "draw_train");
});

test("sampled worlds preserve public counts, our hand and the physical card inventory", () => {
  const g = E.newGame(["A", "B", "C", "D"]);
  for (let i = 0; i < 4; i++) E.action(g, i, { type: "choose_initial", indexes: [0, 1] });
  const before = JSON.stringify(g), observation = P.observe(g, 0);
  const sample = S.sampleWorld(observation, 0, {}, S.randomStream(42));
  assert.deepEqual(sample.players[0].hand, g.players[0].hand);
  assert.deepEqual(sample.players.map(p => p.hand.length), g.players.map(p => p.hand.length));
  assert.equal(sample.deck.length, g.deck.length);
  assert.equal(sample.shortDeck.length, g.shortDeck.length);
  const cards = [...sample.face, ...sample.deck, ...sample.discard, ...sample.players.flatMap(p => p.hand)];
  assert.equal(cards.length, 110);
  for (const color of [...E.COLORS, "wild"]) assert.equal(cards.filter(c => c === color).length, color === "wild" ? 14 : 12);
  assert.equal(JSON.stringify(g), before);
});

test("sampling preserves destination deck size when every player kept all four initial tickets", () => {
  const g = E.newGame(["A", "B", "C", "D"]);
  for (let i = 0; i < 4; i++) E.action(g, i, { type: "choose_initial", indexes: [0, 1, 2, 3] });
  for (let seed = 1; seed <= 12; seed++) {
    const sample = S.sampleWorld(P.observe(g, 0), 0, {}, S.randomStream(seed));
    assert.equal(sample.shortDeck.length, g.shortDeck.length);
    assert.ok(sample.players.every(p => p.tickets.length === 4 && p.tickets.filter(t => t.long).length === 1));
    const all = [...sample.shortDeck, ...sample.players.flatMap(p => p.tickets)];
    assert.equal(new Set(all.map(t => t.id)).size, all.length);
  }
});

test("lookahead can favor completing a destination over spending its cards on immediate points", () => {
  const g = fixture([route(0, "PAR", "BRU", 2), route(1, "BRU", "AMS", 2), route(2, "MAD", "BAR", 4)],
    Array(4).fill("red"), [ticket("PAR", "AMS", 20)]);
  const actions = [{ type: "claim", routeId: 2, color: "red", wildCount: 0 }, { type: "claim", routeId: 0, color: "red", wildCount: 0 }];
  const result = S.chooseLookahead(P.observe(g, 0), 0, actions, { known: {}, retired: new Set() }, S.randomStream(21));
  assert.equal(result.action.routeId, 0);
  assert.equal(result.branches, 4);
  assert.ok(result.nodes > 4 && result.nodes <= S.LIMITS.candidates * S.LIMITS.samples * S.LIMITS.actionsPerBranch);
});

test("hidden hand contents, tickets and deck order cannot change a search with the same public observation", () => {
  const g = E.newGame(["A", "B", "C", "D"]);
  for (let i = 0; i < 4; i++) E.action(g, i, { type: "choose_initial", indexes: [0, 1] });
  const other = structuredClone(g);
  other.deck.reverse(); other.shortDeck.reverse();
  other.players.slice(1).forEach(p => { p.hand.fill("wild"); p.tickets = p.tickets.map(t => ({ ...t, a: "LIS", b: "MOS" })); });
  assert.deepEqual(P.observe(g, 0), P.observe(other, 0));
  const before = JSON.stringify(g);
  assert.deepEqual(chooseBotAction(g, 0, S.randomStream(9)), chooseBotAction(other, 0, S.randomStream(9)));
  assert.equal(JSON.stringify(g), before);
});

test("private rival tunnel events are filtered before any details are inspected", () => {
  const g = fixture([], [], []);
  const event = { id: 7, type: "tunnel_reveal", seat: 1 };
  Object.defineProperty(event, "routeId", { get() { throw Error("Private attempted route"); } });
  g.events = [event];
  assert.deepEqual(P.observe(g, 0).events, []);
});

test("injected action randomness covers tunnel reveals, payments and recycling reproducibly", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { tunnel: true })], ["red", "red", "red", "red", "red"]);
  g.deck = ["blue", "green", "red"]; g.discard = [];
  const outcomes = [1, 2].map(() => {
    const copy = structuredClone(g), rng = S.randomStream(7);
    E.action(copy, 0, { type: "claim", routeId: 0, color: "red", wildCount: 0 }, { now: 0, random: rng });
    E.action(copy, 0, { type: "pay_tunnel", extraWild: 0 }, { now: 1, random: rng });
    return copy;
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
});
