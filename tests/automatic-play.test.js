"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const Engine = require("../backend/engine");
const Bots = require("../backend/bots");
const { createAutomaticPlay } = require("../game/application/automatic-play");

function fixture({ initial = false, practice = false } = {}) {
  const context = { time: 1000, random: () => 0 };
  const game = Engine.newGame(["Human", "Bot 1", "Bot 2"], 1, context.time, null, { random: context.random });
  if (!initial) for (const seat of [0, 1, 2]) Engine.action(game, seat, { type: "choose_initial", indexes: [0, 1] }, { now: context.time, random: context.random });
  const room = { game, members: [{ name: "Human" }, { name: "Bot 1", bot: true }, { name: "Bot 2", bot: true }], practice, revision: 10 };
  const stages = [], errors = [];
  const ports = { engine: Engine, ...Bots, now: () => context.time, random: max => context.random(max), botRandom: () => 0,
    stageRoom: (r, automatic) => { stages.push({ room: structuredClone(r), automatic });return true; },
    messages: { permanentPass: name => `${name} passes`, practicePass: name => `${name} practice pass` },
    onReplacementError: error => errors.push(error),
  };
  return { room, context, ports, stages, errors, use: createAutomaticPlay(ports) };
}

test("clock expiry stages one revision and no second action at the same instant", () => {
  const f = fixture(), hand = f.room.game.players[1].hand.length;
  assert.equal(f.use.expire(f.room), false);assert.equal(f.stages.length, 0);
  f.context.time = f.room.game.turnDeadline;
  assert.equal(f.use.expire(f.room), true);
  assert.equal(f.room.game.current, 2);assert.equal(f.room.game.players[1].hand.length, hand + 2);
  assert.equal(f.room.revision, 11);assert.equal(f.stages[0].automatic, true);
  const after = structuredClone(f.room);
  assert.equal(f.use.expire(f.room), false);assert.deepEqual(f.room, after);assert.equal(f.stages.length, 1);
});

for (const practice of [false, true]) {
  test(`${practice ? "practice" : "permanent"} bots batch initial choices in seat order with the legacy revision convention`, () => {
    const f = fixture({ initial: true, practice }), events = [];
    Engine.observe(f.room.game, event => events.push({ seat: event.seat, staged: f.stages.length }));
    f.use[practice ? "playPracticeBots" : "playPermanentBots"](f.room);
    assert.deepEqual(events, [{ seat: 1, staged: 0 }, { seat: 2, staged: 0 }]);
    assert.equal(f.room.game.initialDone, 2);assert.equal(f.room.game.phase, "initial");
    assert.equal(f.room.game.players[0].pending.length, 4);
    assert.equal(f.room.revision, practice ? 10 : 12);
    assert.equal(f.stages.length, 1);assert.equal(f.stages[0].automatic, practice ? undefined : true);
    assert.deepEqual(f.stages[0].room, f.room);
  });
}

for (const method of ["playPermanentBots", "playPracticeBots", "playReplacement"]) {
  test(`${method} expires a late turn before consulting a policy, even when staging rolls back`, () => {
    for (const rollback of [false, true]) {
      const f = fixture({ practice: method === "playPracticeBots" }), before = structuredClone(f.room);
      f.room.members[1].autopilot = true;
      f.context.time = f.room.game.turnDeadline;
      const forbidden = () => { throw Error("policy ran after expiry"); };
      let staged = 0;
      const use = createAutomaticPlay({ ...f.ports, chooseBotAction: forbidden, chooseReplacementAction: forbidden,
        stageRoom: room => {
          staged++;assert.equal(room.game.current, 2);
          assert.equal(room.revision, method === "playPracticeBots" ? 10 : 11);
          if (rollback) Object.assign(room, structuredClone(before));
          return !rollback;
        } });
      use[method](f.room);assert.equal(staged, 1);
      if (rollback) assert.deepEqual(f.room, before);
    }
  });
}

test("permanent bot draws remain separate actions and do not reset the first draw's deadline", () => {
  const f = fixture(), deadline = f.room.game.turnDeadline, hand = f.room.game.players[1].hand.length;
  const use = createAutomaticPlay({ ...f.ports, chooseBotAction: () => ({ type: "draw_train", index: -1 }) });
  use.playPermanentBots(f.room);
  assert.equal(f.room.game.current, 1);assert.equal(f.room.game.drawCount, 1);
  assert.equal(f.room.game.turnDeadline, deadline);assert.equal(f.room.revision, 11);
  f.context.time += 900;use.playPermanentBots(f.room);
  assert.equal(f.room.game.players[1].hand.length, hand + 2);assert.equal(f.room.game.current, 2);
  assert.equal(f.room.revision, 12);assert.equal(f.stages.length, 2);
});

