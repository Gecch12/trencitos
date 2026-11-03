"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Turn = require("../game/domain/turn"), Tunnel = require("../game/domain/tunnel");

const rules = Object.freeze({ colors: ["copper"], cardMs: 17, resultMs: 91, initialMs: 300, turnMs: 900, finalTrainThreshold: 3 });
function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
function run(policy, state, now, command) {
  const before = structuredClone(state);
  freeze(state);
  const context = { now, rules };
  const result = command ? policy(state, freeze(command), context) : policy(state, context);
  assert.deepEqual(state, before);
  return result;
}
function game() {
  return { phase: "play", current: 0, turnSerial: 8, finalRemaining: null, lastTrigger: null,
    drawCount: 1, pending: { unused: true }, players: [{ trains: 4 }, { trains: 8 }, { trains: 10 }] };
}
function begin({ color = "copper", revealed = ["copper", "wild", "blue"] } = {}) {
  return run(Tunnel.beginTunnel, { routeId: "SA019", base: { color, regular: color === "wild" ? 0 : 2, wild: color === "wild" ? 2 : 0 },
    revealed, turnDeadline: 300, offerDeadlines: [null, 150, 90] }, 100);
}
function decision(surcharge = 1) { return { ...begin(), surcharge, stage: "decision", until: null }; }

test("turn start uses supplied durations and preserves an existing shared initial deadline", () => {
  for (const saved of [{}, { turnDeadline: 75 }, { turnDeadline: 75, initialDeadline: 80 }, { initialDeadline: 0 }]) {
    const state = { ...game(), phase: "initial", ...saved };
    const plan = run(Turn.planTurnStart, state, 100);
    const expected = saved.initialDeadline ?? saved.turnDeadline ?? 400;
    assert.equal(plan.changes.initialDeadline, expected);
    assert.equal(plan.changes.turnDeadline, expected);
    assert.equal(plan.changes.turnSerial, 9);
    assert.equal(plan.emitTurn, false);
  }
});

test("a private offer holds the incoming turn, then grants a full turn on confirmation", () => {
  const state = game();state.players[1].offer = { deadline: 120 };
  const next = run(Turn.planNextTurn, state, 100);
  assert.equal(next.changes.current, 1);assert.equal(next.changes.turnSeat, 1);
  assert.equal(next.changes.turnWaiting, true);assert.equal(next.changes.turnDeadline, null);
  assert.equal(next.emitTurn, false);assert.equal(next.changes.drawCount, 0);assert.equal(next.changes.pending, null);
  const resumed = { ...structuredClone(state), ...next.changes };
  resumed.players[1].offer = null;
  const start = run(Turn.planTurnStart, resumed, 120);
  assert.equal(start.changes.turnDeadline, 1020);assert.equal(start.changes.turnWaiting, false);
  assert.equal(start.emitTurn, true);
});

test("final round uses the rule threshold and includes the triggering player exactly once", () => {
  let state = game();state.players[0].trains = 3;
  let plan = run(Turn.planNextTurn, state, 100);
  assert.equal(plan.finalRoundStarted, true);assert.equal(plan.changes.lastTrigger, 0);
  assert.equal(plan.changes.finalRemaining, 3);assert.equal(plan.changes.current, 1);
  state = { ...state, ...plan.changes };
  for (const current of [2, 0]) {
    plan = run(Turn.planNextTurn, state, 200);
    assert.equal(plan.finalRoundStarted, false);assert.equal(plan.finish, false);
    assert.equal(plan.changes.current, current);state = { ...state, ...plan.changes };
  }
  plan = run(Turn.planNextTurn, state, 300);
  assert.equal(plan.finish, true);assert.equal(plan.changes.finalRemaining, 0);
  assert.equal(plan.emitTurn, false);assert.equal(plan.changes.current, undefined);
  assert.equal(plan.changes.turnSerial, undefined);
});

test("ordinary turn rotation wraps around without starting a final round above the threshold", () => {
  const state = game();state.current = 2;
  const plan = run(Turn.planNextTurn, state, 100);
  assert.equal(plan.changes.current, 0);assert.equal(plan.changes.turnDeadline, 1000);
  assert.equal(plan.changes.finalRemaining, undefined);assert.equal(plan.finalRoundStarted, false);
  assert.equal(plan.emitTurn, true);
});

test("tunnel reveal uses opaque IDs, copied draws and supplied animation durations", () => {
  const tunnel = begin();
  assert.equal(tunnel.routeId, "SA019");assert.equal(tunnel.surcharge, 2);
  assert.equal(tunnel.until, 168);assert.equal(tunnel.turnRemaining, 200);
  assert.deepEqual(tunnel.offerRemaining, [null, 50, 0]);
  tunnel.base.regular = 9;tunnel.revealed.pop(); // No input reference escapes.
  assert.equal(begin().base.regular, 2);assert.equal(begin().revealed.length, 3);
  assert.equal(begin({ color: "wild" }).surcharge, 1);
  for (const revealed of [[], ["blue"], ["blue", "blue"]]) {
    const short = begin({ revealed });
    assert.equal(short.until, 100 + (revealed.length + 1) * 17);
    assert.equal(short.surcharge, 0);
  }
});

