"use strict";
const { planPayment } = require("./payment");
const { connected } = require("./network");

function decideStation(state, command, { map, rules }) {
  if (!map.cities.some(city => city.id === command.cityId) || state.remainingStations < 1 || state.occupiedCities.has(command.cityId)) {
    return { ok: false, error: { code: "STATION_UNAVAILABLE" } };
  }
  const cost = rules.stationCosts[rules.stationCosts.length - state.remainingStations];
  const payment = planPayment(state.hand, { color: command.color, quantity: cost, wildCount: command.wildCount }, rules);
  if (!payment) return { ok: false, error: { code: "INSUFFICIENT_STATION_PAYMENT" } };
  return { ok: true, plan: { cityId: command.cityId, payment } };
}

function canBuildStation(state, context) {
  const city = context.map.cities.find(city => !state.occupiedCities.has(city.id));
  return Boolean(city && [...context.rules.colors, "wild"].some(color =>
    decideStation(state, { cityId: city.id, color }, context).ok));
}

// One fixed borrowed route per station must serve all destinations together.
// Keep the first optimal assignment in map order, including the null option.
function assignStations({ seat, tickets, placed, owners }, { map }) {
  const ownerOf = id => owners.has(id) ? owners.get(id) : null;
  const own = map.routes.filter(route => ownerOf(route.id) === seat);
  const options = placed.map(city => [null, ...map.routes.filter(route =>
    ownerOf(route.id) !== null && ownerOf(route.id) !== seat && (route.a === city || route.b === city))]);
  let best = { tickets: [], completed: 0, score: -Infinity, assigned: [] };
  function walk(index, chosen) {
    if (index === options.length) {
      const routes = [...own, ...chosen.filter(Boolean)];
      const outcomes = tickets.map(ticket => connected(routes, ticket.a, ticket.b));
      const score = tickets.reduce((sum, ticket, i) => sum + (outcomes[i] ? ticket.points : -ticket.points), 0);
      if (score > best.score) best = { tickets: outcomes, completed: outcomes.filter(Boolean).length,
        score, assigned: chosen.map(route => route ? route.id : null) };
      return;
    }
    for (const route of options[index]) walk(index + 1, [...chosen, route]);
  }
  walk(0, []);
  return best;
}

module.exports = { decideStation, canBuildStation, assignStations };
