"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../backend/engine");
const { chooseBotAction, chooseReplacementAction } = require("../backend/bots");

const first = () => 0;
const last = n => n - 1;
const route = (id, a, b, n, color = "red", extra = {}) => ({ id, a, b, n, color, owner: null, ferry: 0, tunnel: false, ...extra });
const ticket = (a, b, p = 10) => ({ a, b, p });
function fixture(routes, hand = [], tickets = []) {
  const g = E.newGame(["Bot", "Rival 1", "Rival 2", "Rival 3"]);
  g.phase = "play"; g.current = 0; g.routes = routes;
  g.players[0].hand = hand; g.players[0].tickets = tickets;
  g.face = ["red", "green", "blue", "black", "yellow"];
  return g;
}

test("initial destinations favor a shared corridor over a disconnected expensive pair", () => {
  const g = fixture([route(0, "PAR", "BRU", 2), route(1, "BRU", "AMS", 2), route(2, "MAD", "BAR", 8), route(3, "BAR", "MAR", 8)]);
  g.phase = "initial";
  g.players[0].pending = [ticket("PAR", "AMS", 8), ticket("PAR", "BRU", 5), ticket("MAD", "MAR", 8)];
  const before = JSON.stringify(g);
  for (const rng of [first, last]) assert.deepEqual(chooseBotAction(g, 0, rng), { type: "choose_initial", indexes: [0, 1] });
  assert.equal(JSON.stringify(g), before);
});

for (const n of [1, 2, 3]) test(`saves for a six-car destination instead of spending on an unrelated ${n}-car route`, () => {
  const g = fixture([route(0, "PAR", "BRU", 6), route(1, "MAD", "BAR", n)], Array(3).fill("red"), [ticket("PAR", "BRU")]);
  for (const rng of [first, last]) assert.deepEqual(chooseBotAction(g, 0, rng), { type: "draw_train", index: 0 });
  g.players[0].hand = Array(6).fill("red"); g.turnSerial += 4;
  assert.equal(chooseBotAction(g, 0, first).routeId, 0);
});

test("a short connection that completes a destination takes priority over a profitable unrelated route", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 0 }), route(1, "BRU", "AMS", 1, "blue"), route(2, "MAD", "BAR", 6)],
    ["blue", ...Array(6).fill("red")], [ticket("PAR", "AMS", 12)]);
  assert.equal(chooseBotAction(g, 0, last).routeId, 1);
});

test("recognizes a completing alternate bridge even when the shortest planned bridge is unaffordable", () => {
  const g = fixture([route(0, "PAR", "BRU", 2, "red", { owner: 0 }), route(1, "BRU", "AMS", 1, "blue"), route(2, "PAR", "AMS", 3, "green")],
    ["green", "green", "green"], [ticket("PAR", "AMS", 12)]);
  assert.equal(chooseBotAction(g, 0, first).routeId, 2);
});

test("gray-route savings keep their chosen color through subsequent draws and turns", () => {
  const g = fixture([route(0, "PAR", "BRU", 6, "gray")], ["red", "blue"], [ticket("PAR", "BRU")]);
  assert.equal(chooseBotAction(g, 0, first).index, 0);
  g.drawCount = 1; g.players[0].hand.push("red");
  assert.equal(chooseBotAction(g, 0, last).index, 0);
  g.drawCount = 0; g.turnSerial += 4;
  assert.equal(chooseBotAction(g, 0, last).index, 0);
});

test("equally useful targets are held across own turns before a slow plan is reconsidered", () => {
  const g = fixture([route(0, "PAR", "BRU", 6), route(1, "MAD", "BAR", 6, "blue")], ["red", "red", "blue", "blue"]);
  assert.equal(chooseBotAction(g, 0, first).index, 0);
  for (let turn = 0; turn < 3; turn++) {
    g.turnSerial += 4;
    assert.equal(chooseBotAction(g, 0, last).index, 0);
  }
  g.turnSerial += 4;
  assert.equal(chooseBotAction(g, 0, last).index, 2);
});

test("a blocked target is replaced by an available detour, respecting parallel-track restrictions", () => {
  const g = fixture([route(0, "PAR", "BRU", 4), route(1, "PAR", "BRU", 4, "green"),
    route(2, "PAR", "AMS", 3, "blue"), route(3, "AMS", "BRU", 3, "blue")], ["red", "red"], [ticket("PAR", "BRU")]);
  g.players.pop();
  g.players[0].stations = 0; // Exercise detouring when a station cannot rescue the ticket.
  assert.equal(chooseBotAction(g, 0, first).index, 0);
  g.routes[0].owner = 1; g.turnSerial += 3;
  assert.equal(chooseBotAction(g, 0, first).index, 2);
});

test("a blocked and unreachable destination falls back to available scoring routes", () => {
  const g = fixture([route(0, "PAR", "BRU", 4, "red", { owner: 1 }), route(1, "MAD", "BAR", 2, "blue")], ["blue", "blue"], [ticket("PAR", "BRU")]);
  g.players[0].stations = 0;
  assert.equal(chooseBotAction(g, 0, first).routeId, 1);
});

