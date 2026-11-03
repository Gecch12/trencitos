"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const Engine = require("../backend/engine");
const { createPlayerActionHandler } = require("../game/application/player-action");
const { actionReply } = require("../game/compat/legacy-action-reply");
const { fingerprintAction } = require("../game/infrastructure/command-fingerprint");

function fixture({ initial = false, practice = false } = {}) {
  const context = { time: 1000, paused: false, random: () => 0 };
  const game = Engine.newGame(["A", "B"], 0, context.time, null, { random: context.random });
  if (!initial) for (const seat of [0, 1]) Engine.action(game, seat, { type: "choose_initial", indexes: [0, 1] }, { now: context.time, random: context.random });
  const room = { game, members: [{}, {}], practice, revision: 10 }, stages = [];
  const ports = { engine: Engine, fingerprintAction, now: () => context.time, random: max => context.random(max),
    storagePaused: () => context.paused,
    stageRoom: (r, automatic = false) => { stages.push({ room: structuredClone(r), automatic });return true; },
  };
  return { room, context, stages, ports, submit: createPlayerActionHandler(ports) };
}
const draw = { commandId: "request-0001", expectedRevision: 10, action: { type: "draw_train", index: -1 } };
const code = result => result.error?.code;

test("a player command stages game, revision and bounded per-seat receipt before returning an acceptance", () => {
  const f = fixture(), before = f.room.game.players[0].hand.length;
  f.room.members[0].actionIds = Array.from({ length: 128 }, (_, i) => `previous-${i}`);
  const command = structuredClone(draw), result = f.submit(f.room, 0, command);
  const drawEventId = f.room.game.events.findLast(e => e.type === "draw").id;
  assert.deepEqual(result, { status: "accepted", commandId: draw.commandId, drawEventId });
  assert.deepEqual(command, draw);
  assert.equal(f.room.game.players[0].hand.length, before + 1);
  assert.equal(f.room.revision, 11);assert.equal(f.stages.length, 1);
  assert.deepEqual(f.stages[0].room, f.room);
  assert.equal(f.room.members[0].actionIds.length, 128);
  assert.equal(f.room.members[0].actionIds[0], "previous-1");
  assert.equal(f.room.members[0].actionIds.at(-1), draw.commandId);
  assert.deepEqual(f.room.members[0].actionReceipts, [{ id: draw.commandId, fingerprint: fingerprintAction(draw.action), drawEventId }]);
  assert.deepEqual(actionReply(result), { type: "ack", id: draw.commandId, drawEventId });
  assert.equal(f.room.members[1].actionIds, undefined);
  assert.equal(f.room.game.deck.length + f.room.game.face.length + f.room.game.discard.length + f.room.game.players.flatMap(p => p.hand).length, 110);
});

test("unstarted games and malformed IDs reject before deadlines or state changes", () => {
  const f = fixture(), before = structuredClone(f.room);
  f.context.time = f.room.game.turnDeadline + 1;
  for (const commandId of [null, 17, {}, "short", "bad id 000", "x".repeat(81)]) {
    assert.equal(code(f.submit(f.room, 0, { ...draw, commandId })), "INVALID_COMMAND_ID");
    assert.deepEqual(f.room, before);
  }
  f.room.game = null;
  assert.equal(code(f.submit(f.room, 0, { ...draw, commandId: null })), "MATCH_NOT_STARTED");
  assert.equal(f.stages.length, 0);
});

test("a legacy duplicate keeps its receipt semantics without expiring, checking revision or executing again", () => {
  const f = fixture();f.room.members[0].actionIds = [draw.commandId];
  f.context.time = f.room.game.turnDeadline + 1;
  f.room.members[0].autopilot = true;
  f.context.random = () => { throw Error("duplicate consumed randomness"); };
  const before = structuredClone(f.room);
  const result = f.submit(f.room, 0, { ...draw, expectedRevision: -1, action: { type: "pass" } });
  assert.deepEqual(result, { status: "duplicate", commandId: draw.commandId });
  assert.deepEqual(f.room, before);assert.equal(f.stages.length, 1);
  assert.equal(f.room.members[0].actionReceipts, undefined);
  assert.deepEqual(actionReply(result), { type: "ack", id: draw.commandId });
});

test("new receipts accept identical reordered actions but reject reused IDs before clocks, control or randomness", () => {
  const f = fixture(), accepted = f.submit(f.room, 0, draw);
  f.context.time = f.room.game.turnDeadline + 1;f.room.members[0].autopilot = true;f.context.paused = true;
  f.context.random = () => { throw Error("retry consumed randomness"); };
  const before = structuredClone(f.room);
  assert.deepEqual(f.submit(f.room, 0, { ...draw, expectedRevision: -999, action: { index: -1, type: "draw_train" } }),
    { ...accepted, status: "duplicate" });
  assert.equal(f.stages.length, 2);
  for (const action of [{ type: "draw_train", index: 0 }, { type: "pass" }, null, undefined]) {
    assert.equal(code(f.submit(f.room, 0, { ...draw, action })), "COMMAND_ID_CONFLICT");
    assert.deepEqual(f.room, before);
  }
  assert.equal(f.stages.length, 2, "conflicts do not stage history or views");
});

