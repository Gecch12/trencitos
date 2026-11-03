"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../backend/engine");
const { createGameClock } = require("../backend/game-clock");
const zero = () => 0;
function act(g, seat, message, now = 0) { E.action(g, seat, message, { now, random: zero }); }
function playing(count = 2) {
  const g = E.newGame(Array.from({ length: count }, (_, i) => `P${i}`), 0, 0);
  for (let i = 0; i < count; i++) act(g, i, { type: "choose_initial", indexes: [0, 1] });
  return g;
}
function takeTurn(g, seat, now) {
  act(g, seat, { type: "draw_train", index: -1 }, now);
  act(g, seat, { type: "draw_train", index: -1 }, now);
}
function fakeClock() {
  let time = 0, sequence = 0;
  const timers = new Map();
  return {
    now: () => time, timers,
    setTimer(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    tick(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      time = end;
    },
  };
}

test("initial choice has one shared minute; expiry keeps two distinct tickets for every pending seat", () => {
  const g = E.newGame(["A", "B"], 0, 0), offered = [...g.players[0].pending];
  assert.equal(g.turnDeadline, 60000);
  assert.equal(E.expire(g, 59999, zero), false);
  assert.equal(E.expire(g, 60000, zero), true);
  assert.deepEqual(g.players[0].tickets, offered.slice(0, 2));
  assert.equal(g.current, 0);
  assert.equal(g.turnDeadline, 120000);
  assert.equal(g.players[1].tickets.length, 2);
  assert.equal(g.phase, "play");
  assert.equal(g.initialDone, 2);
  assert.equal(g.current, 0);
});

test("an idle turn lasts exactly 60 seconds and automatically draws two private cards", () => {
  const g = playing(), before = g.players[0].hand.length;
  assert.equal(E.expire(g, 59999), false);
  E.expire(g, 60000);
  assert.equal(g.players[0].hand.length, before + 2);
  assert.equal(g.current, 1);
  assert.equal(g.turnDeadline, 120000);
  assert.equal(g.drawCount, 0);
  const own = E.view(g, 0).events.filter(e => e.type === "draw");
  const rival = E.view(g, 1).events.filter(e => e.type === "draw");
  assert.equal(own.length, 2);
  assert.ok(own.every(e => typeof e.color === "string"));
  assert.ok(rival.every(e => !("color" in e)));
  assert.equal(E.expire(g, 60000), false);
});

test("first draw does not reset the deadline; timeout draws only the missing card", () => {
  const g = playing(), before = g.players[0].hand.length, serial = g.turnSerial;
  act(g, 0, { type: "draw_train", index: -1 }, 59000);
  assert.equal(g.turnDeadline, 60000);
  assert.equal(g.turnSerial, serial);
  E.expire(g, 60000);
  assert.equal(g.players[0].hand.length, before + 2);
  assert.equal(g.events.filter(e => e.type === "draw").length, 2);
  assert.equal(g.current, 1);
});

test("expired turns take only available blind cards, including none, then advance", () => {
  for (const deck of [[], ["red"]]) {
    const g = playing(), before = g.players[0].hand.length;
    g.deck = [...deck]; g.discard = []; g.face = ["blue"];
    E.expire(g, 60000);
    assert.equal(g.players[0].hand.length, before + deck.length);
    assert.deepEqual(g.face, ["blue"]); // Never invent a choice from the face-up market.
    assert.equal(g.current, 1);
  }
});

test("tunnel reveal freezes the clock, timeout declines, and result precedes the next turn", () => {
  const g = playing();
  g.routes = [{ id: 0, a: "PAR", b: "BRU", n: 2, color: "red", tunnel: true, ferry: 0, owner: null }];
  g.players[0].hand = ["red", "red", "red"]; g.deck = ["red", "blue", "green"];
  act(g, 0, { type: "claim", routeId: 0, color: "red" }, 10000);
  assert.equal(g.turnDeadline, null);
  E.expire(g, g.pending.until);
  assert.equal(g.turnDeadline, 62800);
  E.expire(g, g.turnDeadline);
  assert.equal(g.pending.stage, "result"); assert.equal(g.current, 0);
  assert.deepEqual(g.players[0].hand, ["red", "red", "red"]);
  assert.equal(g.routes[0].owner, null);
  E.expire(g, g.pending.until);
  assert.equal(g.phase, "play"); assert.equal(g.current, 1);
  assert.equal(g.turnDeadline, 122800 + E.TUNNEL_RESULT_MS);
});

test("offer stays mandatory on turn return, survives restore, then starts a full minute", () => {
  for (const automatic of [false, true]) {
    let g = playing();
    act(g, 0, { type: "draw_tickets" }, 10000);
    const offer = g.players[0].offer;
    assert.equal(offer.deadline, 70000);
    takeTurn(g, 1, 11000);
    assert.equal(g.current, 0);
    assert.equal(g.turnDeadline, null);
    assert.equal(g.turnWaiting, true);
    const events = g.events.length;
    g = JSON.parse(JSON.stringify(g));
    E.ensureTiming(g, 12000); E.ensureTiming(g, 13000);
    assert.equal(g.events.length, events);
    assert.equal(g.players[0].offer.deadline, 70000);
    for (const type of ["draw_train", "claim", "station", "draw_tickets", "pass"])
      assert.throws(() => act(g, 0, { type, index: -1 }, 12000), /billetes pendientes/);
    assert.equal(E.expire(g, 69999), false);
    const at = automatic ? 70000 : 69999;
    if (automatic) E.expire(g, at, max => max - 1);
    else act(g, 0, { type: "keep_tickets", offerId: offer.id, indexes: [2] }, at);
    assert.equal(g.players[0].offer, null);
    assert.deepEqual(g.players[0].tickets.at(-1), offer.tickets[2]);
    assert.equal(g.current, 0);
    assert.equal(g.turnWaiting, false);
    assert.equal(g.turnDeadline, at + E.TURN_MS);
    assert.equal(g.drawCount, 0);
    act(g, 0, { type: "draw_train", index: -1 }, at + 1);
    assert.equal(g.drawCount, 1);
  }
});

test("simultaneous private offers settle off-turn without changing the active turn or draw count", () => {
  const g = playing(3);
  act(g, 0, { type: "draw_tickets" }, 1000);
  act(g, 1, { type: "draw_tickets" }, 2000);
  act(g, 2, { type: "draw_train", index: -1 }, 3000);
  const serial = g.turnSerial, deadline = g.turnDeadline, first = g.players[0].offer, second = g.players[1].offer;
  assert.equal(E.view(g, 0).ticketOffer.id, first.id);
  assert.equal(E.view(g, 1).ticketOffer.id, second.id);
  assert.equal(E.view(g, 2).ticketOffer, null);
  assert.ok(E.view(g, 2).players.every(p => !p.offer && !p.pending && !p.tickets));
  act(g, 0, { type: "keep_tickets", offerId: first.id, indexes: [1] }, 4000);
  assert.equal(g.current, 2);
  assert.equal(g.drawCount, 1);
  assert.equal(g.turnSerial, serial);
  assert.equal(g.turnDeadline, deadline);
  assert.equal(g.players[1].offer, second);
  assert.throws(() => act(g, 1, { type: "keep_tickets", offerId: first.id, indexes: [0] }, 4000), /ya no/);
  E.expire(g, second.deadline, zero);
  assert.equal(g.players[1].tickets.at(-1), second.tickets[0]);
});

test("last turn waits for private offer deadline before calculating results", () => {
  const g = playing(); g.finalRemaining = 1;
  act(g, 0, { type: "draw_tickets" }, 25000);
  const offer = g.players[0].offer;
  assert.equal(g.phase, "closing");
  assert.equal(g.result, null);
  assert.equal(g.turnDeadline, null);
  assert.equal(E.view(g, 1).closingDeadline, 85000);
  assert.equal(E.expire(g, 84999), false);
  E.expire(g, 85000, zero);
  assert.equal(g.phase, "finished");
  assert.equal(g.result.find(p => p.seat === 0).tickets.at(-1), offer.tickets[0]);
  assert.equal(g.logs.filter(l => l.startsWith("Partida finalizada")).length, 1);
});

test("explicit practice finish settles pending offers and scores just once", () => {
  const g = playing(); g.finalRemaining = 1;
  act(g, 0, { type: "draw_tickets" });
  E.finish(g, true);
  assert.equal(g.phase, "finished");
  assert.equal(g.players[0].tickets.length, 3);
  assert.equal(g.logs.filter(l => l.startsWith("Partida finalizada")).length, 1);
});

test("absolute deadlines survive JSON persistence and reads; legacy tickets migrate once", () => {
  const g = playing(); act(g, 0, { type: "draw_tickets" }, 10000);
  const restored = JSON.parse(JSON.stringify(g));
  E.ensureTiming(restored, 15000); E.view(restored, 0); E.view(restored, 1);
  assert.equal(restored.turnDeadline, 70000);
  assert.equal(restored.players[0].offer.deadline, 70000);
  const legacy = playing(); legacy.phase = "tickets";
  legacy.pending = { tickets: legacy.shortDeck.splice(0, 3) };
  E.ensureTiming(legacy, 15000);
  assert.equal(legacy.phase, "play"); assert.equal(legacy.current, 1);
  assert.equal(legacy.players[0].offer.deadline, 75000);
  E.ensureTiming(legacy, 20000);
  assert.equal(legacy.players[0].offer.deadline, 75000);
  assert.equal(legacy.current, 1);
});

test("action at deadline resolves timeout first and cannot double-spend the old turn", () => {
  const g = playing(), before = g.players[0].hand.length;
  assert.throws(() => act(g, 0, { type: "draw_train", index: -1 }, 60000), /turno/);
  assert.equal(g.players[0].hand.length, before + 2);
  assert.equal(g.current, 1);
  assert.equal(E.expire(g, 60000), false);
});

test("late ticket confirmation cannot override the automatic random choice", () => {
  const g = playing(); act(g, 0, { type: "draw_tickets" }, 1000);
  const offer = g.players[0].offer;
  assert.throws(() => act(g, 0, { type: "keep_tickets", offerId: offer.id, indexes: [1, 2] }, 61000), /ya no/);
  assert.equal(g.players[0].tickets.length, 3);
  assert.equal(g.players[0].tickets.at(-1), offer.tickets[0]);
  assert.equal(g.players[0].offer, null);
});

test("server clock wakes at earliest deadline, is idempotent, and cancels deleted rooms", () => {
  const time = fakeClock(), room = { code: "CLOCK", game: playing() }, rooms = new Map([[room.code, room]]), updates = [];
  const clock = createGameClock({ rooms, ...time, sendRoom: (r, automatic) => { updates.push(automatic); clock.sync(r); } });
  clock.sync(room); clock.sync(room);
  assert.equal(time.timers.size, 1);
  time.tick(59999); assert.equal(room.game.current, 0);
  time.tick(1); assert.equal(room.game.current, 1); assert.deepEqual(updates, [true]);
  assert.equal(time.timers.size, 1);
  act(room.game, 1, { type: "draw_tickets" }, time.now()); clock.sync(room);
  time.tick(1000); takeTurn(room.game, 0, time.now()); clock.sync(room);
  assert.equal([...time.timers.values()][0].at, 120000); // Only the offer is counting down.
  time.tick(59000); assert.equal(room.game.players[1].offer, null);
  assert.equal(room.game.current, 1); assert.equal(room.game.turnDeadline, 180000);
  rooms.delete(room.code); clock.sync(room);
  assert.equal(time.timers.size, 0);
  clock.close();
});

test("server clock runs initial timeout without a browser action and close clears handles", () => {
  const time = fakeClock(), room = { code: "INIT", game: E.newGame(["A", "B"], 0, 0) }, rooms = new Map([[room.code, room]]);
  const clock = createGameClock({ rooms, ...time, sendRoom() {} });
  clock.sync(room); time.tick(59999); assert.equal(room.game.initialDone, 0);
  time.tick(1); assert.equal(room.game.initialDone, 2); assert.equal(room.game.turnDeadline, 120000);
  clock.close(); assert.equal(time.timers.size, 0);
});
