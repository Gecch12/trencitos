"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../backend/engine");
const UI = require("../frontend/game-ui");

test("server starter uses one bounded uniform draw, preserves seats and cycles from every result", () => {
  for (let count = 2; count <= 5; count++) for (let first = 0; first < count; first++) {
    const names = Array.from({ length: count }, (_, i) => `P${i}`);
    let draws = 0;
    const g = E.newRandomGame(names, 0, bound => { draws++; assert.equal(bound, count); return first; });
    assert.equal(draws, 1);
    assert.equal(g.current, first);
    assert.deepEqual(g.players.map(p => p.name), names);
    assert.equal(E.view(g, 0).history[0].seat, first);
    for (let offset = 0; offset < count; offset++) {
      assert.equal(g.current, first);
      E.action(g, (first + offset) % count, { type: "choose_initial", indexes: [0, 1] }, { now: offset });
    }
    assert.equal(g.phase, "play"); assert.equal(g.current, first);
    const restored = JSON.parse(JSON.stringify(g));
    E.ensureTiming(restored, 50);
    assert.equal(restored.first, first); assert.equal(restored.current, first);
    assert.equal(restored.turnDeadline, g.turnDeadline);
    assert.equal(draws, 1);
  }
});

test("history identifies duplicate names by seat, leaves system/legacy messages unattributed and caps entries", () => {
  const g = E.newGame(["Same", "Same"]); g.phase = "play";
  for (let i = 0; i < 4; i++) E.action(g, g.current, { type: "draw_train", index: -1 });
  assert.deepEqual(E.view(g, 0).history.map(e => e.seat), [1, 1, 0, 0]);
  const ids = E.view(g, 0).history.map(e => e.id);
  assert.equal(new Set(ids).size, 4);
  E.note(g, "Aviso del sistema");
  assert.equal(E.view(g, 1).history[0].seat, null);
  delete g.history;
  E.note(g, "Same se reconectó", 1);
  assert.equal(E.view(g, 0).history[0].seat, 1);
  assert.ok(E.view(g, 0).history.slice(1).every(e => e.seat === null));
  for (let i = 0; i < 30; i++) E.note(g, "Same robó una carta de tren.", i % 2);
  const history = E.view(g, 0).history;
  assert.equal(history.length, 25);
  assert.deepEqual(history.map(e => e.text), g.logs);
  assert.deepEqual(history.map(e => e.seat), Array.from({ length: 25 }, (_, i) => (29 - i) % 2));
});

test("destination endpoints remain independent and edge markers stay inside the unobscured map", () => {
  const safe = { x: 16, y: 60, width: 800, height: 500 };
  assert.deepEqual(UI.endpointPosition({ x: 200, y: 200 }, safe), { x: 200, y: 200, outside: false, angle: Math.atan2(-110, -216) * 180 / Math.PI });
  for (const point of [{ x: -100, y: 200 }, { x: 1200, y: 200 }, { x: 500, y: -100 }, { x: 500, y: 900 }]) {
    const marker = UI.endpointPosition(point, safe);
    assert.equal(marker.outside, true);
    assert.ok(marker.x >= 40 && marker.x <= 792);
    assert.ok(marker.y >= 84 && marker.y <= 536);
  }
});

test("waiting for tickets disables building and passing in the client without exposing the offer", () => {
  const g = E.newGame(["A", "B"]); g.phase = "play";
  E.action(g, 0, { type: "draw_tickets" });
  E.action(g, 1, { type: "draw_train", index: -1 });
  E.action(g, 1, { type: "draw_train", index: -1 });
  const own = E.view(g, 0), rival = E.view(g, 1);
  assert.equal(own.turnWaiting, true); assert.equal(own.turnDeadline, null);
  assert.equal(rival.waitingDeadline, own.ticketOffer.deadline);
  assert.equal(rival.ticketOffer, null);
  assert.match(UI.construction(own, 0, { city: "MAD" }).reason, /pendiente/);
  assert.equal(UI.canPass(own, 0, Object.keys(E.CITIES)), false);
});
