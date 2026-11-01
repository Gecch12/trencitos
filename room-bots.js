"use strict";
const I18n = require("./i18n");
const Engine = require("./engine");
const { chooseBotAction } = require("./bots");

// Permanent opponents use the same policy as practice, with the durable room's
// lifecycle and commit queue. Spectators never keep an abandoned game alive.
function createRoomBots({ rooms, sendRoom, dispatch, blocked, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const timers = new Map();
  const live = room => rooms.get(room.code) === room && !room.practice && room.game &&
    !blocked() && room.emptySince == null && room.members.some(m => !m.bot && m.ws && !m.ws.closed);
  function seats(room) {
    const g = room.game;
    if (!g || g.phase === "finished") return [];
    const pending = room.members.flatMap((m, i) => m.bot && (g.players[i].pending.length || g.players[i].offer) ? [i] : []);
    if (pending.length) return pending;
    return !["initial", "closing"].includes(g.phase) && room.members[g.current]?.bot ? [g.current] : [];
  }
  function cancel(room) { clearTimer(timers.get(room)); timers.delete(room); }
  function sync(room) {
    if (!live(room) || !seats(room).length) { cancel(room); return; }
    if (timers.has(room)) return;
    const timer = setTimer(() => dispatch(() => {
      timers.delete(room);
      if (!live(room)) return;
      const time = Date.now();
      if (Engine.expire(room.game, time)) { room.revision++; sendRoom(room, true); return; }
      for (const seat of seats(room)) {
        const action = chooseBotAction(room.game, seat);
        if (action) Engine.action(room.game, seat, action, { now: time });
        else if (room.game.current === seat && room.game.phase === "play") {
          Engine.note(room.game, I18n.message`${room.members[seat].name} cede el turno.`, seat);
          Engine.next(room.game, time);
        }
        room.revision = (room.revision || 0) + 1;
      }
      sendRoom(room, true);
    }), 900);
    timer.unref?.(); timers.set(room, timer);
  }
  return { sync, cancel, close() { for (const room of timers.keys()) cancel(room); } };
}
module.exports = { createRoomBots };
