"use strict";
const { randomInt } = require("node:crypto");
const Engine = require("./engine");
const { chooseBotAction } = require("./bots");

const ABSENCE_MS = 30000;

function createPracticeController({
  rooms,
  sendRoom,
  dispatch = job => job(),
  onRemove = () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = randomInt,
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
    onRemove(room);
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
    if (!connected(room)) return disconnected(room);
    if (state.deadline !== null) {
      clearTimer(state.expiry);
      state.expiry = state.deadline = null;
    }
    const pendingBots = () => room.members.flatMap((member, i) => member.bot && room.game.players[i].pending.length ? [i] : []);
    const pendingOffers = () => room.members.flatMap((member, i) => member.bot && room.game.players[i].offer ? [i] : []);
    const canAct = () => room.game.phase === "initial" ? pendingBots().length > 0
      : room.game.phase !== "finished" && (pendingOffers().length > 0 || room.game.phase !== "closing" && room.members[room.game.current]?.bot);
    if (!canAct()) {
      cancelBot(state);
      return;
    }
    if (state.bot !== null) return;
    state.bot = setTimer(() => dispatch(() => {
      state.bot = null;
      if (!live(room) || !connected(room) || !canAct()) return;
      // Resolve an elapsed deadline before choosing a bot move. The same time
      // is used by action(), so a delayed callback cannot act for the old seat.
      const actionTime = Date.now();
      if (Engine.expire(room.game, actionTime)) { sendRoom(room); return; }
      if (room.game.phase === "initial" || pendingOffers().length) {
        for (const seat of room.game.phase === "initial" ? pendingBots() : pendingOffers()) {
          const action = chooseBotAction(room.game, seat, random);
          if (action) Engine.action(room.game, seat, action, { now: actionTime });
        }
        sendRoom(room); return;
      }
      const action = chooseBotAction(room.game, room.game.current, random);
      if (action) {
        Engine.action(room.game, room.game.current, action, { now: actionTime });
      } else {
        // A temporary practice opponent may yield if all remaining legal
        // actions are strategically pointless. Human pass rules stay in Engine.
        Engine.note(room.game, `${room.game.players[room.game.current].name} no encuentra una jugada útil y cede el turno.`, room.game.current);
        Engine.next(room.game);
      }
      sendRoom(room);
    }), 800 + random(201));
    state.bot.unref?.();
  }
  function finish(room) {
    if (!live(room) || room.game.phase === "finished") return;
    cancelBot(runtime(room));
    // A pending tunnel has not been paid for yet; abandon it before scoring.
    if (room.game.phase === "tunnel") room.game.discard.push(...room.game.pending.revealed);
    Engine.recycleDiscards(room.game);
    room.game.pending = null;
    room.game.drawCount = 0;
    room.earlyFinish = true;
    Engine.finish(room.game, true);
    sendRoom(room);
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
