"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createDurableQueue } = require('../durable-queue');
test('serialized mutations wait for commit before state/ack, including queued timers', async () => {
  let value = 0, release; const sent = [], saved = [];
  const pending = new Promise(resolve => { release = resolve; });
  const q = createDurableQueue({ capture: () => value, restore: v => { value = v; },
    commit: async () => { await pending; saved.push(value); }, onFailure: e => { throw e; } });
  const first = q.run(() => { value++; q.dirty(); q.defer(() => sent.push('ack1')); });
  const second = q.run(() => { value++; q.dirty(); q.defer(() => sent.push('ack2')); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(value, 1); assert.deepEqual(sent, []);
  release(); await Promise.all([first, second]);
  assert.deepEqual(saved, [1, 2]); assert.deepEqual(sent, ['ack1', 'ack2']);
});
test('failed commit rolls back, discards outgoing state and acknowledgements, reports once', async () => {
  let value = 0; const sent = [], failures = [];
  const q = createDurableQueue({ capture: () => value, restore: v => { value = v; },
    commit: async () => { throw new Error('down'); }, onFailure: e => failures.push(e.message) });
  await q.run(() => { value++; q.dirty(); q.defer(() => sent.push('ack')); });
  assert.equal(value, 0); assert.deepEqual(sent, []); assert.deepEqual(failures, ['down']);
  assert.throws(() => q.dirty(), /serialized/);
});
test('a disconnected recipient cannot roll back a successful durable commit', async () => {
  let value = 0, stored = 0; const failures = [], received = [];
  const q = createDurableQueue({ capture: () => value, restore: v => { value = v; },
    commit: async () => { stored = value; }, onFailure: e => failures.push(e) });
  await q.run(() => { value++; q.dirty(); q.defer(() => { throw new Error('socket gone'); }); q.defer(() => received.push(value)); });
  assert.equal(value, 1); assert.equal(stored, 1); assert.deepEqual(failures, []); assert.deepEqual(received, [1]);
});
