"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const E = require("../engine");

function state() {
  const g = E.newGame(["A", "B"]);
  g.phase = "play";
  g.players.forEach(p => { p.hand = []; p.tickets = []; p.pending = []; });
  g.deck = []; g.face = []; g.discard = [];
  g.routes = [{ id: 0, a: "PAR", b: "BRU", n: 2, color: "red", ferry: 0, tunnel: false, owner: null }];
  return g;
}
const inventory = g => [...g.deck, ...g.discard, ...g.face, ...g.players.flatMap(p => p.hand), ...(g.phase === "tunnel" && g.pending.stage !== "result" ? g.pending.revealed : [])].sort();

test("construction immediately shuffles spent cards with the remaining deck exactly once", t => {
  const g = state();
  g.deck = ["green", "blue", "yellow"];
  g.players[0].hand = ["red", "wild", "purple"];
  const before = inventory(g), tickets = structuredClone(g.shortDeck);
  const random = t.mock.method(crypto, "randomInt", () => 0);
  E.action(g, 0, { type: "claim", routeId: 0, color: "red", wildCount: 1 });
  assert.equal(g.deck.length, 5);
  assert.equal(random.mock.callCount(), 4); // One Fisher–Yates shuffle of 5 cards.
  assert.deepEqual(g.discard, []);
  assert.deepEqual(g.players[0].hand, ["purple"]);
  assert.deepEqual(inventory(g), before);
  assert.deepEqual(g.shortDeck, tickets);
});
test("station payments also return to the deck immediately", () => {
  const g = state(); g.deck = ["black"]; g.players[0].hand = ["wild"];
  E.action(g, 0, { type: "station", city: "PAR", color: "wild" });
  assert.deepEqual([...g.deck].sort(), ["black", "wild"]);
  assert.deepEqual(g.discard, []);
});
for (const decision of ["pay_tunnel", "decline_tunnel"]) test(`pending tunnel isolates reveals; ${decision} recycles one batch`, t => {
  const g = state(); g.routes[0].tunnel = true;
  g.players[0].hand = ["red", "red", "wild"];
  g.deck = ["purple", "blue", "green", "red"];
  const before = inventory(g), hand = [...g.players[0].hand];
  const random = t.mock.method(crypto, "randomInt", () => 0);
  E.action(g, 0, { type: "claim", routeId: 0, color: "red", wildCount: 0 });
  assert.equal(g.phase, "tunnel"); assert.equal(random.mock.callCount(), 0);
  assert.deepEqual(g.players[0].hand, hand);
  assert.deepEqual(g.deck, ["purple"]);
  assert.deepEqual(inventory(g), before);
  E.expire(g, g.pending.until);
  const pending = structuredClone(g);
  assert.throws(() => E.action(g, 0, { type: "pay_tunnel", extraWild: 0 }), /cartas/);
  assert.deepEqual(g, pending);
  E.action(g, 0, { type: decision, extraWild: 1 });
  E.expire(g, g.pending.until);
  assert.equal(g.phase, "play"); assert.deepEqual(g.discard, []);
  assert.equal(g.deck.length, decision === "pay_tunnel" ? 7 : 4);
  assert.equal(random.mock.callCount(), g.deck.length - 1);
  assert.deepEqual(inventory(g), before);
  if (decision === "decline_tunnel") assert.deepEqual(g.players[0].hand, hand);
});
test("visible draw replaces only its slot; rejected draws and reads never shuffle", t => {
  const g = state(); g.deck = ["orange", "purple"];
  g.face = ["red", "wild", "green", "blue", "yellow"];
  const random = t.mock.method(crypto, "randomInt", () => 0);
  E.action(g, 0, { type: "draw_train", index: 2 });
  assert.deepEqual(g.face, ["red", "wild", "purple", "blue", "yellow"]);
  assert.deepEqual(g.players[0].hand, ["green"]);
  const before = structuredClone(g);
  assert.throws(() => E.action(g, 0, { type: "draw_train", index: 1 }), /locomotora/);
  for (let i = 0; i < 10; i++) E.view(g, i % 2);
  assert.deepEqual(g, before);
  assert.equal(random.mock.callCount(), 0);
});
test("three visible locomotives recycle without losing cards, including impossible markets", () => {
  for (const regular of [0, 1, 2, 3, 8]) for (let iteration = 0; iteration < 30; iteration++) {
    const g = state(); g.face = Array(5).fill("wild");
    g.deck = [...Array(regular).fill("blue"), ...Array(4).fill("wild")];
    const before = inventory(g);
    E.refill(g);
    assert.equal(g.face.length, 5); assert.deepEqual(g.discard, []);
    assert.deepEqual(inventory(g), before);
    if (regular >= 3) assert.ok(g.face.filter(c => c === "wild").length < 3);
  }
});
test("every market slot can be drawn and a depleted deck remains usable", () => {
  for (let index = 0; index < 5; index++) {
    const g = state(); g.face = ["red", "green", "blue", "orange", "yellow"]; g.deck = ["purple"];
    const before = [...g.face], inventoryBefore = inventory(g);
    E.action(g, 0, { type: "draw_train", index });
    before[index] = "purple";
    assert.deepEqual(g.face, before); assert.deepEqual(inventory(g), inventoryBefore);
    E.action(g, 0, { type: "draw_train", index });
    assert.equal(g.face.length, 4); assert.deepEqual(inventory(g), inventoryBefore);
  }
});
test("private ticket progress uses compatible station assignments, never opponent secrets", () => {
  const g = state();
  g.routes = [
    { id: 0, a: "PAR", b: "BRU", n: 2, owner: 1 },
    { id: 1, a: "PAR", b: "FRA", n: 3, owner: 1 },
    { id: 2, a: "BRU", b: "AMS", n: 1, owner: 0 },
  ];
  g.players[0].tickets = [
    { id: 1, a: "BRU", b: "AMS", p: 5 },
    { id: 2, a: "PAR", b: "AMS", p: 10 },
    { id: 3, a: "PAR", b: "FRA", p: 8 },
  ];
  assert.deepEqual(E.view(g, 0).ticketProgress.map(p => p.completed), [true, false, false]);
  g.players[0].placed = ["PAR"];
  const v = E.view(g, 0);
  assert.deepEqual(v.ticketProgress, [
    { id: 1, completed: true, viaStation: false },
    { id: 2, completed: true, viaStation: true },
    { id: 3, completed: false, viaStation: false },
  ]);
  assert.equal(g.players[0].score, 0);
  assert.ok(v.players.every(p => !("ticketProgress" in p) && !("tickets" in p)));
  assert.deepEqual(E.view(g, 1).ticketProgress, []);
});
