"use strict";

// Accept only already-authorized, detached messages AFTER durable commit. Cache
// advancement here cannot suppress a recovery snapshot after a failed write.
function createPeerOutput({ write, frame, live, schedule = queueMicrotask }) {
  let pending = [], scheduled = false, definition = null;
  const previous = new Map();
  function flush() {
    scheduled = false;
    const batch = pending; pending = [];
    if (live() && batch.length) write(Buffer.concat(batch));
  }
  function send(serialized, compact = false) {
    if (!live()) return;
    let data = serialized;
    if (compact) {
      const value = JSON.parse(data);
      if (["lobby", "storage", "directory"].includes(value.type)) {
        if (previous.get(value.type) === data) return;
        previous.set(value.type, data);
      }
      if (value.type === "state" && value.definition) {
        const key = JSON.stringify(value.definition);
        if (definition === key) { delete value.definition; data = JSON.stringify(value); }
        else definition = key;
      }
    }
    pending.push(frame(1, data));
    if (!scheduled) { scheduled = true; schedule(flush); }
  }
  return { send, flush };
}
module.exports = { createPeerOutput };
