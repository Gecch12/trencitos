"use strict";

// Suggestions use only the authorized public board and this player's destinations.
// They never reserve a lane, spend cards or decide whether a ticket is completed.
const DestinationPlanner = (() => {
  function plan(game, seat, ticket, rules, previous = null) {
    const routes = game.routes, byId = new Map(routes.map(r => [r.id, r]));
    const placed = game.players[seat]?.placed || [];
    const completed = game.ticketProgress?.find(t => t.id === ticket.id)?.completed;
    const actual = completed && game.ticketPaths?.find(t => t.id === ticket.id);
    if (actual) return { ...actual, additional: 0, completed: true, reachable: true };

    // Retain station loans that already complete kept destinations. Suggestions
    // must not silently break those connections to advertise a new zero-cost one.
    const fixed = new Map();
    for (const path of game.ticketPaths || []) for (const station of path.stations || [])
      if (station.routeId != null) fixed.set(station.city, station.routeId);
    const graph = new Map();
    function add(route, cost, station = -1) {
      for (const [from, to] of [[route.a, route.b], [route.b, route.a]]) {
        if (!graph.has(from)) graph.set(from, []);
        graph.get(from).push({ to, route, cost, station });
      }
    }
    for (const r of routes) {
      if (r.owner === seat) add(r, 0);
      else if (r.owner === null) {
        const blocked = routes.some(other => other.id !== r.id && other.owner !== null &&
          ((r.a === other.a && r.b === other.b) || (r.a === other.b && r.b === other.a)) &&
          (other.owner === seat || game.players.length < rules.doubleRoutesMinPlayers));
        if (!blocked) add(r, r.n);
      } else placed.forEach((city, index) => {
        if ((r.a === city || r.b === city) && (!fixed.has(city) || fixed.get(city) === r.id)) add(r, 0, index);
      });
    }
    // Station usage is part of the search state: one station can lend only one
    // rival lane. A city-only Dijkstra can incorrectly borrow both its exits.
    const key = (city, mask) => JSON.stringify([city, mask]);
    const start = { city: ticket.a, mask: 0, cost: 0, length: 0, routes: [], loans: [] };
    const best = new Map([[key(start.city, 0), start]]), queue = [start];
    let result = null;
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost || a.length - b.length);
      const current = queue.shift();
      if (best.get(key(current.city, current.mask)) !== current) continue;
      if (current.city === ticket.b) { result = current; break; }
      for (const edge of graph.get(current.city) || []) {
        const bit = edge.station < 0 ? 0 : 1 << edge.station;
        if (current.mask & bit) continue;
        const next = { city: edge.to, mask: current.mask | bit, cost: current.cost + edge.cost,
          length: current.length + edge.route.n, routes: [...current.routes, edge.route.id],
          loans: bit ? [...current.loans, { city: placed[edge.station], routeId: edge.route.id, seat }] : current.loans };
        const id = key(next.city, next.mask), before = best.get(id);
        if (!before || next.cost < before.cost || (next.cost === before.cost && next.length < before.length)) {
          best.set(id, next); queue.push(next);
        }
      }
    }
    if (!result) return { id: ticket.id, routes: [], stationRoutes: [], stations: [], additional: null, reachable: false, completed: false };
    // Keep an equally economical previous route to avoid unrelated board changes
    // making the preview jump between alternatives. Validate it against the graph.
    if (previous?.reachable && previous.additional === result.cost) {
      let states = [{ city: ticket.a, mask: 0, cost: 0, loans: [] }];
      for (const id of previous.routes) states = states.flatMap(state => (graph.get(state.city) || [])
        .filter(e => e.route.id === id && !(e.station >= 0 && state.mask & (1 << e.station)))
        .map(e => ({ city: e.to, mask: state.mask | (e.station < 0 ? 0 : 1 << e.station), cost: state.cost + e.cost,
          loans: e.station < 0 ? state.loans : [...state.loans, { city: placed[e.station], routeId: id, seat }] })));
      const valid = states.find(s => s.city === ticket.b && s.cost === result.cost);
      if (valid) result = { ...result, routes: previous.routes, loans: valid.loans };
    }
    return { id: ticket.id, routes: result.routes, stationRoutes: result.loans.map(s => s.routeId), stations: result.loans,
      additional: result.cost, reachable: true, completed: false,
      total: result.routes.reduce((sum, id) => sum + byId.get(id).n, 0) };
  }
  return { plan };
})();
if (typeof module !== "undefined") module.exports = DestinationPlanner;
