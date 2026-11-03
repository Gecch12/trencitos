"use strict";
const { projectSummary, projectReplay } = require("../queries/replay-view");

function participantSeat(record, identity, claims) {
  return record.players.findIndex(p => !p.bot && (identity.accountId &&
    (p.accountId === identity.accountId || claims[p.guestId] === identity.accountId) ||
    identity.guestId && p.guestId === identity.guestId && !claims[p.guestId]));
}
const participant = (record, identity, claims) => participantSeat(record, identity, claims) >= 0;
const fail = (status, message) => Object.assign(Error(message), { status });
function placement(record, seat) {
  if (record.status !== "completed") return null;
  const own = record.scores.find(s => s.seat === seat), keys = ["score", "completed", "stations", "express"];
  if (!own || record.scores.some(s => s.partial || keys.some(key => !Number.isFinite(s[key])))) return null;
  return 1 + record.scores.filter(s => {
    for (const key of keys) if (s[key] !== own[key]) return s[key] > own[key];
    return false;
  }).length;
}

// identity comes from verified session/cookie context, never from a requested
// seat or player name. The repository supplies metadata first, frames second.
function createHistoryQueries({ repository }) {
  async function list(identity) {
    const { matches, claims } = await repository.records(identity, null);
    return matches.filter(record => participant(record, identity, claims)).sort((a, b) => b.startedAt - a.startedAt).map(record => {
      const ownSeat = participantSeat(record, identity, claims);
      return { ...projectSummary(record, true), ownSeat, rank: placement(record, ownSeat) };
    });
  }
  async function replay(identity, id, audit = false) {
    const { matches, claims } = await repository.records(identity, id), record = matches[0];
    if (!record) throw fail(404, "Esta repetición no está disponible.");
    const full = participant(record, identity, claims);
    if (!full && record.visibility !== "public") throw fail(404, "Esta repetición no está disponible.");
    if (record.status === "active") throw fail(409, "La repetición estará disponible cuando la partida se cierre.");
    if (record.schemaVersion !== 1) throw fail(409, "Esta versión de repetición no está disponible.");
    if (audit && !full) throw fail(403, "Solo los participantes pueden descargar la auditoría.");
    const frames = record.frames || await repository.frames(id, record.steps);
    return projectReplay({ ...record, frames }, { full, audit });
  }
  return { list, replay };
}

module.exports = { createHistoryQueries, participant };
