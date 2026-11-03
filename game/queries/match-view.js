"use strict";

function historyEntries(game) {
  return structuredClone(game.logs.map((text, i) => game.history?.[i]?.text === text ? game.history[i] : { id: null, text, seat: null }));
}

function historyEntryView(entry, seat) {
  if (!entry.draw) return structuredClone(entry);
  const { color, ...draw } = entry.draw;
  return structuredClone({ ...entry, draw: { ...draw, ...(draw.index >= 0 || entry.seat === seat ? { color } : {}) } });
}

function drawEvent(game, seat) {
  const event = game.lastDraw;
  return event ? { id: event.id, seat: event.seat, index: event.index,
    ...(event.index >= 0 || event.seat === seat ? { color: event.color } : {}) } : null;
}

// Input is already normalized. Select authorized fields before copying; the
// result owns all its objects and never repairs clocks or stored score details.
function projectMatch(game, seat, { now, tunnelCardMs, destinationDetails, references }) {
  if (!Number.isInteger(seat) || seat < -1 || seat >= game.players.length) throw new RangeError("Puesto inválido.");
  const spectator = seat === -1, own = seat === game.current;
  const player = spectator ? { hand: [], tickets: [], pending: [], offer: null } : game.players[seat];
  const details = spectator ? { progress: [], paths: [] } : destinationDetails(game, seat);
  const tunnel = game.pending;
  return structuredClone({
    spectator, uiVersion: 9, definitionVersion: 1, ...references, timing: game.timing || null, serverNow: now,
    turnDeadline: game.turnDeadline, turnSerial: game.turnSerial, turnWaiting: Boolean(game.turnWaiting),
    initialDeadline: game.initialDeadline, initialReadyCount: game.players.filter(p => !p.pending.length).length,
    waitingDeadline: game.turnWaiting ? game.players[game.current].offer?.deadline : null,
    closingDeadline: game.phase === "closing" ? Math.max(...game.players.map(p => p.offer?.deadline || 0)) : null,
    events: (game.events || []).map(event => {
      const { color, base, ...safe } = event;
      return { ...safe, ...(event.type === "tunnel_reveal" ? { base } : {}),
        ...(event.type === "draw" && (event.index >= 0 || event.seat === seat) ? { color } : {}) };
    }),
    ...(game.construction ? {construction:game.construction} : {}),
    drawEvent: drawEvent(game, seat), phase: game.phase, current: game.current, seat,
    players: game.players.map(p => ({ name: p.name, color: p.color, trains: p.trains, stations: p.stations,
      score: p.score, placed: p.placed, handCount: p.hand.length, ticketsCount: p.tickets.length, initialReady: !p.pending.length })),
    routes: game.routes, face: game.face, deckCount: game.deck.length, discardCount: game.discard.length, ticketDeckCount: game.shortDeck.length,
    hand: player.hand, tickets: player.tickets, ticketProgress: details.progress, ticketPaths: details.paths,
    drawCount: own ? game.drawCount : 0, initial: game.phase === "initial" && player.pending.length ? player.pending : null,
    pending: player.offer?.tickets || null, ticketOffer: player.offer || null,
    sharedTunnel: game.phase === "tunnel" && tunnel?.stage ? {
      id: tunnel.revealId, seat: game.current, routeId: tunnel.routeId, paymentColor: tunnel.color,
      revealed: tunnel.revealed, surcharge: tunnel.surcharge, stage: tunnel.stage, startedAt: tunnel.startedAt, until: tunnel.until, outcome: tunnel.outcome,
      base: { ...tunnel.base }, ...(tunnel.stage === "result" ? { extra: tunnel.extra ? { ...tunnel.extra } : null,
        resultStartedAt: tunnel.resultStartedAt, reason: tunnel.reason } : {}),
      cardMs: tunnelCardMs, turnRemaining: tunnel.turnRemaining, offerRemaining: tunnel.offerRemaining[seat] ?? null,
    } : null,
    tunnel: own && game.phase === "tunnel" ? tunnel : null, finalRemaining: game.finalRemaining,
    logs: game.logs, history: historyEntries(game).map(entry => historyEntryView(entry, seat)),
    result: game.phase === "finished" ? game.result : null,
  });
}

module.exports = { projectMatch, historyEntries, historyEntryView };
