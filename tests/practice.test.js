"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../backend/engine");
const { createPracticeController } = require("../backend/practice");

function setup(random = () => 0, options = {}) {
  let time = 0, id = 0;
  const timers = new Map();
  const clock = {
    now: () => time,
    setTimer(fn, delay) { const key = ++id; timers.set(key, { fn, at: time + delay }); return key; },
    clearTimer(key) { timers.delete(key); },
    tick(ms) {
      const end = time + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      time = end;
    },
    timers,
  };
  const messages = [];
  const human = { closed: false, send: (message) => messages.push(message) };
  const room = {
    code: "TEST01", practice: true,
    members: [{ name: "Humano", ws: human }, ...[1, 2, 3].map((i) => ({ name: `Bot ${i}`, bot: true }))],
    game: Engine.newGame(["Humano", "Bot 1", "Bot 2", "Bot 3"]),
  };
  human.room = room;
  human.seat = 0;
  const rooms = new Map([[room.code, room]]);
  const updates = [];
  const controller = createPracticeController({
    ...options, rooms, random, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    sendRoom: (r) => { updates.push(clock.now()); controller.sync(r); },
  });
  function disconnect(at = clock.now()) {
    room.members[0].ws = null;
    controller.disconnected(room, at);
  }
  return { clock, room, rooms, human, messages, updates, controller, disconnect };
}

test("initial bots choose together after 800–1000 ms without waiting for the human", () => {
  for (const upper of [false, true]) {
    const { clock, room, controller, updates } = setup((max) => upper ? max - 1 : 0);
    controller.sync(room);
    controller.sync(room); // A broadcast cannot queue a second action.
    const delay = upper ? 1000 : 800;
    clock.tick(delay - 1);
    assert.equal(room.game.initialDone, 0);
    clock.tick(1);
    assert.equal(room.game.initialDone, 3);
    clock.tick(delay * 2);
    assert.equal(room.game.phase, "initial");
    assert.equal(room.game.players[0].pending.length, 4);
    Engine.action(room.game, 0, { type: "choose_initial", indexes: [0, 1] });
    controller.sync(room);
    assert.equal(room.game.phase, "play");
    assert.equal(room.game.current, 0);
    assert.deepEqual(updates, [delay]);
    assert.equal(clock.timers.size, 0);
  }
});

test("each of the two train draws is a separate delayed action", () => {
  const { clock, room, controller, updates } = setup();
  room.game.phase = "play";
  room.game.current = 1;
  room.game.routes = [];
  controller.sync(room);
  clock.tick(800);
  assert.equal(room.game.current, 1);
  assert.equal(room.game.drawCount, 1);
  clock.tick(799);
  assert.equal(updates.length, 1);
  clock.tick(1);
  assert.equal(room.game.current, 2);
  assert.deepEqual(updates, [800, 1600]);
});

test("practice controller actually saves for a destination instead of building a cheap unrelated route", () => {
  const { clock, room, controller } = setup();
  const g = room.game;
  g.phase = "play"; g.current = 1;
  g.players[1].hand = ["red", "red"];
  g.players[1].tickets = [{ a: "PAR", b: "BRU", p: 10 }];
  g.routes = [
    { id: 0, a: "PAR", b: "BRU", n: 6, color: "red", owner: null, ferry: 0, tunnel: false },
    { id: 1, a: "MAD", b: "BAR", n: 2, color: "red", owner: null, ferry: 0, tunnel: false },
  ];
  g.face = ["red", "red", "blue", "green", "black"];
  g.deck = ["yellow", "purple", "white"];
  controller.sync(room);
  clock.tick(1600);
  assert.equal(g.current, 2);
  assert.equal(g.players[1].hand.filter(c => c === "red").length, 4);
  assert.equal(g.players[1].trains, 45);
  assert.ok(g.routes.every(r => r.owner === null));
  assert.deepEqual(g.events.filter(e => e.type === "draw").map(e => e.seat), [1, 1]);
  controller.close();
});

