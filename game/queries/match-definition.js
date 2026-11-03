"use strict";

// Public protocol v1 uses the same route/ticket IDs and row shapes as the match
// views (numeric Europe IDs remain compatible). It is not the canonical catalog
// schema and contains neither ownership, hidden allocations nor board geometry.
function projectDefinition({ map, mapRef, rulesRef, routes, tickets, rules }) {
  const pair = (a, b) => JSON.stringify([a, b].sort());
  const corridors = new Map(map.corridors.map(c => [pair(...c.cityIds), c.id]));
  return structuredClone({
    schemaVersion: 1, mapRef, rulesRef,
    map: {
      cities: map.cities.map(({ id, name }) => ({ id, name })),
      corridors: map.corridors.map(({ id, cityIds }) => ({ id, cityIds })),
      routes: routes.map(({ id, a, b, n, color, tunnel, ferry }) =>
        ({ id, corridorId: corridors.get(pair(a, b)), a, b, n, color, tunnel, ferry })),
      tickets: tickets.map(({ id, a, b, p, long }) => ({ id, a, b, p, long })),
    },
    rules: {
      colors: rules.colors, routePoints: rules.routePoints,
      capabilities: { tunnels: rules.capabilities.tunnels, ferries: rules.capabilities.ferries },
      doubleRoutesMinPlayers: rules.claim.doubleRoutesMinPlayers,
      setup: { minPlayers: rules.setup.minPlayers, maxPlayers: rules.setup.maxPlayers,
        trains: rules.setup.trains, stations: rules.setup.stations, initialHand: rules.setup.initialHand,
        initialLongTickets: rules.setup.initialLongTickets, initialShortTickets: rules.setup.initialShortTickets,
        trainCards: rules.setup.trainCards.map(({ color, count }) => ({ color, count })) },
      trainCards: { marketSize: rules.trainCards.marketSize, refreshWildCount: rules.trainCards.refreshWildCount,
        drawsPerTurn: rules.trainCards.drawsPerTurn },
      destinations: { initialMinimum: rules.destinations.initialMinimum, offerMinimum: rules.destinations.offerMinimum,
        offerCount: rules.destinations.offerCount },
      stationCosts: rules.stations.stationCosts, finalTrainThreshold: rules.turn.finalTrainThreshold,
      scoring: { unusedStationPoints: rules.scoring.unusedStationPoints, expressPoints: rules.scoring.expressPoints,
        tieBreakers: rules.scoring.tieBreakers },
    },
  });
}

module.exports = { projectDefinition };
