"use strict";
const Turn = require("../domain/turn");

// Adapt known legacy clock shapes; do not expire turns or consume randomness.
// The facade applies the plan before commands, scheduling or publication.
function planTiming(state, { now, rules, offerMs }) {
  if (state.phase === "tunnel" && state.pending) {
    if (state.pending.stage) return { changes: {} };
    const turnDeadline = Number.isFinite(state.turnDeadline) ? state.turnDeadline : now + rules.turnMs;
    return { changes: { turnDeadline }, pendingChanges: { stage: "decision", startedAt: now, until: null,
      turnRemaining: Math.max(0, turnDeadline - now),
      offerRemaining: state.players.map(player => player.offer ? Math.max(0, player.offer.deadline - now) : null) } };
  }
  if (state.phase === "initial") {
    const initialDeadline = state.initialDeadline ?? (Number.isFinite(state.turnDeadline) ? state.turnDeadline : now + rules.initialMs);
    return { changes: { initialDeadline, initialDone: state.players.filter(player => !player.pending.length).length,
      current: state.first, turnSeat: state.first, turnClockPhase: "initial", turnWaiting: false, turnDeadline: initialDeadline } };
  }
  if (state.phase === "tickets") {
    const offerSerial = (state.offerSerial || 0) + 1;
    const offer = { seat: state.current, value: { id: offerSerial, tickets: state.pending.tickets, deadline: now + offerMs } };
    const players = state.players.map((player, seat) => seat === offer.seat ? { ...player, offer: offer.value } : player);
    const next = Turn.planNextTurn({ ...state, players, phase: "play" }, { now, rules });
    return { ...next, offer, changes: { phase: "play", offerSerial, ...next.changes } };
  }
  if (["finished", "closing"].includes(state.phase)) return { changes: { turnDeadline: null, turnWaiting: false } };
  const waiting = Boolean(state.phase === "play" && state.players[state.current].offer);
  if (state.turnSeat !== state.current || state.turnClockPhase !== "play" || Boolean(state.turnWaiting) !== waiting || (!waiting && !Number.isFinite(state.turnDeadline)))
    return Turn.planTurnStart(state, { now, rules });
  return { changes: {} };
}

module.exports = { planTiming };