test("finish stops an already scheduled bot and computes results immediately", () => {
  const { clock, room, controller } = setup();
  room.game.current = 1;
  controller.sync(room);
  controller.finish(room);
  assert.equal(room.game.phase, "finished");
  assert.equal(room.earlyFinish, true);
  assert.equal(room.game.result.length, 4);
  const state = JSON.stringify(room.game);
  clock.tick(10000);
  controller.finish(room);
  assert.equal(JSON.stringify(room.game), state);
  assert.equal(clock.timers.size, 0);
});

test("finish abandons an unpaid tunnel without spending cards or awarding its route", () => {
  const { room, controller } = setup();
  const game = room.game;
  game.phase = "play";
  game.routes = [{ id: 0, a: "PAR", b: "BRU", n: 2, color: "red", tunnel: true, ferry: 0, owner: null }];
  game.players[0].hand = ["red", "red"];
  game.deck = ["red", "blue", "green"];
  Engine.action(game, 0, { type: "claim", routeId: 0, color: "red" });
  assert.equal(game.phase, "tunnel");
  controller.finish(room);
  assert.equal(game.routes[0].owner, null);
  assert.deepEqual(game.players[0].hand, ["red", "red"]);
  assert.equal(game.pending, null);
  assert.equal(game.phase, "finished");
  assert.deepEqual(game.discard, []);
  assert.deepEqual([...game.deck].sort(), ["blue", "green", "red"]);
});

test("disconnect pauses bots and expires at exactly 30 seconds, even after repeated broadcasts", () => {
  const { clock, room, rooms, controller, disconnect } = setup();
  room.game.current = 1;
  controller.sync(room);
  clock.tick(300);
  disconnect();
  const state = JSON.stringify(room.game);
  clock.tick(10000);
  controller.sync(room);
  clock.tick(19999);
  assert.ok(rooms.has(room.code));
  assert.equal(JSON.stringify(room.game), state);
  clock.tick(1);
  assert.equal(rooms.size, 0);
  assert.equal(clock.timers.size, 0);
  clock.tick(10000);
  assert.equal(JSON.stringify(room.game), state);
});

test("reconnection before expiry preserves the game and restarts automatic turns", () => {
  const { clock, room, rooms, human, controller, disconnect } = setup();
  room.game.current = 1;
  controller.sync(room);
  disconnect();
  clock.tick(29999);
  room.members[0].ws = human;
  controller.sync(room);
  clock.tick(1);
  assert.ok(rooms.has(room.code));
  assert.equal(room.game.initialDone, 0);
  clock.tick(799);
  assert.equal(room.game.initialDone, 3);
  disconnect();
  clock.tick(29999);
  assert.ok(rooms.has(room.code));
  clock.tick(1);
  assert.equal(rooms.size, 0);
});

test("connected readers have no inactivity timeout and silent failures use the last response", () => {
  const { clock, room, rooms, controller, disconnect } = setup();
  controller.sync(room);
  clock.tick(120000);
  assert.ok(rooms.has(room.code));
  disconnect(clock.now() - 10000);
  clock.tick(19999);
  assert.ok(rooms.has(room.code));
  clock.tick(1);
  assert.equal(rooms.size, 0);
});

test("leaving deletes the room, releases the socket and cancels every timer", () => {
  const { clock, room, rooms, human, messages, controller } = setup();
  room.game.current = 1;
  controller.sync(room);
  controller.remove(room);
  assert.equal(rooms.size, 0);
  assert.equal(human.room, null);
  assert.equal(human.seat, -1);
  assert.deepEqual(messages, [{ type: "room_closed" }]);
  assert.equal(clock.timers.size, 0);
  controller.remove(room);
  controller.sync(room);
  clock.tick(5000);
  assert.equal(room.game.initialDone, 0);
});