test("a late reveal restores remaining decision time and takes only one transition", () => {
  const tunnel = begin();
  assert.deepEqual(run(Tunnel.advanceTunnel, { tunnel, turnDeadline: null }, 167), { kind: "wait" });
  for (const now of [168, 5000]) {
    const plan = run(Tunnel.advanceTunnel, { tunnel, turnDeadline: null }, now);
    assert.equal(plan.kind, "decision");assert.equal(plan.turnDeadline, now + 200);
    assert.deepEqual(plan.pendingChanges, { stage: "decision", until: null });
  }
});

test("zero surcharge builds once, then the result has its full interval even after a late tick", () => {
  const tunnel = begin({ revealed: ["blue"] });
  const plan = run(Tunnel.advanceTunnel, { tunnel, turnDeadline: null }, 5000);
  assert.equal(plan.kind, "build");assert.deepEqual(plan.payments, [tunnel.base]);
  assert.equal(plan.pendingChanges.until, 5091);assert.equal(plan.pendingChanges.resultStartedAt, 5000);
  assert.deepEqual(plan.pendingChanges.extra, { color: "copper", regular: 0, wild: 0 });
  const result = { ...tunnel, ...plan.pendingChanges };
  assert.deepEqual(run(Tunnel.advanceTunnel, { tunnel: result }, 5090), { kind: "wait" });
  assert.deepEqual(run(Tunnel.advanceTunnel, { tunnel: result }, 5091), { kind: "close", offerDeadlines: [null, 5141, 5091] });
});

test("automatic supplement uses only unreserved cards, including necessary wildcards", () => {
  const tunnel = decision();
  const result = run(Tunnel.decideTunnel, { tunnel, hand: ["copper", "copper", "wild"] }, 500, { type: "pay" });
  assert.equal(result.ok, true);assert.equal(result.plan.build, true);
  assert.deepEqual(result.plan.payments, [tunnel.base, { color: "copper", regular: 0, wild: 1 }]);
  assert.deepEqual(result.plan.pendingChanges, { stage: "result", outcome: "built", reason: null,
    resultStartedAt: 500, until: 591, extra: { color: "copper", regular: 0, wild: 1 } });
});

test("explicit supplement choice is respected and cannot double spend a reserved regular or wild card", () => {
  const tunnel = decision();
  for (const wildCount of [0, 1]) {
    const result = run(Tunnel.decideTunnel, { tunnel, hand: ["copper", "copper", "copper", "wild"] }, 500, { type: "pay", wildCount });
    assert.equal(result.ok, true);assert.equal(result.plan.pendingChanges.extra.wild, wildCount);
  }
  for (const [hand, wildCount, base] of [
    [["copper", "copper", "wild"], 0, tunnel.base],
    [["copper", "wild"], 1, { color: "copper", regular: 1, wild: 1 }],
    [["wild", "wild"], undefined, tunnel.base],
    [["copper", "copper"], undefined, tunnel.base],
  ]) {
    assert.deepEqual(run(Tunnel.decideTunnel, { tunnel: { ...tunnel, base }, hand }, 500, { type: "pay", wildCount }),
      { ok: false, error: { code: "INSUFFICIENT_TUNNEL_PAYMENT" } });
  }
});

test("all-wildcard base and supplement remain collectively affordable", () => {
  const tunnel = { ...decision(), color: "wild", base: { color: "wild", regular: 0, wild: 2 } };
  const paid = run(Tunnel.decideTunnel, { tunnel, hand: ["wild", "wild", "wild"] }, 500, { type: "pay" });
  assert.equal(paid.ok, true);assert.deepEqual(paid.plan.pendingChanges.extra, { color: "wild", regular: 0, wild: 1 });
  assert.equal(run(Tunnel.decideTunnel, { tunnel, hand: ["wild", "wild", "copper"] }, 500, { type: "pay" }).ok, false);
});

test("declining needs no cards and distinguishes a timeout without building or spending", () => {
  for (const timeout of [false, true]) {
    const result = run(Tunnel.decideTunnel, { tunnel: decision(), hand: [] }, 500, { type: "decline", timeout });
    assert.equal(result.plan.build, false);assert.deepEqual(result.plan.payments, []);
    assert.equal(result.plan.pendingChanges.outcome, "declined");
    assert.equal(result.plan.pendingChanges.reason, timeout ? "timeout" : null);
    assert.equal(result.plan.pendingChanges.extra, undefined);
  }
  for (const stage of ["reveal", "result"]) {
    assert.deepEqual(run(Tunnel.decideTunnel, { tunnel: { ...decision(), stage }, hand: [] }, 500, { type: "decline" }),
      { ok: false, error: { code: "TUNNEL_DECISION_REQUIRED" } });
  }
});

test("only the active tunnel clock matters and its exact boundary expires", () => {
  const tunnel = decision();
  assert.deepEqual(run(Tunnel.advanceTunnel, { tunnel, turnDeadline: 500 }, 499), { kind: "wait" });
  assert.deepEqual(run(Tunnel.advanceTunnel, { tunnel, turnDeadline: 500 }, 500), { kind: "timeout" });
});
