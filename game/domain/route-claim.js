"use strict";
const { planPayment } = require("./payment");

function sameCorridor(a, b) {
  if (a.corridorId !== undefined && b.corridorId !== undefined) return a.corridorId === b.corridorId;
  // Europe has no explicit corridor IDs yet. Its parallel lanes share ends.
  return a.a === b.a && a.b === b.b || a.a === b.b && a.b === b.a;
}

function blocksParallelRoute(route, other, { owner, seat, playerCount }, rules) {
  return other.id !== route.id && sameCorridor(route, other) && owner !== null &&
    (owner === seat || playerCount < rules.doubleRoutesMinPlayers);
}

// The caller owns phase/turn validation. This policy only decides construction
// on a validated map and ruleset; it neither spends cards nor starts a clock.
// owners is a Map keyed by opaque route IDs; absent entries mean unclaimed.
function decideRouteClaim(state, command, { map, rules }) {
  const reject = code => ({ ok: false, error: { code } });
  const ownerOf = id => state.owners.has(id) ? state.owners.get(id) : null;
  const route = map.routes.find(r => r.id === command.routeId);
  if (!route || ownerOf(route.id) !== null || map.routes.some(other =>
    blocksParallelRoute(route, other, {
      owner: ownerOf(other.id), seat: state.seat, playerCount: state.playerCount,
    }, rules))) return reject("ROUTE_UNAVAILABLE");
  if (state.trains < route.length) return reject("INSUFFICIENT_TRAINS");
  const color = command.color === "wild" ? "wild" : route.color === "gray" ? command.color : route.color;
  if (color !== "wild" && !rules.colors.includes(color)) return reject("INVALID_PAYMENT_COLOR");
  const payment = planPayment(state.hand, {
    color, quantity: route.length, wildNeeded: route.ferry, wildCount: command.wildCount,
  }, rules);
  if (!payment || payment.wild < route.ferry) return reject("INSUFFICIENT_PAYMENT");
  return { ok: true, plan: {
    kind: route.tunnel ? "tunnel" : "build", routeId: route.id, payment,
    length: route.length, points: rules.routePoints[route.length],
  } };
}

module.exports = { blocksParallelRoute, decideRouteClaim };
