"use strict";
const Scoring = require("../domain/scoring");
const Network = require("../domain/network");

const projectTicket = ticket => ({ id: ticket.id, a: ticket.a, b: ticket.b, points: ticket.p });

function projectBoard(game) {
  return {
    map: { routes: game.routes.map(route => ({ id: route.id, a: route.a, b: route.b, length: route.n })) },
    owners: new Map(game.routes.map(route => [route.id, route.owner])),
  };
}

function projectPlayer(player) {
  return { name: player.name, score: player.score, stations: player.stations,
    placed: player.placed, tickets: player.tickets.map(projectTicket) };
}

function projectResult(result) {
  return { ...result, tickets: result.tickets.map(projectTicket) };
}

function legacyDetails(details, tickets) {
  return { ...details, destinations: details.destinations.map((destination, i) => ({ ...tickets[i], ...destination })) };
}

function legacyResult(result, player) {
  return { ...result, tickets: player.tickets, details: legacyDetails(result.details, player.tickets) };
}

// Explicit compatibility write, never called from a query. Existing totals,
// rank, winners, ticket references and already stored details remain intact.
function completeResults(game, rules) {
  if (game.phase !== "finished" || !game.result.some(result => !result.details)) return;
  const { map, owners } = projectBoard(game), state = { owners, players: game.players.map(projectPlayer) };
  const trails = game.players.map((_, seat) => Network.longestTrail(map.routes.filter(route => owners.get(route.id) === seat)));
  for (const result of game.result) {
    if (result.details) continue;
    const details = Scoring.resultDetails(state, projectResult(result), game.result, { map, rules, trails });
    result.details = legacyDetails(details, result.tickets);
  }
}

module.exports = { projectBoard, projectPlayer, projectResult, legacyDetails, legacyResult, completeResults };
