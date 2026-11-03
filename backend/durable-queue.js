"use strict";

// All authoritative mutations (messages, clocks, bots and disconnects) run
// serially. Outgoing state/acks are withheld until the durable commit succeeds.
function createDurableQueue({ capture, restore, commit, onFailure, measure = () => {}, now = () => performance.now() }) {
  let tail = Promise.resolve(), transaction = null, mutating = false;
  return {
    run(job) {
      const enqueued = now();
      const result = tail.then(async () => {
        measure("queue", now() - enqueued);
        const started = now();
        const before = capture(), tx = { dirty: false, outbox: [] };
        transaction = tx; mutating = true;
        try {
          job();
          mutating = false;
          measure("mutation", now() - started);
          const saving = now();
          if (tx.dirty) await commit();
          if (tx.dirty) measure("commit", now() - saving);
          transaction = null;
        } catch (error) {
          mutating = false; transaction = null;
          restore(before);
          onFailure(error);
          return;
        }
        // Delivery can fail after SQL committed (e.g. a closed socket). Never
        // roll durable game state back just because one browser missed its ack.
        const delivering = now();
        for (const deliver of tx.outbox) {
          try { deliver(); } catch { console.error("Client delivery failed after commit; reconnect to recover."); }
        }
        measure("delivery", now() - delivering);
        measure("total", now() - enqueued);
      });
      tail = result.catch(error => { console.error("Durable queue failure:", error.code || "INTERNAL"); });
      return tail;
    },
    dirty() {
      if (!mutating) throw new Error("Durable writes require a serialized mutation.");
      transaction.dirty = true;
    },
    defer(deliver) {
      if (mutating) transaction.outbox.push(deliver);
      else deliver();
    },
    get mutating() { return mutating; },
    idle() { return tail; },
  };
}
module.exports = { createDurableQueue };
