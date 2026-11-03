"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../backend/engine");
function ready() {
  const g = E.newGame(["A", "B"], 0, 0, null, { random: max => max - 1 });
  for (const seat of [0,1]) E.action(g, seat, { type: "choose_initial", indexes: [0,1] }, { now: 0, random: () => 0 });
  return g;
}
const forbidden = () => { throw Error("unexpected randomness"); };
const inventory = g => [...g.deck, ...g.discard, ...g.face, ...g.players.flatMap(p => p.hand)].sort();

test("draw facade preserves pile and hand containers, event ordering and original deadlines", () => {
  const g = ready();g.deck = ["purple", "orange"];g.face = ["red", "wild", "blue", "green", "yellow"];
  const deck = g.deck, face = g.face, discard = g.discard, hand = g.players[0].hand, deadline = g.turnDeadline, serial = g.turnSerial;
  const before = inventory(g), cursor = g.eventSerial, observed = [];E.observe(g, event => observed.push(event));
  E.action(g, 0, { type: "draw_train", index: 2 }, { now: 100, random: forbidden });
  assert.equal(g.deck, deck);assert.equal(g.face, face);assert.equal(g.discard, discard);assert.equal(g.players[0].hand, hand);
  assert.equal(g.turnDeadline, deadline);assert.equal(g.turnSerial, serial);assert.equal(g.drawCount, 1);
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 200, random: forbidden });
  assert.equal(g.turnSerial, serial + 1);assert.equal(g.current, 1);assert.equal(g.drawCount, 0);
  assert.deepEqual(g.events.filter(e => e.id > cursor).map(e => e.type), ["draw", "draw", "turn"]);
  assert.equal(observed.length, 2);assert.deepEqual(inventory(g), before);
});

test("renewal precedes the accepted draw, keeps public evidence, and hidden colors stay private after save", () => {
  const g = ready();g.face = ["wild", "wild", "red", "blue", "green"];g.deck = ["orange", "yellow", "purple", "white", "wild"];
  const before = inventory(g), oldFace = g.face, cursor = g.eventSerial;
  E.action(g, 0, { type: "draw_train", index: 2 }, { now: 100, random: max => max - 1 });
  assert.notEqual(g.face, oldFace);
  assert.deepEqual(g.events.filter(e => e.id > cursor).map(e => e.type), ["market_refresh", "draw"]);
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 200, random: max => max - 1 });
  assert.deepEqual(inventory(g), before);
  const restored = JSON.parse(JSON.stringify(g));
  for (const seat of [-1,0,1]) {
    const view = E.view(restored, seat);
    assert.equal(Object.hasOwn(view.drawEvent, "color"), seat === 0);
    assert.equal(Object.hasOwn(view.events.findLast(e => e.type === "draw"), "color"), seat === 0);
    assert.equal(Object.hasOwn(view.history.find(e => e.draw?.index === -1).draw, "color"), seat === 0);
    assert.deepEqual(view.events.find(e => e.type === "market_refresh"), g.events.find(e => e.type === "market_refresh"));
    assert.equal(Object.hasOwn(view, "deck"), false);
  }
});

test("rejected draws do not change piles, counters, events, observers or randomness", () => {
  for (const [index, pattern] of [[99,/Carta inexistente/], ["0",/Carta inexistente/], [-1,/No hay cartas/], [0,/locomotora visible/]]) {
    const g = ready();g.deck = [];g.discard = [];g.face = ["wild"];g.drawCount = 1;
    const before = structuredClone(g), observed = [];E.observe(g, event => observed.push(event));
    assert.throws(() => E.action(g, 0, { type: "draw_train", index }, { now: 100, random: forbidden }), pattern);
    assert.deepEqual(g, before);assert.deepEqual(observed, []);
  }
});

test("timeout draws only the remaining blind card, records it once, and preserves hidden information", () => {
  const g = ready();g.deck = ["wild", "blue"];g.face = ["wild"];
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 100, random: forbidden });
  const serial = g.turnSerial, observed = [];E.observe(g, event => observed.push(event));
  const deadline = g.turnDeadline;
  assert.equal(E.expire(g, deadline, forbidden), true);
  assert.equal(g.turnSerial, serial + 1);assert.equal(g.drawSerial, 2);assert.equal(g.lastDraw.color, "wild");
  assert.deepEqual(observed, [{ seat: 0, action: { type: "draw_train", index: -1 }, automatic: true }]);
  assert.equal(E.expire(g, deadline, forbidden), false);
  assert.equal(Object.hasOwn(E.view(g, -1).drawEvent, "color"), false);
});

test("depletion ends the turn once and a late command cannot draw on the expired turn", () => {
  const g = ready();g.deck = [];g.face = ["red", "wild"];
  const serial = g.turnSerial;
  E.action(g, 0, { type: "draw_train", index: 0 }, { now: 100, random: forbidden });
  assert.equal(g.current, 1);assert.equal(g.turnSerial, serial + 1);
  const h = ready();h.deck = ["green", "blue"];h.face = [];
  assert.throws(() => E.action(h, 0, { type: "draw_train", index: -1 }, { now: 60000, random: forbidden }), /turno/);
  assert.equal(h.current, 1);assert.equal(h.drawSerial, 2);assert.equal(h.deck.length, 0);
});