test("receipt eviction keeps the last 128 IDs across legacy and new commands without extending retries", () => {
  const f = fixture();
  const ids = Array.from({ length: 128 }, (_, i) => `previous-${i}`);
  f.room.members[0].actionIds = ids;
  f.room.members[0].actionReceipts = ids.slice(0, 127).map(id => ({ id, fingerprint: fingerprintAction(draw.action) }));
  assert.equal(f.submit(f.room, 0, { ...draw, commandId: ids[0] }).status, "duplicate");
  assert.deepEqual(f.room.members[0].actionIds, ids, "a retry does not refresh its place in the window");
  assert.equal(f.submit(f.room, 0, draw).status, "accepted");
  assert.equal(f.room.members[0].actionIds.length, 128);
  assert.equal(f.room.members[0].actionReceipts.length, 127);
  assert.ok(!f.room.members[0].actionReceipts.some(r => r.id === ids[0]));
  assert.ok(!f.room.members[0].actionReceipts.some(r => r.id === ids[127]), "legacy fingerprint is not invented");
  assert.equal(code(f.submit(f.room, 0, { ...draw, commandId: ids[0] })), "STALE_ACTION");
  assert.equal(f.submit(f.room, 0, { ...draw, commandId: ids[0], expectedRevision: f.room.revision }).status, "accepted");
  assert.equal(f.room.members[0].actionIds.at(-1), ids[0]);
});

test("private choices accept a shared old revision and the same ID belongs to each seat independently", () => {
  const f = fixture({ initial: true });
  const command = { commandId: "initial-0001", expectedRevision: 0, action: { type: "choose_initial", indexes: [0, 1] } };
  for (const seat of [0, 1]) assert.equal(f.submit(f.room, seat, { ...command, action: { ...command.action, indexes: [0, seat + 1] } }).status, "accepted");
  assert.equal(f.room.game.phase, "play");assert.equal(f.room.revision, 12);
  assert.ok(f.room.members.every(m => m.actionIds[0] === command.commandId));
  assert.notEqual(f.room.members[0].actionReceipts[0].fingerprint, f.room.members[1].actionReceipts[0].fingerprint);
  const other = fixture({ initial: true });
  assert.equal(other.submit(other.room, 0, { ...command, action: { ...command.action, indexes: [1, 2] } }).status, "accepted");
  const offer = f.submit(f.room, 0, { action: { type: "draw_tickets" } });
  assert.equal(offer.status, "accepted");assert.equal(f.room.game.current, 1);
  const offerId = f.room.game.players[0].offer.id;
  assert.equal(f.submit(f.room, 0, { expectedRevision: -99, action: { type: "keep_tickets", offerId, indexes: [0] } }).status, "accepted");
  assert.equal(f.room.game.players[0].offer, null);
  assert.equal(f.room.members[0].actionReceipts.length, 1, "commands without an ID do not create receipts");
});

test("stale public actions and autopilot cannot change a player's hand or create a receipt", () => {
  const f = fixture(), before = structuredClone(f.room);
  assert.equal(code(f.submit(f.room, 0, { ...draw, expectedRevision: 9 })), "STALE_ACTION");
  assert.deepEqual(f.room, before);assert.equal(f.stages.length, 1);
  f.room.members[0].autopilot = true;
  assert.equal(code(f.submit(f.room, 0, { ...draw, expectedRevision: 9 })), "AUTOPILOT_ACTIVE");
  assert.equal(f.stages.length, 1);assert.deepEqual(f.room.game, before.game);
  assert.equal(f.room.members[0].actionIds, undefined);
});

test("a late command stages the expired turn before rejecting its obsolete revision", () => {
  const f = fixture(), hand = f.room.game.players[0].hand.length;
  f.context.time = f.room.game.turnDeadline;
  assert.equal(code(f.submit(f.room, 0, draw)), "STALE_ACTION");
  assert.equal(f.room.game.players[0].hand.length, hand + 2);
  assert.equal(f.room.game.current, 1);assert.equal(f.room.revision, 11);
  assert.deepEqual(f.stages.map(s => s.automatic), [true, false]);
  assert.equal(f.stages[0].room.game.current, 1);
  assert.equal(f.room.members[0].actionIds, undefined);
});

test("an engine rejection preserves a valid deadline advance but never records the rejected command", () => {
  const f = fixture(), hand = f.room.game.players[0].hand.length;
  f.context.time = f.room.game.turnDeadline;
  const result = f.submit(f.room, 0, { ...draw, expectedRevision: undefined });
  assert.equal(code(result), "GAME_ACTION_REJECTED");
  assert.equal(result.error.legacyMessage, "No es tu turno.");
  assert.equal(f.room.game.players[0].hand.length, hand + 2);
  assert.equal(f.room.revision, 11);assert.equal(f.room.members[0].actionIds, undefined);
  assert.equal(f.stages.at(-1).room.game.current, 1);
});

