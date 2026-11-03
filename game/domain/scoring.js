"use strict";
const { connected, connectionPath, longestTrail } = require("./network");
const { assignStations } = require("./stations");

function destinationDetails(state, { map }, assignment = assignStations(state, { map })) {
  const { seat, tickets, placed, owners } = state;
  const own = map.routes.filter(route => owners.get(route.id) === seat);
  const byId = new Map(map.routes.map(route => [route.id, route]));
  const borrowed = assignment.assigned.filter(id => id !== null);
  const all = [...own, ...borrowed.map(id => byId.get(id))];
  return {
    progress: tickets.map((ticket, i) => ({ id: ticket.id, completed: assignment.tickets[i],
      viaStation: assignment.tickets[i] && !connected(own, ticket.a, ticket.b) })),
    paths: tickets.map((ticket, i) => {
      const routes = assignment.tickets[i] ? connectionPath(connected(own, ticket.a, ticket.b) ? own : all, ticket.a, ticket.b) : [];
      return { id: ticket.id, routes, stationRoutes: routes.filter(id => borrowed.includes(id)),
        stations: placed.flatMap((city, j) => assignment.assigned[j] !== null && routes.includes(assignment.assigned[j])
          ? [{ city, routeId: assignment.assigned[j], seat }] : []) };
    }),
  };
}

function rankResults(rows, { tieBreakers }) {
  const compare = (a, b) => {
    for (const field of tieBreakers) if (a[field] !== b[field]) return b[field] - a[field];
    return 0;
  };
  const ranked = [...rows].sort(compare);
  return ranked.map(row => ({ ...row, winner: compare(row, ranked[0]) === 0 }));
}

function trailsFor({ players, owners }, map) {
  return players.map((_, seat) => longestTrail(map.routes.filter(route => owners.get(route.id) === seat)));
}

// Can also explain a stored result: recorded totals/assignments are authoritative.
// In particular, routeAdjustment reconciles legacy scores without rewriting them.
function resultDetails(state, result, standings, { map, rules, trails = trailsFor(state, map) }) {
  const player = state.players[result.seat], seat = result.seat;
  const assignment = { tickets: result.individualTickets, assigned: result.stationRoutes };
  const paths = destinationDetails({ ...player, seat, owners: state.owners }, { map }, assignment).paths;
  const routes = map.routes.filter(route => state.owners.get(route.id) === seat)
    .map(route => ({ id: route.id, a: route.a, b: route.b, length: route.length, points: rules.routePoints[route.length] }));
  const maximum = Math.max(...standings.map(row => row.longest));
  return {
    routes, routeAdjustment: result.route - routes.reduce((sum, route) => sum + route.points, 0),
    destinations: result.tickets.map((ticket, i) => ({ ...ticket, completed: result.individualTickets[i],
      points: result.individualTickets[i] ? ticket.points : -ticket.points, ...paths[i] })),
    stations: { unused: rules.unusedStationPoints ? result.stations / rules.unusedStationPoints : player.stations, points: result.stations,
      placed: player.placed.map((city, i) => ({ city, routeId: result.stationRoutes[i] ?? null, seat })) },
    express: { ...trails[seat], maximum, tiedSeats: standings.filter(row => row.longest === maximum).map(row => row.seat), points: result.express },
    totals: { routes: result.route, destinations: result.destination, stations: result.stations, express: result.express, total: result.score },
  };
}

function scoreMatch(state, { map, rules }) {
  const trails = trailsFor(state, map), maximum = Math.max(...trails.map(trail => trail.length));
  const results = rankResults(state.players.map((player, seat) => {
    const assignment = assignStations({ ...player, seat, owners: state.owners }, { map });
    const express = trails[seat].length === maximum ? rules.expressPoints : 0;
    const stations = player.stations * rules.unusedStationPoints;
    return { seat, name: player.name, route: player.score, destination: assignment.score, completed: assignment.completed,
      stations, express, longest: trails[seat].length, stationRoutes: assignment.assigned,
      individualTickets: assignment.tickets, tickets: player.tickets,
      score: player.score + assignment.score + stations + express };
  }), rules);
  return results.map(result => ({ ...result, details: resultDetails(state, result, results, { map, rules, trails }) }));
}

module.exports = { destinationDetails, rankResults, resultDetails, scoreMatch };