test("useful visible colors beat blind draws; an unhelpful market leads to the deck", () => {
  const g = fixture([route(0, "PAR", "BRU", 4)], ["red"], [ticket("PAR", "BRU")]);
  assert.equal(chooseBotAction(g, 0, last).index, 0);
  g.face = ["blue", "green", "black"];
  assert.equal(chooseBotAction(g, 0, first).index, -1);
  g.deck = []; g.discard = [];
  assert.ok(chooseBotAction(g, 0, last).index >= 0);
});

test("mandatory ferry locomotives are targeted, but visible locomotives never become a second draw", () => {
  const g = fixture([route(0, "PAR", "BRU", 4, "red", { ferry: 2 })], ["red", "red", "red", "red"], [ticket("PAR", "BRU")]);
  g.face = ["red", "wild", "blue"];
  assert.equal(chooseBotAction(g, 0, first).index, 1);
  g.drawCount = 1;
  assert.notEqual(chooseBotAction(g, 0, last).index, 1);
  g.players[0].hand.push("wild", "wild"); g.drawCount = 0;
  const action = chooseBotAction(g, 0, first);
  assert.equal(action.type, "claim"); assert.equal(action.wildCount, 2);
});

test("last turn spends on an affordable high-scoring route instead of continuing an unattainable plan", () => {
  const g = fixture([route(0, "PAR", "BRU", 8, "green"), route(1, "MAD", "BAR", 1), route(2, "BAR", "MAR", 4)], Array(4).fill("red"), [ticket("PAR", "BRU")]);
  g.finalRemaining = 2;
  assert.equal(chooseBotAction(g, 0, last).routeId, 2);
  g.drawCount = 1;
  assert.equal(chooseBotAction(g, 0, first).type, "draw_train");
});

test("an opponent nearing the final round discourages long-term saving", () => {
  const g = fixture([route(0, "PAR", "BRU", 8, "green"), route(1, "MAD", "BAR", 4)], Array(4).fill("red"), [ticket("PAR", "BRU")]);
  assert.equal(chooseBotAction(g, 0, first).type, "draw_train");
  g.players[1].trains = 5; g.turnSerial += 4;
  assert.equal(chooseBotAction(g, 0, first).routeId, 1);
});

test("accumulated hands and exhausted draws trigger useful construction instead of endless saving", () => {
  for (const exhausted of [false, true]) {
    const g = fixture([route(0, "PAR", "BRU", 8, "green"), route(1, "MAD", "BAR", 4)], Array(exhausted ? 4 : 18).fill("red"), [ticket("PAR", "BRU")]);
    if (exhausted) g.deck = g.discard = g.face = [];
    assert.equal(chooseBotAction(g, 0, last).routeId, 1);
  }
});

test("plans never inspect opponents' private data or the deck/discard order and never mutate game state", () => {
  const g = fixture([route(0, "PAR", "BRU", 4)], ["red", "red"], [ticket("PAR", "BRU")]);
  const before = JSON.stringify(g);
  const guarded = new Proxy(g, { get(target, key) {
    if (key === "players") return target.players.map((p, i) => i === 0 ? p : new Proxy(p, { get(player, field) {
      if (["hand", "tickets"].includes(field)) return new Proxy(player[field], { get(cards, key) {
        if (key !== "length") throw Error(`Private opponent ${field} access: ${String(key)}`);
        return cards.length;
      } });
      if (["pending", "offer"].includes(field)) throw Error(`Private opponent access: ${field}`);
      return player[field];
    } }));
    if (["deck", "discard", "shortDeck"].includes(key)) return new Proxy(target[key], { get(cards, field) {
      if (field !== "length") throw Error(`Private deck access: ${String(field)}`);
      return cards.length;
    } });
    return target[key];
  } });
  assert.equal(chooseBotAction(guarded, 0, first).index, 0);
  assert.equal(JSON.stringify(g), before);
  const view = E.view(g, 1);
  assert.equal(view.players[0].hand, undefined);
  assert.equal(view.players[0].tickets, undefined);
  assert.equal(view.players[0].plan, undefined);
});

test("replacement players keep the coin-flip policy, independent of practice planning", () => {
  const g = fixture([route(0, "PAR", "BRU", 6), route(1, "MAD", "BAR", 1)], ["red"], [ticket("PAR", "BRU")]);
  assert.equal(chooseBotAction(g, 0, first).type, "draw_train");
  assert.equal(chooseReplacementAction(g, 0, first).routeId, 1);
  assert.equal(chooseReplacementAction(g, 0, last).type, "draw_train");
  assert.equal(chooseBotAction(g, 1, first), null);
  g.turnWaiting = true;
  assert.equal(chooseBotAction(g, 0, first), null);
});
