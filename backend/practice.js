"use strict";
const { randomInt } = require("node:crypto");
const { createLegacyAutomaticPlay } = require("../game/compat/legacy-automatic-play");
const { shiftDeadlines } = require("./multiplayer");

const ABSENCE_MS = 24 * 60 * 60 * 1000;

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
  runBot,
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
  function cancel(room) {
    const state = active.get(room);
    if (state) {
      cancelBot(state);
      if (state.expiry !== null) clearTimer(state.expiry);
      active.delete(room);
    }
  }
  function remove(room) {
    if (!live(room) || blocked(room)) return;
    cancel(room);
    rooms.delete(room.code);
    if(onRemove(room)===false){rooms.set(room.code,room);return;}
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
    if (!live(room) || connected(room) || blocked(room)) return;
    const state = runtime(room);
    cancelBot(state);
    if (state.deadline !== null) return;
    room.practicePausedAt ??= at;
    state.deadline = room.practicePausedAt + ABSENCE_MS;
    state.expiry = setTimer(() => dispatch(() => remove(room),room), Math.max(0, state.deadline - now()));
    state.expiry.unref?.();
  }
  function reconcile(room) {
    if (!live(room) || blocked(room)) return;
    if (!connected(room)) return disconnected(room);
    if (room.practicePausedAt != null) {
      shiftDeadlines(room.game, Math.max(0, now() - room.practicePausedAt));
      delete room.practicePausedAt;
    }
    const state = runtime(room);
    if (state.expiry !== null) clearTimer(state.expiry);
    state.expiry = state.deadline = null;
  }
  function sync(room) {
    if (!live(room)) return;
    if (blocked(room)) { cancel(room); return; }
    reconcile(room);
    const state = runtime(room);
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
    state.bot = setTimer(() => {
      state.bot = null;
      if (!live(room) || blocked(room) || !connected(room)) return;
      if(runBot)runBot(room,"playPracticeBots",()=>live(room)&&!blocked(room)&&connected(room));
      else dispatch(()=>{if(live(room)&&!blocked(room)&&connected(room))automaticPlay.playPracticeBots(room);},room);
    }, Math.max(250 + random(101),(room.game.construction?.until||0)-now()));
    state.bot.unref?.();
  }
  function finish(room) {
    if (!live(room) || room.game.phase === "finished") return;
    cancelBot(runtime(room));
    automaticPlay.finishPractice(room);
  }
  function expired(room) {
    if (blocked(room)) return false;
    const deadline = room.practicePausedAt == null ? null : room.practicePausedAt + ABSENCE_MS;
    if (deadline !== null && deadline !== undefined && now() >= deadline) {
      remove(room);
      return true;
    }
    return false;
  }
  function close() {
    for (const state of active.values()) {
      cancelBot(state);
      if (state.expiry !== null) clearTimer(state.expiry);
    }
    active.clear();
  }
  return { sync, reconcile, disconnected, finish, remove, expired, cancel, close };
}

module.exports = { createPracticeController, ABSENCE_MS };
