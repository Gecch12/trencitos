"use strict";

// Accept only already-authorized, detached messages AFTER durable commit. Cache
// advancement here cannot suppress a recovery snapshot after a failed write.
function createPeerOutput({ write, frame, live, schedule = queueMicrotask }) {
  let pending = [], scheduled = false, definition = null;
  const previous = new Map();
  function flush() {
    scheduled = false;
    const batch = pending; pending = [];
    if (!live() || !batch.length) return;
    const frames=[];
    for(let i=0;i<batch.length;){
      if(batch[i].compact!==2){frames.push(frame(1,batch[i++].data));continue;}
      const messages=[];
      do{messages.push(batch[i++].data);}while(i<batch.length&&batch[i].compact===2);
      // One JSON frame crosses proxies as one message. Separate WS frames in a
      // single TCP write can still acquire an extra delayed ACK at the edge.
      frames.push(frame(1,messages.length===1?messages[0]:'{"type":"batch","messages":['+messages.join(',')+']}'));
    }
    write(Buffer.concat(frames));
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
    pending.push({data,compact});
    if (!scheduled) { scheduled = true; schedule(flush); }
  }
  return { send, flush };
}
module.exports = { createPeerOutput };
