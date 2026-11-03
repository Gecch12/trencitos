"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { fingerprintAction } = require("../game/infrastructure/command-fingerprint");

test("persisted v1 fingerprints keep their exact encoding", () => {
  assert.equal(fingerprintAction({ type: "draw_train", index: -1 }),
    "sha256-json-v1:43f1f256efddd76965058059a47014539415ac6f2e3783e49a564d193f9ffc19");
});

test("fingerprints canonicalize nested JSON keys, retain array order and distinguish action values", () => {
  const action = Object.freeze({ type: "choose_initial", indexes: Object.freeze([0, 1]), extra: Object.freeze({ z: 1, a: true }) });
  const fingerprint = fingerprintAction(action);
  assert.match(fingerprint, /^sha256-json-v1:[0-9a-f]{64}$/);
  assert.equal(fingerprintAction({ extra: { a: true, z: 1 }, indexes: [0, 1], type: "choose_initial" }), fingerprint);
  for (const changed of [
    { ...action, indexes: [1, 0] }, { ...action, indexes: [0] }, { ...action, type: "keep_tickets" },
    { ...action, extra: { z: "1", a: true } }, { ...action, offerId: 7 },
  ]) assert.notEqual(fingerprintAction(changed), fingerprint);
  assert.notEqual(fingerprintAction(null), fingerprintAction(undefined));
  assert.notEqual(fingerprintAction({}), fingerprintAction(JSON.parse('{"__proto__":{"secret":true}}')));
  assert.equal({}.secret, undefined);
});
