"use strict";

function safePublic(view) {
  const result = structuredClone(view);
  // Scores are public; private ticket identities and borrowed station routes are not.
  if (result.result) for (const row of result.result) {
    row.tickets = [];row.individualTickets = [];row.stationRoutes = [];
    if (row.details) row.details.destinations = [];
  }
  return result;
}

const connected = member => !!member.bot || !!(member.ws && !member.ws.closed);
function assertSeat(room, seat) {
  if (!Number.isInteger(seat) || seat < -1 || seat >= room.members.length) throw new RangeError("Puesto inválido.");
}

// The caller resolves the live seat/public-room permission. These projections
// receive no socket and never normalize, mutate, save or send the input state.
function createAuthorizedViews({ engine, now, isPublic, capacity, normalizeTiming }) {
  function match(game, seat) {
    const view = engine.view(game, seat, { now: now() });
    return seat === -1 ? safePublic(view) : view;
  }
  function lobby(room, seat, { token } = {}) {
    assertSeat(room, seat);
    if (seat === -1) return structuredClone({
      type: "lobby", code: room.code, seat: -1, spectator: true, host: false, started: true,
      sessionVersion: 1, visibility: "public", maxPlayers: capacity(room), timing: normalizeTiming(room.timing),
      members: room.members.map(m => ({ name: m.name, color: m.color, bot: !!m.bot, connected: connected(m), autopilot: !!m.autopilot })),
    });
    return structuredClone({
      type: "lobby", matchId: room.matchId, code: room.code, seat, token,
      host: seat === (room.hostSeat ?? 0), started: !!room.game, practice: !!room.practice,
      visibility: isPublic(room) ? "public" : "private", maxPlayers: capacity(room),
      timing: normalizeTiming(room.timing), sessionVersion: 1,
      members: room.members.map((m, i) => ({ name: m.name, color: m.color, connected: connected(m), bot: !!m.bot,
        host: i === (room.hostSeat ?? 0), autopilot: !!m.autopilot, reclaim: !!m.reclaim, seat: i })),
    });
  }
  function state(room, seat, { storagePaused = false, includeEarlyFinish = seat !== -1 } = {}) {
    assertSeat(room, seat);
    return { type: "state", game: { ...match(room.game, seat),
      ...(includeEarlyFinish ? { earlyFinish: !!room.earlyFinish } : {}),
      revision: room.revision || 0, storagePaused } };
  }
  function recording(room) {
    const views = [-1, ...room.game.players.map((_, i) => i)].map(seat => {
      const view = match(room.game, seat);
      delete view.serverNow;
      return view;
    });
    return structuredClone({ views, members: room.members.map(m => ({ name: m.name, color: m.color,
      bot: !!m.bot, autopilot: !!m.autopilot, connected: connected(m) })) });
  }
  return { lobby, state, recording };
}

module.exports = { createAuthorizedViews, safePublic };