test("practice keeps the legacy timing order: stale check first, engine deadline advance on execution", () => {
  const f = fixture({ practice: true });f.context.time = f.room.game.turnDeadline;
  const before = structuredClone(f.room);
  assert.equal(code(f.submit(f.room, 0, { ...draw, expectedRevision: 9 })), "STALE_ACTION");
  assert.deepEqual(f.room, before);
  assert.equal(code(f.submit(f.room, 0, draw)), "GAME_ACTION_REJECTED");
  assert.equal(f.room.game.current, 1);assert.equal(f.room.revision, before.revision);
  assert.deepEqual(f.stages.map(s => s.automatic), [false, false]);
});

test("local rollback after an action returns a storage error and removes its receipt with the state", () => {
  const f = fixture(), before = structuredClone(f.room);
  const submit = createPlayerActionHandler({ ...f.ports, stageRoom: room => {
    assert.equal(room.revision, before.revision + 1);
    assert.equal(room.members[0].actionIds.at(-1), draw.commandId);
    assert.equal(room.members[0].actionReceipts.at(-1).fingerprint, fingerprintAction(draw.action));
    Object.assign(room, structuredClone(before));f.context.paused = true;return false;
  } });
  assert.equal(code(submit(f.room, 0, draw)), "ACTION_NOT_SAVED");
  assert.deepEqual(f.room, before);
});

test("failure to save the preliminary expiry prevents the player command", () => {
  const f = fixture(), before = structuredClone(f.room);
  f.context.time = f.room.game.turnDeadline;let saves = 0;
  const submit = createPlayerActionHandler({ ...f.ports, stageRoom: (room, automatic) => {
    saves++;assert.equal(automatic, true);assert.equal(room.game.current, 1);
    Object.assign(room, structuredClone(before));f.context.paused = true;return false;
  } });
  assert.equal(code(submit(f.room, 0, { ...draw, expectedRevision: undefined })), "STORAGE_PAUSED");
  assert.equal(saves, 1);assert.deepEqual(f.room, before);
});

test("application execution has no transport, storage, clock or random globals and trusts only injected context", () => {
  const forbidden = () => { throw Error("unexpected ambient dependency"); };
  const module = { exports: {} }, math = Object.create(Math);math.random = forbidden;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../game/application/player-action.js"), "utf8"), {
    module, require: forbidden, Date: class { static now() { forbidden(); } }, Math: math,
    fetch: forbidden, setTimeout: forbidden, process: new Proxy({}, { get: forbidden }),
  });
  const f = fixture();let randomCalls = 0;
  f.room.game.discard.push(...f.room.game.deck.splice(0));
  f.context.random = () => { randomCalls++;return 0; };
  const submit = module.exports.createPlayerActionHandler(f.ports);
  const result = submit(f.room, 0, { ...draw, now: Infinity, random: forbidden, seat: 1 });
  assert.equal(result.status, "accepted");assert.ok(randomCalls > 0);
  assert.equal(f.room.game.current, 0);assert.ok(f.room.game.turnDeadline > f.context.time);
  assert.equal(f.room.members[1].actionIds, undefined);
});

test("legacy replies preserve wire messages/codes and never include the game or an internal reason", () => {
  const cases = {
    MATCH_NOT_STARTED: { message: "La partida aún no empieza." },
    INVALID_COMMAND_ID: { message: "Identificador de acción inválido." },
    COMMAND_ID_CONFLICT: { message: "Este identificador ya se usó para otra acción. Revisa la mesa e inténtalo de nuevo.", code: "COMMAND_ID_CONFLICT" },
    STORAGE_PAUSED: { message: "No se pudo guardar.", code: "STORAGE_FAILED" },
    AUTOPILOT_ACTIVE: { message: "El bot controla tu puesto. Pulsa Recuperar control." },
    STALE_ACTION: { message: "La mesa cambió. Revisa la jugada e inténtalo otra vez.", code: "STALE_ACTION" },
    ACTION_NOT_SAVED: { message: "La acción no se guardó y no fue aplicada. Partida pausada.", code: "STORAGE_FAILED" },
  };
  for (const [code, expected] of Object.entries(cases)) assert.deepEqual(actionReply({ status: "rejected", error: { code } }), { type: "error", ...expected });
  assert.deepEqual(actionReply({ status: "rejected", error: { code: "GAME_ACTION_REJECTED", legacyMessage: "No es tu turno." } }), { type: "error", message: "No es tu turno." });
  assert.deepEqual(JSON.parse(JSON.stringify(actionReply({ status: "accepted" }))), { type: "ack" });
});
