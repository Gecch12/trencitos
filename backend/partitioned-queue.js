"use strict";
const { AsyncLocalStorage } = require('node:async_hooks');
const { createDurableQueue } = require('./durable-queue');

// A key owns one aggregate. A null key is a lifecycle barrier: it waits for
// preceding rooms and subsequent rooms wait for it. Only synchronous mutations
// run in the critical section; unrelated durable writes can overlap.
function createPartitionedQueue({ capture, restore, commit, onFailure, measure,
  now = () => performance.now(), scope = work => work(), spans }) {
  const context = new AsyncLocalStorage(), tails = new Map();
  let barrier = Promise.resolve();
  function schedule(key,work){
    const preceding=key===null?[barrier,...tails.values()]:[barrier,tails.get(key)];
    const done=Promise.all(preceding).then(work),settled=done.then(()=>{},()=>{});
    if(key===null)barrier=settled;
    else {tails.set(key,settled);settled.then(()=>{if(tails.get(key)===settled)tails.delete(key);});}
    return done;
  }
  function run(job, kind = 'other', observe, key = null) {
    const enqueued = now();
    return schedule(key,() => {
      const transaction = { key };
      const queue = createDurableQueue({
        capture: () => capture(key), restore: value => restore(value, key),
        commit: () => commit(key), onFailure: error => onFailure(error, key), measure, now, spans,
        scope: work => context.run(transaction, () => scope(work)),
      });
      transaction.queue = queue;
      return queue.run(job, kind, observe, enqueued);
    });
  }
  return {
    run,
    // Recovery reads hold this room's lane without opening a mutation/outbox.
    exclusive: (key,work) => schedule(key,work),
    get transaction() { return context.getStore(); },
    get mutating() { return context.getStore()?.queue.mutating || false; },
    dirty() {
      const current = context.getStore();
      if (!current) throw Error('Durable writes require a serialized mutation.');
      current.queue.dirty();
    },
    defer(deliver) { const current = context.getStore(); if (current) current.queue.defer(deliver); else deliver(); },
    async idle() { await Promise.all([barrier, ...tails.values()]); },
  };
}
module.exports = { createPartitionedQueue };
