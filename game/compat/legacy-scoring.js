"use strict";

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

module.exports = { projectBoard, projectPlayer, projectResult, legacyDetails, legacyResult };
