"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createPartitionedQueue } = require('../backend/partitioned-queue');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a blocked room does not hold another room; same-room commands and lifecycle remain ordered', async () => {
  const states = { a: 0, b: 0 }, delivered = [], persisted = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const q = createPartitionedQueue({ capture: key => states[key], restore: (value, key) => { states[key] = value; },
    onFailure: error => { throw error; }, commit: async key => {
      if (key === 'a') await gate;
      persisted.push([key, states[key]]);
    } });
  const draw = key => q.run(() => { states[key]++; q.dirty(); const value = states[key]; q.defer(() => delivered.push([key, value])); }, 'draw', null, key);
  const a1 = draw('a'), a2 = draw('a'), b = draw('b');
  await b;
  assert.deepEqual(delivered, [['b', 1]]); assert.equal(states.a, 1);
  const barrier = q.run(() => delivered.push(['barrier']));
  const b2 = draw('b'); await tick(); assert.equal(states.b, 1);
  release(); await Promise.all([a1, a2, barrier, b2]); await q.idle();
  assert.deepEqual(delivered, [['b', 1], ['a', 1], ['a', 2], ['barrier'], ['b', 2]]);
  assert.deepEqual(persisted, [['b', 1], ['a', 1], ['a', 2], ['b', 2]]);
});

test('rollback and transaction-local metadata cannot overwrite another room', async () => {
  const state = { a: 0, b: 0 }, delivered = [], failures = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const q = createPartitionedQueue({ capture: key => state[key], restore: (value, key) => { state[key] = value; },
    onFailure: (_error, key) => failures.push(key), commit: async key => {
      assert.equal(q.transaction.key, key); assert.equal(q.transaction.marker, key);
      if (key === 'a') { await gate; throw Error('lost response'); }
    } });
  const write = key => q.run(() => { q.transaction.marker = key; state[key]++; q.dirty(); q.defer(() => delivered.push(key)); }, 'draw', null, key);
  const a = write('a'); await write('b'); release(); await a;
  assert.deepEqual(state, { a: 0, b: 1 }); assert.deepEqual(delivered, ['b']); assert.deepEqual(failures, ['a']);
  assert.equal(q.transaction, undefined); assert.throws(() => q.dirty(), /serialized/);
});
