"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../backend/engine");
const { P } = require("./helpers/practice-tools").practiceTools(E);
const { chooseBotAction } = require("../backend/bots");
const { match } = require("./helpers/bot-match");
const first = () => 0;
const route = (id, a, b, n, color = "red", extra = {}) => ({ id, a, b, n, color, owner: null, ferry: 0, tunnel: false, ...extra });
const ticket = (a, b, p = 12) => ({ a, b, p });
function fixture(routes, hand, tickets = []) {
  const g = E.newGame(["Bot", "Rival 1", "Rival 2", "Rival 3"]);
  g.phase = "play"; g.current = 0; g.routes = routes;
  g.players[0].hand = hand; g.players[0].tickets = tickets;
  g.face = ["red", "green", "blue", "black", "yellow"];
  return g;
}

test("joint allocation spends every card once, including mandatory ferry wildcards", () => {
  const routes = [route(0, "PAR", "BRU", 4, "red", { ferry: 1 }), route(1, "BRU", "AMS", 4, "red", { ferry: 1 })];
  const counts = P.countCards(["red", "red", "red", "wild"]);
  assert.equal(P.allocation(routes, counts).shortage, 4);
  assert.deepEqual(counts, P.countCards(["red", "red", "red", "wild"]));
  const complete = P.countCards([...Array(6).fill("red"), "wild", "wild"]);
  assert.equal(P.allocation(routes, complete).shortage, 0);
});

test("prefers a longer achievable alternative over reusing the same cards on two short routes", () => {
  const g = fixture([route(0, "PAR", "BRU", 2), route(1, "BRU", "AMS", 2), route(2, "PAR", "AMS", 6, "blue")],
    ["red", "red", ...Array(5).fill("blue")], [ticket("PAR", "AMS", 15)]);
  assert.deepEqual(chooseBotAction(g, 0, first), { type: "draw_train", index: 2 });
});

test("shared alternative networks complete both destinations without duplicating track costs", () => {
  const g = fixture([route(0, "PAR", "BRU", 4), route(1, "PAR", "AMS", 4, "blue"),
    route(2, "PAR", "ESS", 2, "green"), route(3, "ESS", "BRU", 2, "yellow"), route(4, "ESS", "AMS", 2, "black")],
    ["green", "green", "yellow", "yellow", "black", "black"], [ticket("PAR", "BRU"), ticket("PAR", "AMS")]);
  const context = P.networks(P.observe(g, 0), 0, g.players[0].tickets, P.countCards(g.players[0].hand), 30);
  const best = context.options.sort((a, b) => b.value - a.value)[0];
  assert.deepEqual(best.routes.map(r => r.id).sort(), [2, 3, 4]);
  assert.equal(best.resources.turns, 3);
  assert.equal(best.completed.length, 2);
  assert.ok([2, 3, 4].includes(chooseBotAction(g, 0, first).routeId));
});

test("joint plans respect the total train budget, not just each individual ticket", () => {
  const g = fixture([route(0, "PAR", "BRU", 3), route(1, "MAD", "BAR", 3, "blue")],
    ["red", "red", "red", "blue", "blue", "blue"], [ticket("PAR", "BRU", 15), ticket("MAD", "BAR", 5)]);
  g.players[0].trains = 4;
  const context = P.networks(P.observe(g, 0), 0, g.players[0].tickets, P.countCards(g.players[0].hand), 10);
  assert.ok(context.options.every(p => p.routes.reduce((sum, r) => sum + r.n, 0) <= 4));
  assert.equal(chooseBotAction(g, 0, first).routeId, 0);
});

test("gray payments preserve the color required by the rest of the destination network", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "gray"), route(1, "BRU", "AMS", 4)],
    [...Array(4).fill("red"), "blue", "blue"], [ticket("PAR", "BRU", 8), ticket("PAR", "AMS", 15)]);
  const action = chooseBotAction(g, 0, first);
  assert.equal(action.routeId, 0);
  assert.equal(action.color, "blue");
  assert.equal(action.wildCount, 0);
});

test("secures a threatened bottleneck before an equally affordable quiet segment", () => {
  const g = fixture([route(0, "PAR", "BRU", 3, "blue"), route(1, "BRU", "AMS", 3),
    route(2, "AMS", "ESS", 2, "green", { owner: 1 })],
    ["blue", "blue", "blue", "red", "red", "red"], [ticket("PAR", "AMS", 20)]);
  assert.equal(chooseBotAction(g, 0, first).routeId, 1);
});

