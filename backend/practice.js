"use strict";
const { randomInt } = require("node:crypto");
const { createLegacyAutomaticPlay } = require("../game/compat/legacy-automatic-play");

const ABSENCE_MS = 30000;

function createPracticeController({
  rooms,
  sendRoom,
  dispatch = job => job(),
  onRemove = () => {},
  blocked = () => false,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = randomInt,
  automaticPlay = createLegacyAutomaticPlay({ stageRoom: sendRoom, botRandom: random }),
}) {
  // Timers never belong to the serializable game state.
  const active = new Map();
  const live = (room) => room.practice && rooms.get(room.code) === room;
  const connected = (room) => room.members[0]?.ws && !room.members[0].ws.closed;
  function runtime(room) {
    if (!active.has(room)) active.set(room, { bot: null, expiry: null, deadline: null });
    return active.get(room);
  }
  function cancelBot(state) {
    if (state.bot !== null) clearTimer(state.bot);
    state.bot = null;
  }
  function remove(room) {
    const state = active.get(room);
    if (state) {
      cancelBot(state);
      if (state.expiry !== null) clearTimer(state.expiry);
      active.delete(room);
    }
    if (!live(room)) return;
    if(onRemove(room)===false)return;
    rooms.delete(room.code);
    room.members.forEach((member) => {
      if (member.ws) {
        member.ws.send({ type: "room_closed" });
        member.ws.room = null;
        member.ws.seat = -1;
        member.ws = null;
      }
    });
  }
  function disconnected(room, at = now()) {
    if (!live(room) || connected(room)) return;
    const state = runtime(room);
    cancelBot(state);
    if (state.deadline !== null) return;
    state.deadline = at + ABSENCE_MS;
    state.expiry = setTimer(() => dispatch(() => remove(room)), Math.max(0, state.deadline - now()));
    state.expiry.unref?.();
  }
  function sync(room) {
    if (!live(room)) return;
    const state = runtime(room);
    if(blocked()){cancelBot(state);return;}
    if (!connected(room)) return disconnected(room);
    if (state.deadline !== null) {
      clearTimer(state.expiry);
      state.expiry = state.deadline = null;
    }
    if (!automaticPlay.canPracticeAct(room)) {
      cancelBot(state);
      return;
    }
    if (state.bot !== null) return;
    state.bot = setTimer(() => dispatch(() => {
      state.bot = null;
      if (!live(room) || blocked() || !connected(room)) return;
      automaticPlay.playPracticeBots(room);
    }), 800 + random(201));
    state.bot.unref?.();
  }
  function finish(room) {
    if (!live(room) || room.game.phase === "finished") return;
    cancelBot(runtime(room));
    automaticPlay.finishPractice(room);
  }
  function expired(room) {
    const deadline = active.get(room)?.deadline;
    if (deadline !== null && deadline !== undefined && now() >= deadline) {
      remove(room);
      return true;
    }
    return false;
  }
  function close() {
    for (const room of active.keys()) remove(room);
  }
  return { sync, disconnected, finish, remove, expired, close };
}

module.exports = { createPracticeController, ABSENCE_MS };
