"use strict";
const Engine = require("./engine");

// One wake-up per room, at its earliest absolute deadline. Runtime handles are
// separate from persisted state. No browser can pause or extend a deadline.
function createGameClock({ rooms, sendRoom, dispatch = job => job(), expireGame = room => Engine.expire(room.game, now()), canTick = () => true, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const active = new Map();
  function cancel(room) {
    const state = active.get(room);
    if (state) clearTimer(state.timer);
    active.delete(room);
  }
  function sync(room) {
    if (!room.game || rooms.get(room.code) !== room || room.game.phase === "finished" || !canTick(room)) { cancel(room); return; }
    Engine.ensureTiming(room.game, now());
    const deadlines = Engine.deadlines(room.game);
    if (!deadlines.length) { cancel(room); return; }
    const deadline = Math.min(...deadlines);
    if (active.get(room)?.deadline === deadline) return;
    cancel(room);
    const timer = setTimer(() => dispatch(() => {
      active.delete(room);
      if (rooms.get(room.code) !== room || !canTick(room)) return;
      if (expireGame(room)) sendRoom(room, true);
      sync(room);
    }), Math.max(0, deadline - now()));
    timer.unref?.();
    active.set(room, { deadline, timer });
  }
  function close() { for (const room of active.keys()) cancel(room); }
  return { sync, cancel, close };
}
module.exports = { createGameClock };
