"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createDurableQueue } = require('../backend/durable-queue');
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

test('bounded batching commits waiting rooms together without publishing before persistence',async()=>{
 let value=0,release,commits=0;const sent=[],saved=[];
 const q=createDurableQueue({batchSize:3,capture:()=>value,restore:v=>value=v,onFailure:e=>{throw e;},commit:async()=>{commits++;if(commits===1)await new Promise(resolve=>release=resolve);saved.push(value);}});
 const run=()=>q.run(()=>{const n=++value;q.dirty();q.defer(()=>sent.push(n));});
 const first=run();await new Promise(resolve=>setImmediate(resolve));const rest=Array.from({length:7},run);
 assert.equal(value,1);assert.deepEqual(sent,[]);release();await Promise.all([first,...rest]);await q.idle();
 assert.deepEqual(saved,[1,4,7,8]);assert.deepEqual(sent,[1,2,3,4,5,6,7,8]);assert.equal(commits,4);
});
test('a failed batched commit restores every candidate room and emits no partial acknowledgements',async()=>{
 let rooms=[0,0],failures=0;const sent=[];
 const q=createDurableQueue({batchSize:16,capture:()=>[...rooms],restore:s=>rooms=s,commit:async()=>{throw Error('down');},onFailure:()=>failures++});
 await Promise.all([0,1].map(i=>q.run(()=>{rooms[i]++;q.dirty();q.defer(()=>sent.push(i));})));
 assert.deepEqual(rooms,[0,0]);assert.deepEqual(sent,[]);assert.equal(failures,1);
});