test("off-turn bot offers resolve during closing without starting another turn", () => {
  for (const practice of [false, true]) {
    const f = fixture({ practice });
    Engine.action(f.room.game, 1, { type: "draw_tickets" }, { now: f.context.time, random: f.ports.random });
    f.room.game.phase = "closing";
    const current = f.room.game.current, serial = f.room.game.turnSerial;
    f.use[practice ? "playPracticeBots" : "playPermanentBots"](f.room);
    assert.equal(f.room.game.players[1].offer, null);assert.equal(f.room.game.phase, "finished");
    assert.equal(f.room.game.current, current);assert.equal(f.room.game.turnSerial, serial);
    assert.equal(f.room.revision, practice ? 10 : 11);assert.equal(f.stages.length, 1);
  }
});

test("a shared tunnel reveal keeps practice and permanent bots waiting", () => {
  const f = fixture();
  f.room.game.phase = "tunnel";f.room.game.pending = { stage: "reveal", revealed: [] };
  assert.equal(f.use.canPracticeAct(f.room), false);assert.deepEqual(f.use.permanentSeats(f.room), []);
  const before = structuredClone(f.room);f.use.playPracticeBots(f.room);
  assert.deepEqual(f.room, before);assert.equal(f.stages.length, 0);
});

test("practice and permanent opponents can yield, while a replacement waits without publishing", () => {
  for (const method of ["playPermanentBots", "playPracticeBots", "playReplacement"]) {
    const f = fixture({ practice: method === "playPracticeBots" });f.room.members[1].autopilot = true;
    const before = structuredClone(f.room), use = createAutomaticPlay({ ...f.ports, chooseBotAction: () => null, chooseReplacementAction: () => null });
    use[method](f.room);
    if (method === "playReplacement") {
      assert.deepEqual(f.room, before);assert.equal(f.stages.length, 0);
    } else {
      assert.equal(f.room.game.current, 2);assert.equal(f.stages.length, 1);
      assert.equal(f.room.game.logs[0], method === "playPermanentBots" ? "Bot 1 passes" : "Bot 1 practice pass");
      assert.equal(f.room.revision, method === "playPermanentBots" ? 11 : 10);
    }
  }
});

test("replacement rechecks control and stages a legal action; rejected actions keep the existing error path", () => {
  const f = fixture(), use = createAutomaticPlay({ ...f.ports, chooseReplacementAction: () => ({ type: "draw_train", index: -1 }) });
  use.playReplacement(f.room);assert.equal(f.stages.length, 0);
  f.room.members[1].autopilot = true;use.playReplacement(f.room);
  assert.equal(f.room.revision, 11);assert.equal(f.room.game.drawCount, 1);assert.equal(f.stages[0].automatic, true);
  const before = structuredClone(f.room);
  createAutomaticPlay({ ...f.ports, chooseReplacementAction: () => ({ type: "unknown" }) }).playReplacement(f.room);
  assert.equal(f.errors.length, 1);assert.equal(f.stages.length, 1);assert.deepEqual(f.room, before);
});

test("practice finish releases an unpaid tunnel once and conserves cards without a revision change", () => {
  const f = fixture({ practice: true }), g = f.room.game;
  g.phase = "tunnel";g.pending = { stage: "reveal", revealed: g.deck.splice(-3) };
  const hand = [...g.players[1].hand], trains = g.players[1].trains;
  f.use.finishPractice(f.room);
  assert.equal(g.phase, "finished");assert.equal(g.pending, null);assert.equal(f.room.earlyFinish, true);
  assert.deepEqual(g.players[1].hand, hand);assert.equal(g.players[1].trains, trains);
  assert.equal(g.deck.length + g.discard.length + g.face.length + g.players.flatMap(p => p.hand).length, 110);
  assert.equal(f.room.revision, 10);assert.equal(f.stages[0].automatic, undefined);
  const before = structuredClone(f.room);f.use.finishPractice(f.room);
  assert.deepEqual(f.room, before);assert.equal(f.stages.length, 1);
});

test("automatic application uses injected ports and separates policy randomness from engine randomness", () => {
  const forbidden = () => { throw Error("unexpected ambient dependency"); };
  const module = { exports: {} }, math = Object.create(Math);math.random = forbidden;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../game/application/automatic-play.js"), "utf8"), {
    module, require: forbidden, Date: class { static now() { forbidden(); } }, Math: math,
    fetch: forbidden, setTimeout: forbidden, process: new Proxy({}, { get: forbidden }), console: { error: forbidden },
  });
  const f = fixture();let engineDraws = 0, policyDraws = 0;
  f.room.game.discard.push(...f.room.game.deck.splice(0));
  const use = module.exports.createAutomaticPlay({ ...f.ports,
    random: () => { engineDraws++;return 0; }, botRandom: () => { policyDraws++;return 0; },
    chooseBotAction: (game, seat, random) => { random(2);return { type: "draw_train", index: -1 }; },
  });
  use.playPermanentBots(f.room);
  assert.ok(engineDraws > 0);assert.equal(policyDraws, 1);assert.equal(f.room.game.drawCount, 1);
});
