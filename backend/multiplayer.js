"use strict";
const I18n = require("../shared/i18n");
const Engine = require("./engine");
const { createLegacyAutomaticPlay } = require("../game/compat/legacy-automatic-play");

const Commitment = require("./commitment");
const GRACE_MS = 60000;
const soloWithBots = room => !!room.game && room.members.filter(member=>!member.bot).length===1 && room.members.some(member=>member.bot);
const reconnectGrace = room => soloWithBots(room) ? 24*60*60*1000 : room.game ? Commitment.RECONNECT_MS : GRACE_MS;
const connected = member => !!member.ws && !member.ws.closed;
function shiftDeadlines(game, elapsed) {
  if (!game || elapsed <= 0) return;
  for (const key of ["turnDeadline", "initialDeadline"])
    if (Number.isFinite(game[key])) game[key] += elapsed;
  if(game.construction){game.construction.startedAt+=elapsed;game.construction.until+=elapsed;}
  for (const player of game.players)
    if (player.offer) player.offer.deadline += elapsed;
  if (game.phase === "tunnel" && game.pending?.stage) {
    game.pending.startedAt += elapsed;
    if (Number.isFinite(game.pending.resultStartedAt)) game.pending.resultStartedAt += elapsed;
    if (Number.isFinite(game.pending.until)) game.pending.until += elapsed;
  }
}

// Room lifecycle is separate from rules. No timer or socket is persisted.
function createMultiplayerController({ rooms, sendRoom, removeRoom,
  dispatch = job => job(), blocked = () => false, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  runBot, automaticPlay = createLegacyAutomaticPlay({ stageRoom: sendRoom, now }) }) {
  const active = new Map();
  const live = room => !room.practice && rooms.get(room.code) === room;
  function cancel(room) {
    const state = active.get(room);
    if (state) for (const timer of [state.lifecycle, state.bot]) if (timer != null) clearTimer(timer);
    active.delete(room);
  }
  function removeSeat(room, seat, message = "Saliste de la sala.") {
    if (room.game) throw new Error("No se pueden retirar puestos durante una partida.");
    const [member] = room.members.splice(seat, 1);
    if (member?.ws) {
      member.ws.send({ type: "room_closed", message });
      member.ws.room = null; member.ws.seat = -1;
    }
    room.members.forEach((m, i) => { if (m.ws) m.ws.seat = i; });
    if (room.hostSeat === seat) room.hostSeat = room.members.findIndex(connected);
    else if (room.hostSeat > seat) room.hostSeat--;
    if (!room.members.length) removeRoom(room, "La sala quedó vacía.");
  }
  function requestControl(room, seat) {
    const member = room.members[seat];
    if (!member.autopilot || member.participation?.definitive) return;
    member.reclaim = true;
    // Never interrupt an in-flight bot draw or tunnel. Returning off-turn can
    // release control now, so the next human turn gets its normal full minute.
    member.reclaimSerial = room.game.current === seat ? room.game.turnSerial : -1;
  }
  function reconcile(room) {
    if (!live(room) || blocked()) return;
    const time = now();
    room.hostSeat ??= 0;
    for (const member of room.members) {
      if (member.bot) { member.disconnectedAt = null; continue; }
      if (connected(member)) member.disconnectedAt = null;
      else member.disconnectedAt ??= time;
    }
    if (!room.members.some(connected)) room.emptySince ??= time;
    else if (room.emptySince != null) {
      shiftDeadlines(room.game, time - room.emptySince);
      room.emptySince = null;
    }
    Commitment.reconcile(room, time);
    if (room.emptySince != null && time >= room.emptySince + reconnectGrace(room)) {
      removeRoom(room, soloWithBots(room) ? "La práctica caducó tras 24 horas sin actividad." : "Partida cerrada: nadie se reconectó durante 120 segundos."); return;
    }
    if (!room.game) {
      for (let i = room.members.length - 1; i >= 0; i--) {
        const member = room.members[i];
        if (!member.bot && !connected(member) && time >= member.disconnectedAt + GRACE_MS) removeSeat(room, i);
      }
      if (room.hostSeat < 0 || !room.members[room.hostSeat]) room.hostSeat = room.members.findIndex(connected);
    } else {
      const host = room.members[room.hostSeat];
      if (!host || (!connected(host) && time >= host.disconnectedAt + GRACE_MS)) room.hostSeat = room.members.findIndex(connected);
      room.members.forEach((member, seat) => {
        if (member.bot) return;
        if ((room.game.players[seat].missedTurns || 0) >= 2 && !member.autopilot) {
          member.autopilot = true;
          member.autopilotSince = time;
          Engine.note(room.game, I18n.message`${member.name}: bot de reemplazo tras dos turnos agotados.`, seat);
        }
        if (member.reclaim && connected(member) && (room.game.current !== seat || room.game.turnSerial !== member.reclaimSerial)) {
          member.autopilot = member.reclaim = false;
          member.autopilotSince = null;
          room.game.players[seat].missedTurns = 0;
          Engine.note(room.game, I18n.message`${member.name} recuperó el control.`, seat);
        }
      });
      Commitment.reconcile(room, time);
    }
  }
  function sync(room) {
    cancel(room);
    if (!live(room) || blocked()) return;
    const state = { lifecycle: null, bot: null }; active.set(room, state);
    const deadlines = room.emptySince != null ? [room.emptySince + reconnectGrace(room)]
      : room.members.flatMap(m => !m.bot && !connected(m) && (!room.game || room.members[room.hostSeat] === m) ? [m.disconnectedAt + GRACE_MS] : []);
    deadlines.push(...Commitment.deadlines(room));
    if (deadlines.length) {
      state.lifecycle = setTimer(() => dispatch(() => { reconcile(room); if (live(room)) sendRoom(room); }), Math.max(0, Math.min(...deadlines) - now()));
      state.lifecycle.unref?.();
    }
    if (!room.game || room.emptySince != null || !room.members[room.game.current]?.autopilot ||
      ["initial", "finished", "closing"].includes(room.game.phase) || room.game.turnWaiting || Engine.tunnelBusy(room.game)) return;
    state.bot = setTimer(() => {
      if (!live(room) || blocked() || room.emptySince != null) return;
      const eligible=()=>live(room)&&!blocked()&&room.emptySince==null&&!!room.members[room.game.current]?.autopilot;
      if(runBot)runBot(room,"playReplacement",eligible);else dispatch(()=>{if(eligible())automaticPlay.playReplacement(room);});
    }, Math.max(250,(room.game.construction?.until||0)-now()));
    state.bot.unref?.();
  }
  function close() { for (const room of active.keys()) cancel(room); }
  return { reconcile, sync, cancel, close, removeSeat, requestControl };
}
module.exports = { createMultiplayerController, connected, shiftDeadlines, GRACE_MS, soloWithBots, reconnectGrace };
