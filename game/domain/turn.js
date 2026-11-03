"use strict";

// Plans only: the facade applies changes, emits events and computes final scores.
function planTurnStart(state, { now, rules }) {
  const initial = state.phase === "initial";
  const waiting = Boolean(state.phase === "play" && state.players[state.current].offer);
  const changes = {
    turnSerial: (state.turnSerial || 0) + 1,
    turnSeat: state.current,
    turnClockPhase: initial ? "initial" : "play",
    turnWaiting: waiting,
  };
  if (initial) {
    changes.initialDeadline = state.initialDeadline ??
      (Number.isFinite(state.turnDeadline) ? state.turnDeadline : now + rules.initialMs);
  }
  changes.turnDeadline = initial ? changes.initialDeadline : waiting ? null : now + rules.turnMs;
  return { changes, emitTurn: !initial && !waiting };
}

function planNextTurn(state, { now, rules }) {
  const changes = { drawCount: 0, pending: null };
  let finalRoundStarted = false;
  if (state.finalRemaining !== null) {
    changes.finalRemaining = state.finalRemaining - 1;
    if (changes.finalRemaining === 0) return { changes, finish: true, finalRoundStarted, emitTurn: false };
  } else if (state.players[state.current].trains <= rules.finalTrainThreshold) {
    changes.lastTrigger = state.current;
    changes.finalRemaining = state.players.length;
    finalRoundStarted = true;
  }
  changes.current = (state.current + 1) % state.players.length;
  const start = planTurnStart({ ...state, ...changes }, { now, rules });
  return { changes: { ...changes, ...start.changes }, finish: false, finalRoundStarted, emitTurn: start.emitTurn };
}

module.exports = { planTurnStart, planNextTurn };
