"use strict";
// Transport compression of an already-authorized view, never domain state.
const StateStream = (() => {
  const replay = typeof module !== 'undefined' && module.exports ? require('./replay-state') : ReplayState;
  function writer() {
    let previous = null, sequence = 0;
    return {
      reset() { previous = null; sequence = 0; },
      write(message) {
        const next = sequence + 1;
        const full = JSON.stringify({ ...message, stateSequence: next });
        const patch = previous && JSON.stringify({ type: 'state_patch', baseSequence: sequence,
          stateSequence: next, changes: replay.diff(previous, message) });
        previous = structuredClone(message); sequence = next;
        return patch && patch.length < full.length ? patch : full;
      },
    };
  }
  function reader() {
    let previous = null, sequence = 0;
    return {
      read(message) {
        if (message.type === 'room_closed' || message.type === 'session_replaced') {
          previous = null; sequence = 0;
        }
        if (message.type === 'state') {
          const { stateSequence, ...value } = message;
          if (stateSequence === undefined) { previous = null; sequence = 0; return message; }
          if (!Number.isSafeInteger(stateSequence) || stateSequence < 1) throw Error('Invalid state sequence');
          previous = structuredClone(value); sequence = stateSequence;
          return value;
        }
        if (message.type !== 'state_patch') return message;
        if (!previous || message.baseSequence !== sequence || message.stateSequence !== sequence + 1 || !Array.isArray(message.changes))
          throw Error('State sequence gap; reconnect for a complete snapshot');
        const next = replay.apply(previous, message.changes);
        if (next?.type !== 'state' || !next.game || typeof next.game !== 'object') throw Error('Invalid state patch');
        previous = next; sequence = message.stateSequence;
        // UI/animation code may normalize its own view. Never let it alter the base.
        return structuredClone(next);
      },
    };
  }
  return { writer, reader };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StateStream;
