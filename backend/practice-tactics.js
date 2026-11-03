"use strict";
function createTactics({ planner: P, context }) {
const { rules, tickets } = context;
const cityIds = new Set(context.map.cities.map(city => city.id));

function subsets(items, minimum = 1) {
  const result = [];
  for (let mask = 1; mask < 2 ** items.length; mask++) {
    const indexes = items.flatMap((_, i) => mask & (1 << i) ? [i] : []);
    if (indexes.length >= minimum) result.push(indexes);
  }
  return result;
}
function chooseInitial(g, seat, random, fallback) {
  const p = g.players[seat], counts = P.countCards(p.hand), choices = [], minimum = rules.destinations.initialMinimum;
  for (const indexes of subsets(p.pending, minimum).sort((a, b) => a.length - b.length)) {
    const tickets = indexes.map(i => p.pending[i]);
    const context = P.networks(g, seat, tickets, counts, 34);
    for (const plan of context.options.filter(n => n.completed.length === tickets.length && n.probability >= .7)) {
      const pair = choices.filter(c => c.indexes.length === minimum && c.indexes.every(i => indexes.includes(i))).sort((a, b) => b.value - a.value)[0];
      if (indexes.length > minimum && (!pair || plan.resources.turns > pair.turns + (indexes.length - minimum) * 2)) continue;
      // Tickets accepted now carry their full failure penalty. Shared extra
      // tickets add reward without automatically making a larger plan better.
      const destination = tickets.reduce((sum, t) => sum + t.p, 0) * (2 * plan.probability - 1);
      choices.push({ indexes, turns: plan.resources.turns,
        value: (destination * 2 + plan.routes.reduce((sum, r) => sum + P.points(r), 0) * .4) / (3 + plan.resources.turns) });
    }
  }
  if (!choices.length) return fallback();
  const best = Math.max(...choices.map(c => c.value));
  const pool = choices.filter(c => c.value >= best * .98);
  return { type: "choose_initial", indexes: pool[random(pool.length)].indexes };
}

function estimateTickets(g, seat, tickets, turns = P.horizon(g, seat)) {
  const p = g.players[seat], counts = P.countCards(p.hand), base = P.ticketOutcome(g, seat);
  const available = P.availableRoutes(g, seat);
  const cost = r => {
    const color = r.color === "gray" ? rules.colors.reduce((a, b) => counts[a] >= counts[b] ? a : b) : r.color;
    return 1 + P.missing(r, color, counts) * .85 + (r.tunnel ? .4 : 0);
  };
  const graph = P.graphFor(base.connections, available, cost);
  return tickets.map(ticket => {
    const outcome = P.ticketOutcome(g, seat, { tickets: [...p.tickets, ticket] });
    if (outcome.tickets.at(-1)) return { ticket, value: outcome.score - base.score, turns: 0, probability: 1 };
    const path = P.pathBetween(graph, ticket.a, ticket.b);
    if (!path) return { ticket, value: -ticket.p, turns: Infinity, probability: 0 };
    const remaining = path.filter(r => r.owner === null), allocation = P.allocation(remaining, counts, g.face);
    const possible = remaining.reduce((sum, r) => sum + r.n, 0) <= p.trains && remaining.length <= turns;
    const probability = possible ? Math.min(1, turns / Math.max(1, allocation.turns + 1)) ** 3 * .94 ** remaining.length : 0;
    return { ticket, value: ticket.p * (2 * probability - 1) - allocation.turns * 1.1, turns: allocation.turns, probability };
  });
}

function chooseOffer(g, seat) {
  const p = g.players[seat], offered = p.offer.tickets, horizon = g.phase === "closing" ? 0 : P.horizon(g, seat);
  const counts = P.countCards(p.hand), base = P.ticketOutcome(g, seat);
  const current = P.networks(g, seat, p.tickets, counts, horizon);
  const currentPotential = Math.max(0, ...current.options.map(n => n.gain * n.probability - n.resources.turns));
  let best = null;
  for (const indexes of subsets(offered, rules.destinations.offerMinimum)) {
    const tickets = [...p.tickets, ...indexes.map(i => offered[i])];
    const after = P.ticketOutcome(g, seat, { tickets });
    const plans = P.networks(g, seat, tickets, counts, horizon);
    const potential = Math.max(0, ...plans.options.map(n => n.gain * n.probability - n.resources.turns));
    const value = after.score - base.score + potential - currentPotential;
    if (!best || value > best.value + .01 || Math.abs(value - best.value) <= .01 && indexes.length < best.indexes.length) best = { indexes, value };
  }
  return { type: "keep_tickets", offerId: p.offer.id, indexes: best.indexes };
}

function ticketOpportunity(g, seat, plan, retired = new Set()) {
  const p = g.players[seat];
  if (!g.ticketDeckCount || p.offer || g.drawCount || (plan && plan.resources.turns > 2)) return null;
  const owned = new Set(p.tickets.map(t => t.id));
  const candidates = tickets.filter(t => !t.long && !owned.has(t.id) && !retired.has(t.id));
  if (!candidates.length) return null;
  const turns = g.finalRemaining != null ? 0 : Math.max(0, P.horizon(g, seat) - 1);
  const values = estimateTickets(g, seat, candidates, turns).map(t => t.value);
  const n = Math.min(rules.destinations.offerCount, g.ticketDeckCount, values.length);
  let total = 0, combinations = 0;
  function visit(start, chosen) {
    if (chosen.length === n) {
      const positives = chosen.filter(v => v > 0);
      total += positives.length ? positives.reduce((sum, v) => sum + v, 0) : Math.max(...chosen);
      combinations++; return;
    }
    for (let i = start; i <= values.length - (n - chosen.length); i++) visit(i + 1, [...chosen, values[i]]);
  }
  visit(0, []);
  const value = total / combinations;
  return value > 1.5 ? { action: { type: "draw_tickets" }, value, immediate: 0 } : null;
}

function stationCandidates(g, seat, plan = null, allowFuture = true) {
  const p = g.players[seat];
  if (!p.stations || g.drawCount) return [];
  const payment = P.paymentFor({ n: rules.stations.stationCosts[rules.setup.stations - p.stations], color: "gray", ferry: 0 }, p.hand, plan?.routes || [], g.face);
  if (!payment) return [];
  const occupied = new Set(g.players.flatMap(p => p.placed)), base = P.ticketOutcome(g, seat);
  const foreign = g.routes.filter(r => r.owner !== null && r.owner !== seat);
  const nearby = new Set([...base.connections.flatMap(r => [r.a, r.b]), ...p.tickets.flatMap(t => [t.a, t.b])]);
  const cities = [...new Set(foreign.flatMap(r => [r.a, r.b]))].filter(city => cityIds.has(city) && !occupied.has(city) && nearby.has(city));
  const turns = P.horizon(g, seat), counts = P.afterPayment(P.countCards(p.hand), payment);
  const available = P.availableRoutes(g, seat);
  return cities.map(city => {
    const placed = [...p.placed, city], outcome = P.ticketOutcome(g, seat, { placed });
    const immediate = outcome.score - base.score - rules.scoring.unusedStationPoints;
    let value = immediate;
    // A station can also repair a blocked corridor before its last own segment
    // is built. Every hypothetical completion is scored with one assignment.
    if (allowFuture && immediate <= 0 && turns > 2 && !plan) {
      for (const bridge of foreign.filter(r => r.a === city || r.b === city)) {
        const graph = P.graphFor([...base.connections, bridge], available, r => 1 + r.n * .5);
        for (const ticket of p.tickets.filter((_, i) => !base.tickets[i])) {
          const path = P.pathBetween(graph, ticket.a, ticket.b);
          if (!path) continue;
          const routes = path.filter(r => r.owner === null), resources = P.allocation(routes, counts, g.face);
          if (routes.reduce((sum, r) => sum + r.n, 0) > p.trains || resources.turns + 1 > turns) continue;
          const final = P.ticketOutcome(g, seat, { placed, routes });
          value = Math.max(value, (final.score - base.score - rules.scoring.unusedStationPoints) / (1 + resources.turns));
        }
      }
    }
    const resourceLoss = plan ? P.allocation(plan.routes, counts, g.face).turns - plan.resources.turns : 0;
    value -= Math.max(0, resourceLoss) * 1.2 + payment.wild * .25;
    return { action: { type: "station", city, color: payment.color, wildCount: payment.wild }, value, immediate };
  }).filter(c => c.value > .5).sort((a, b) => b.value - a.value).slice(0, 3);
}
return { chooseInitial, chooseOffer, estimateTickets, ticketOpportunity, stationCandidates };
}
module.exports = { createTactics };