test("public hand size changes the estimated time before a rival can close", () => {
  const g = fixture([route(0, "PAR", "BRU", 6)], [], []);
  g.players[1].trains = 8; g.players[1].hand = [];
  const slow = P.horizon(P.observe(g, 0), 0);
  g.players[1].hand = Array(12).fill("blue");
  const quick = P.horizon(P.observe(g, 0), 0);
  assert.ok(quick < slow);
  assert.equal(quick, 2);
});

test("saves a reserve before attempting a tunnel with no spare payment cards", () => {
  const g = fixture([route(0, "PAR", "BRU", 4, "red", { tunnel: true })], Array(4).fill("red"), [ticket("PAR", "BRU")]);
  assert.equal(chooseBotAction(g, 0, first).type, "draw_train");
  g.players[0].hand.push("red", "red");
  assert.equal(chooseBotAction(g, 0, first).type, "claim");
});

test("declines an affordable surcharge that consumes wildcards needed for a valuable ferry", () => {
  const g = fixture([route(0, "MAD", "BAR", 1, "blue", { tunnel: true }), route(1, "PAR", "AMS", 4, "red", { ferry: 2 })],
    ["blue", "red", "red", "wild", "wild"], [ticket("PAR", "AMS", 20)]);
  g.phase = "tunnel"; g.pending = { routeId: 0, color: "blue", surcharge: 2, base: { color: "blue", regular: 1, wild: 0 }, revealed: ["wild", "wild", "red"] };
  assert.equal(chooseBotAction(g, 0, first).type, "decline_tunnel");
});

test("last-turn evaluation can win the Express with a short connecting track", () => {
  const g = fixture([route(0, "PAR", "BRU", 4, "red", { owner: 0 }), route(1, "MAD", "BAR", 3, "red", { owner: 1 }),
    route(2, "BAR", "MAR", 2, "red", { owner: 1 }), route(3, "BRU", "AMS", 1, "blue"), route(4, "LIS", "CAD", 4, "green")],
    ["blue", ...Array(4).fill("green")]);
  g.finalRemaining = 2;
  assert.equal(chooseBotAction(g, 0, first).routeId, 3);
});

test("last-turn tunnel risk can make a guaranteed lower-scoring route more valuable", () => {
  const g = fixture([route(0, "PAR", "BRU", 4, "green", { tunnel: true }), route(1, "MAD", "BAR", 3)],
    [...Array(4).fill("green"), ...Array(3).fill("red")]);
  g.finalRemaining = 2;
  assert.equal(chooseBotAction(g, 0, first).routeId, 1);
});

test("does not trigger the final round while a feasible two-step destination is worth more", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "blue"), route(1, "BRU", "AMS", 2, "blue"), route(2, "MAD", "BAR", 3)],
    [...Array(4).fill("blue"), ...Array(3).fill("red")], [ticket("PAR", "AMS", 20)]);
  g.players[0].trains = 5;
  assert.ok([0, 1].includes(chooseBotAction(g, 0, first).routeId));
});

test("observation discards blind draw colors and rival tunnel reveals; memory resets after public payments", () => {
  const g = fixture([route(0, "PAR", "BRU", 2)], ["red"]);
  const hidden = { id: 2, type: "draw", seat: 1, index: -1 };
  Object.defineProperty(hidden, "color", { get() { throw Error("Hidden blind draw"); } });
  g.events = [{ id: 1, type: "draw", seat: 1, index: 0, color: "blue" }, hidden,
    { id: 3, type: "build", seat: 1, routeId: 0 }, { id: 4, type: "draw", seat: 1, index: 2, color: "red" }];
  g.phase = "tunnel"; g.current = 1;
  Object.defineProperty(g, "pending", { get() { throw Error("Private rival tunnel"); } });
  const view = P.observe(g, 0), memory = { eventId: 0, known: {} };
  P.rememberPublic(view, memory);
  assert.deepEqual(memory.known[1], { red: 1 });
  P.rememberPublic(view, memory);
  assert.deepEqual(memory.known[1], { red: 1 });
  assert.equal(view.tunnel, null);
  assert.equal(view.players[1].hand, undefined);
});

test("seeded matches reproduce every decision and result without changing global crypto", () => {
  const crypto = require("node:crypto"), original = crypto.randomInt;
  const trace = () => { const moves = []; const result = match({ seed: 137, onAction: ({ action, seat }) => moves.push([seat, action]) }); return { moves, result }; };
  assert.deepEqual(trace(), trace());
  assert.equal(crypto.randomInt, original);
});
