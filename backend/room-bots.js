"use strict";
const { createLegacyAutomaticPlay } = require("../game/compat/legacy-automatic-play");

// Permanent opponents use the same policy as practice, with the durable room's
// lifecycle and commit queue. Spectators never keep an abandoned game alive.
function createRoomBots({ rooms, sendRoom, dispatch, blocked, setTimer = setTimeout, clearTimer = clearTimeout,
  automaticPlay = createLegacyAutomaticPlay({ stageRoom: sendRoom }) }) {
  const timers = new Map();
  const live = room => rooms.get(room.code) === room && !room.practice && room.game &&
    !blocked() && room.emptySince == null && room.members.some(m => !m.bot && m.ws && !m.ws.closed);
  function cancel(room) { clearTimer(timers.get(room)); timers.delete(room); }
  function sync(room) {
    if (!live(room) || !automaticPlay.permanentSeats(room).length) { cancel(room); return; }
    if (timers.has(room)) return;
    const timer = setTimer(() => dispatch(() => {
      timers.delete(room);
      if (!live(room)) return;
      automaticPlay.playPermanentBots(room);
    }), 900);
    timer.unref?.(); timers.set(room, timer);
  }
  return { sync, cancel, close() { for (const room of timers.keys()) cancel(room); } };
}
module.exports = { createRoomBots };