test("bots yield when remaining destination draws and stations have no strategic value", () => {
  const { clock, room, controller } = setup();
  room.game.phase = "play";
  room.game.current = 1;
  room.game.deck = room.game.discard = room.game.face = room.game.routes = [];
  const tickets = room.game.shortDeck.length;
  controller.sync(room);
  clock.tick(800);
  assert.equal(room.game.current, 2);
  assert.equal(room.game.shortDeck.length, tickets);
  assert.equal(room.game.players[1].stations, 3);
});

test("a bot settles its ticket offer during the human turn without resetting the human deadline", () => {
  const { clock, room, controller, updates } = setup();
  const g = room.game;
  g.phase = "play"; g.current = 0;
  g.routes = [{ id: 0, a: "PAR", b: "BRU", n: 2, color: "red", owner: 1, ferry: 0, tunnel: false }];
  g.players[1].offer = { id: 8, deadline: Date.now() + 60000, tickets: [
    { id: 100, a: "PAR", b: "BRU", p: 8 }, { id: 101, a: "MAD", b: "BAR", p: 12 },
  ] };
  Engine.ensureTiming(g, Date.now());
  const deadline = g.turnDeadline, serial = g.turnSerial;
  controller.sync(room); clock.tick(799);
  assert.ok(g.players[1].offer);
  clock.tick(1);
  assert.equal(g.players[1].offer, null);
  assert.deepEqual(g.players[1].tickets.map(t => t.id), [100]);
  assert.equal(g.current, 0); assert.equal(g.turnDeadline, deadline); assert.equal(g.turnSerial, serial);
  assert.deepEqual(updates, [800]);
  assert.equal(clock.timers.size, 0);
});

test("closing schedules outstanding bot choices and finishes without waiting for their timeout", () => {
  const { clock, room, controller } = setup();
  const g = room.game;
  g.phase = "closing"; g.finalRemaining = 0; g.current = 0;
  g.players.forEach(p => { p.pending = []; });
  g.routes = [{ id: 0, a: "PAR", b: "BRU", n: 2, color: "red", owner: 1, ferry: 0, tunnel: false }];
  g.players[1].offer = { id: 9, deadline: Date.now() + 60000, tickets: [{ id: 100, a: "PAR", b: "BRU", p: 8 }] };
  controller.sync(room); clock.tick(800);
  assert.equal(g.phase, "finished");
  assert.equal(g.result.find(r => r.seat === 1).destination, 8);
  assert.equal(clock.timers.size, 0);
});

test("disconnect pauses pending bot ticket choices and reconnect resumes them", () => {
  const { clock, room, human, controller, disconnect } = setup();
  const g = room.game;
  g.phase = "play"; g.current = 0;
  g.players[1].offer = { id: 10, deadline: Date.now() + 60000, tickets: [{ id: 100, a: "PAR", b: "BRU", p: 8 }] };
  controller.sync(room); disconnect(); clock.tick(1000);
  assert.ok(g.players[1].offer);
  room.members[0].ws = human;
  controller.sync(room); clock.tick(800);
  assert.equal(g.players[1].offer, null);
  controller.close();
});

test("ordinary multiplayer rooms are unaffected by practice controls and expiry", () => {
  const { clock, room, rooms, controller, disconnect } = setup();
  room.practice = false;
  room.game.current = 1;
  controller.sync(room);
  controller.finish(room);
  controller.remove(room);
  disconnect();
  clock.tick(60000);
  assert.ok(rooms.has(room.code));
  assert.equal(room.game.phase, "initial");
  assert.equal(room.game.initialDone, 0);
});

test('practice bots cannot advance while durable history is unavailable',()=>{
 let blocked=false;const {clock,room,controller}=setup(()=>0,{blocked:()=>blocked});
 controller.sync(room);blocked=true;clock.tick(1000);assert.equal(room.game.initialDone,0);
 controller.sync(room);clock.tick(1000);assert.equal(room.game.initialDone,0);
 blocked=false;controller.sync(room);clock.tick(800);assert.equal(room.game.initialDone,3);controller.close();
});
