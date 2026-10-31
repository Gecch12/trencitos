"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../engine");
const { createMultiplayerController, shiftDeadlines, GRACE_MS } = require("../multiplayer");
const { chooseReplacementAction } = require("../bots");

function fixture(started = true) {
  let time = 0, serial = 0;
  const timers = new Map(), sent = [], rooms = new Map();
  const socket = () => ({ closed: false, send: m => sent.push(m) });
  const room = { code: "TEST01", hostSeat: 0, members: ["A", "B", "C"].map(name => ({ name, ws: socket() })), game: null };
  if (started) {
    room.game = E.newGame(room.members.map(m => m.name), 0, time);
    room.members.forEach((m, i) => E.action(room.game, i, { type: "choose_initial", indexes: [0, 1] }, { now: time }));
  }
  rooms.set(room.code, room);
  let ctrl;
  const publish = r => { ctrl.reconcile(r); ctrl.sync(r); };
  ctrl = createMultiplayerController({ rooms, now: () => time,
    setTimer(fn, ms) { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; },
    clearTimer: id => timers.delete(id), sendRoom: publish,
    removeRoom: r => { rooms.delete(r.code); ctrl.cancel(r); },
    expireGame: r => { const changed = E.expire(r.game, time); if (changed) publish(r); return changed; },
    performAction: (r, seat, a) => { E.action(r.game, seat, a, { now: time }); publish(r); },
  });
  function tick(ms) {
    const end = time + ms;
    for (let count = 0; count < 500; count++) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { time = end; return; }
      time = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    throw Error("Timer loop");
  }
  return { room, rooms, ctrl, tick, publish, timers, socket, sent };
}
test("lobby departure reindexes sockets and transfers host without deleting connected guests", () => {
  const f = fixture(false);
  f.ctrl.removeSeat(f.room, 0); f.publish(f.room);
  assert.deepEqual(f.room.members.map(m => m.name), ["B", "C"]);
  assert.equal(f.room.hostSeat, 0);
  assert.equal(f.room.members[1].ws.seat, 1);
  assert.equal(f.sent[0].type, "room_closed");
});
test("lobby reserves a disconnected seat for exactly one minute, then releases it", () => {
  const f = fixture(false); f.room.members[0].ws = null; f.publish(f.room);
  f.tick(GRACE_MS - 1); assert.equal(f.room.members.length, 3);
  f.tick(1); assert.equal(f.room.members.length, 2); assert.equal(f.room.members[0].name, "B");
  assert.equal(f.room.hostSeat, 0);
});
test("started games keep seats and pieces when the host disconnects", () => {
  const f = fixture(); f.room.game.routes[0].owner = 0;
  f.room.members[0].ws = null; f.publish(f.room); f.tick(GRACE_MS);
  assert.equal(f.room.hostSeat, 1); assert.equal(f.room.members.length, 3);
  assert.equal(f.room.game.routes[0].owner, 0);
});
test("all disconnected cancels bots and abandons only after the reconnect grace", () => {
  const f = fixture(); f.room.members[0].autopilot = true;
  f.room.members.forEach(m => m.ws = null); f.publish(f.room);
  const before = JSON.stringify(f.room.game);
  f.tick(GRACE_MS - 1); assert.equal(JSON.stringify(f.room.game), before);
  assert.equal(f.rooms.has(f.room.code), true);
  f.tick(1); assert.equal(f.rooms.has(f.room.code), false); assert.equal(f.timers.size, 0);
});
test("brief total disconnection preserves remaining turn and offer time without granting a fresh minute", () => {
  const f = fixture(); const g = f.room.game;
  g.players[1].offer = { id: 1, tickets: g.shortDeck.splice(0,3), deadline: 40000 };
  f.room.members.forEach(m => m.ws = null); f.publish(f.room); f.tick(20000);
  f.room.members[0].ws = f.socket(); f.publish(f.room);
  assert.equal(g.turnDeadline, 80000); assert.equal(g.players[1].offer.deadline, 60000);
  assert.equal(f.room.emptySince, null); f.tick(40000); assert.equal(f.rooms.has(f.room.code), true);
});
test("two expired playing turns enable replacement; reclaim never interrupts the current bot turn", () => {
  const f = fixture(); const g = f.room.game;
  E.expire(g, g.turnDeadline); f.publish(f.room);
  assert.equal(g.players[0].missedTurns, 1); assert.ok(!f.room.members[0].autopilot);
  g.current = 0; E.ensureTiming(g, 60000); E.expire(g, g.turnDeadline); f.publish(f.room);
  assert.equal(f.room.members[0].autopilot, true);
  g.current = 0; E.ensureTiming(g, 120000);
  f.ctrl.requestControl(f.room, 0); f.publish(f.room);
  assert.equal(f.room.members[0].autopilot, true);
  E.next(g, 120001); f.publish(f.room);
  assert.equal(f.room.members[0].autopilot, false); assert.equal(g.players[0].missedTurns, 0);
});
test("a completed human turn breaks the consecutive-timeout streak; a partial draw does not", () => {
  const f = fixture(), g = f.room.game;
  g.players[0].missedTurns = 1;
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 1 });
  assert.equal(g.players[0].missedTurns, 1);
  E.action(g, 0, { type: "draw_train", index: -1 }, { now: 2 });
  assert.equal(g.players[0].missedTurns, 0);
});
test("replacement bot can randomly draw even with affordable routes, never sees private opponents", () => {
  const f = fixture(), g = f.room.game;
  g.players[0].hand = Array(10).fill("wild");
  const before = JSON.stringify(g);
  const build = chooseReplacementAction(g, 0, () => 0);
  const draw = chooseReplacementAction(g, 0, n => n - 1);
  assert.equal(build.type, "claim"); assert.equal(draw.type, "draw_train");
  assert.equal(JSON.stringify(g), before);
  const copy = structuredClone(g); E.action(copy, 0, build, { now: 0 });
});
test("deadline shifting covers the shared initial clock and every pending offer", () => {
  const g = E.newGame(["A", "B"], 0, 0); shiftDeadlines(g, 5000);
  assert.equal(g.initialDeadline, 65000); assert.equal(g.turnDeadline, 65000);
});
