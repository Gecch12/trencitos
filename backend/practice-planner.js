"use strict";
const E = require("./engine");
const suits = [...E.COLORS, "wild"];
const countCards = hand => Object.fromEntries(suits.map(c => [c, hand.filter(x => x === c).length]));
const points = r => E.SCORE[r.n] || r.n;
const missing = (r, color, c) => Math.max(0, (r.ferry || 0) - c.wild, r.n - (color === "wild" ? 0 : c[color]) - c.wild);
const availableRoutes = (g, seat) => g.routes.filter(r => r.owner === null && r.n <= g.players[seat].trains && !E.block(g, r, seat));
const sameEnds = (a, b) => a.a === b.a && a.b === b.b || a.a === b.b && a.b === b.a;

// A small explicit observation boundary. Opponent hand length is public; no
// opponent card, destination or hidden deck element crosses this boundary.
function observe(game, seat) {
  return {
    phase: game.phase, current: game.current, turnSerial: game.turnSerial, drawCount: game.drawCount,
    finalRemaining: game.finalRemaining, turnWaiting: game.turnWaiting,
    players: game.players.map((p, i) => ({ trains: p.trains, score: p.score, handCount: p.hand.length,
      stations: p.stations, placed: [...p.placed], ticketsCount: p.tickets.length,
      ...(i === seat ? { hand: [...p.hand], tickets: p.tickets, pending: p.pending, offer: p.offer || null } : {}) })),
    routes: game.routes, face: game.face, deckCount: game.deck.length, discardCount: game.discard.length,
    ticketDeckCount: game.shortDeck.length,
    tunnel: game.phase === "tunnel" && game.current === seat ? game.pending : null,
    events: (game.events || []).filter(e => e.type !== "tunnel_reveal" || e.seat === seat).map(e => ({ id: e.id, type: e.type, seat: e.seat, routeId: e.routeId,
      ...(e.type === "draw" && e.index >= 0 ? { color: e.color } : {}) })),
  };
}

function rememberPublic(g, memory) {
  // The public event buffer is bounded. If a bot missed a batch, an unseen
  // payment may have spent its remembered cards; discard those inferences.
  if (g.events.length && g.events[0].id > memory.eventId + 1) memory.known = {};
  for (const e of g.events) {
    if (e.id <= memory.eventId) continue;
    if (e.type === "build") memory.known[e.seat] = {};
    if (e.type === "draw" && e.color) {
      const cards = memory.known[e.seat] ||= {};
      cards[e.color] = (cards[e.color] || 0) + 1;
    }
    memory.eventId = e.id;
  }
}

// Dijkstra is used only to generate alternatives. Joint evaluation below
// allocates the actual hand once across the entire union of routes.
function graphFor(owned, available, cost, excluded = new Set()) {
  const graph = new Map();
  for (const r of [...owned, ...available]) {
    if (excluded.has(r.id)) continue;
    for (const [from, to] of [[r.a, r.b], [r.b, r.a]]) {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push({ to, route: r, cost: owned.includes(r) ? 0 : cost(r) });
    }
  }
  return graph;
}
function pathBetween(graph, from, to) {
  const distance = new Map([[from, 0]]), previous = new Map(), visited = new Set();
  while (true) {
    let current = null, best = Infinity;
    for (const [city, value] of distance) if (!visited.has(city) && value < best) { current = city; best = value; }
    if (current === null) return null;
    if (current === to) break;
    visited.add(current);
    for (const e of graph.get(current) || []) if (best + e.cost < (distance.get(e.to) ?? Infinity)) {
      distance.set(e.to, best + e.cost); previous.set(e.to, { city: current, route: e.route });
    }
  }
  const routes = [];
  for (let city = to; city !== from;) { const step = previous.get(city); routes.push(step.route); city = step.city; }
  return routes.reverse();
}
const union = routes => [...new Map(routes.map(r => [r.id, r])).values()];
const key = routes => routes.map(r => r.id).sort((a, b) => a - b).join(",");

function alternatives(owned, available, ticket, cost, seat) {
  const first = pathBetween(graphFor(owned, available, cost), ticket.a, ticket.b);
  if (!first) return [];
  const paths = new Map([[key(first), first]]);
  // Bound graph searches even for long destinations.
  for (const r of first.filter(r => available.includes(r) || r.owner !== seat).slice(0, 8)) {
    const path = pathBetween(graphFor(owned, available, cost, new Set([r.id])), ticket.a, ticket.b);
    if (path) paths.set(key(path), path);
  }
  return [...paths.values()].sort((a, b) => a.reduce((v, r) => v + (owned.includes(r) ? 0 : cost(r)), 0)
    - b.reduce((v, r) => v + (owned.includes(r) ? 0 : cost(r)), 0)).slice(0, 3);
}

function allocation(routes, counts, face = [], preferred = new Map()) {
  const demand = Object.fromEntries(E.COLORS.map(c => [c, 0])), colors = new Map();
  let mandatory = 0;
  for (const r of routes) {
    mandatory += r.ferry || 0;
    if (r.color !== "gray") { demand[r.color] += r.n - (r.ferry || 0); colors.set(r.id, r.color); }
  }
  for (const r of routes.filter(r => r.color === "gray").sort((a, b) => b.n - a.n)) {
    const color = [...E.COLORS].sort((a, b) => {
      const value = c => Math.min(r.n, counts[c] - demand[c]) + (preferred.get(r.id) === c ? .15 : 0) + (face.includes(c) ? .1 : 0);
      return value(b) - value(a);
    })[0];
    demand[color] += r.n - (r.ferry || 0); colors.set(r.id, color);
  }
  const deficits = Object.fromEntries(E.COLORS.map(c => [c, Math.max(0, demand[c] - counts[c])]));
  const regularMissing = Object.values(deficits).reduce((a, b) => a + b, 0);
  const wildMissing = Math.max(0, mandatory - counts.wild);
  const shortage = wildMissing + Math.max(0, regularMissing - Math.max(0, counts.wild - mandatory));
  // Turns are estimates, not a peek at future draws. Fixed tunnel allowance
  // accounts for extra cards; the tactical selector evaluates failure risk.
  const turns = routes.length + shortage * .85 + wildMissing * .5 + routes.filter(r => r.tunnel).length * .4;
  return { colors, demand, deficits, mandatory, shortage, turns };
}

function horizon(g, seat) {
  if (g.finalRemaining != null) return 1;
  let turns = 40;
  for (let i = 0; i < g.players.length; i++) {
    if (i === seat) continue;
    const p = g.players[i], built = g.routes.filter(r => r.owner === i);
    const average = built.length ? built.reduce((v, r) => v + r.n, 0) / built.length : 3.5;
    const available = availableRoutes(g, i);
    if (!available.length) continue;
    const length = Math.max(2, Math.min(6, average));
    const needed = Math.max(0, p.trains - 2);
    const builds = Math.max(1, Math.ceil(needed / length));
    const draws = Math.max(0, needed - p.handCount) * .65;
    // A rival with few trains and a large hand can end immediately even if
    // their previous constructions were short.
    const quick = available.some(r => p.trains - r.n <= 2 && p.handCount >= r.n);
    turns = Math.min(turns, quick ? 2 : builds + draws + 1);
  }
  return turns;
}

function networks(g, seat, tickets, counts, remainingTurns, preferred = new Map()) {
  const base = ticketOutcome(g, seat, { tickets });
  const owned = planningConnections(g, seat), available = availableRoutes(g, seat), availableIds = new Set(available.map(r => r.id));
  const pending = tickets.filter((t, i) => !base.tickets[i]);
  const cost = r => {
    const color = r.color === "gray" ? E.COLORS.reduce((a, b) => counts[a] >= counts[b] ? a : b) : r.color;
    return 1 + r.n * .12 + missing(r, color, counts) * .7 + (r.ferry || 0) * .25 + (r.tunnel ? .45 : 0);
  };
  const evaluate = routes => {
    routes = union(routes.filter(r => availableIds.has(r.id)));
    if (routes.reduce((s, r) => s + r.n, 0) > g.players[seat].trains) return null;
    if (routes.some((r, i) => routes.slice(i + 1).some(other => sameEnds(r, other)))) return null;
    const outcome = ticketOutcome(g, seat, { tickets, routes });
    const completed = pending.filter(t => outcome.tickets[tickets.indexOf(t)]);
    const resources = allocation(routes, counts, g.face, preferred);
    const gain = outcome.score - base.score;
    const reward = gain + routes.reduce((s, r) => s + points(r), 0);
    const probability = routes.length > remainingTurns ? 0 : Math.min(1, remainingTurns / Math.max(1, resources.turns)) ** 3;
    return { routes, completed, resources, gain, reward, probability,
      value: reward * probability / (2 + resources.turns) };
  };
  let beam = [evaluate([])];
  for (const t of [...pending].sort((a, b) => b.p - a.p).slice(0, 8)) {
    const paths = alternatives(owned, available, t, cost, seat);
    const next = new Map(beam.map(n => [key(n.routes), n]));
    for (const n of beam) {
      const shared = new Set(n.routes.map(r => r.id));
      const sharedPath = pathBetween(graphFor(owned, available, r => shared.has(r.id) ? .05 : cost(r)), t.a, t.b);
      for (const path of [...paths, ...(sharedPath ? [sharedPath] : [])]) {
        const option = evaluate([...n.routes, ...path]);
        if (option) next.set(key(option.routes), option);
      }
    }
    beam = [...next.values()].sort((a, b) => b.value - a.value).slice(0, 12);
  }
  return { owned, available, pending, base, options: beam.filter(n => n.gain > 0 && n.value > 0), cost, evaluate };
}

// Score all tickets under one compatible station assignment. Borrowing a
// different edge per ticket would incorrectly make a station omnipotent.
function ticketOutcome(g, seat, { tickets = g.players[seat].tickets, routes = [], placed = g.players[seat].placed || [] } = {}) {
  const added = new Set(routes.map(r => r.id));
  const board = routes.length ? g.routes.map(r => added.has(r.id) ? { ...r, owner: seat } : r) : g.routes;
  const players = g.players.map((p, i) => i === seat ? { ...p, tickets, placed } : p);
  const result = E.stationAssignments({ routes: board, players }, seat);
  const borrowed = new Set(result.assigned.filter(id => id !== null));
  return { ...result, connections: board.filter(r => r.owner === seat || borrowed.has(r.id)) };
}

// Optimistic graph used only to generate paths. Exact joint station assignment
// in ticketOutcome evaluates every resulting network before accepting it.
function planningConnections(g, seat) {
  const placed = new Set(g.players[seat].placed || []);
  return g.routes.filter(r => r.owner === seat || r.owner !== null && (placed.has(r.a) || placed.has(r.b)));
}

function pressure(g, seat, route, known) {
  let threat = 0;
  for (let i = 0; i < g.players.length; i++) {
    if (i === seat || g.players[i].trains < route.n || E.block(g, route, i)) continue;
    const own = g.routes.filter(r => r.owner === i);
    const cities = new Set(own.flatMap(r => [r.a, r.b]));
    const adjacent = Number(cities.has(route.a)) + Number(cities.has(route.b));
    const cards = known[i] || {};
    const matching = route.color === "gray" ? Math.max(0, ...E.COLORS.map(c => cards[c] || 0)) : cards[route.color] || 0;
    threat = Math.max(threat, adjacent * .3 + Math.min(.3, (matching + (cards.wild || 0)) / route.n * .3)
      + (adjacent && g.players[i].handCount >= route.n ? .2 : 0));
  }
  return Math.min(1, threat);
}
function urgency(g, seat, route, plan, context, known) {
  if (!plan?.routes.some(r => r.id === route.id)) return 0;
  const excluded = new Set([route.id]);
  // With 2–3 players an opponent taking either parallel lane removes both.
  if (g.players.length <= 3) for (const r of context.available) if (sameEnds(r, route)) excluded.add(r.id);
  const graph = graphFor(context.owned, context.available, context.cost, excluded);
  const planned = graphFor(context.owned, plan.routes, context.cost);
  let loss = 0;
  for (const t of plan.completed) {
    const path = pathBetween(graph, t.a, t.b);
    if (!path) loss += t.p * 2;
    else {
      const alternative = allocation(path.filter(r => r.owner === null), countCards(g.players[seat].hand), g.face).turns;
      const original = pathBetween(planned, t.a, t.b);
      const before = allocation((original || []).filter(r => r.owner === null), countCards(g.players[seat].hand), g.face).turns;
      loss += Math.min(t.p * 2, Math.max(0, alternative - before) * 3);
    }
  }
  return loss * (.05 + pressure(g, seat, route, known) * .65);
}

function afterPayment(counts, payment) {
  const after = { ...counts };
  if (payment.regular) after[payment.color] -= payment.regular;
  after.wild -= payment.wild;
  return after;
}
function paymentFor(route, hand, rest = [], face = [], preferred = new Map()) {
  const counts = countCards(hand);
  return (route.color === "gray" ? [...E.COLORS, "wild"] : [route.color, "wild"])
    .map(c => E.pay(hand, c, route.n, route.ferry || 0))
    .filter(p => p && (p.regular > 0 || p.color === "wild"))
    .map(p => ({ ...p, cost: allocation(rest, afterPayment(counts, p), face, preferred).turns + p.wild * .25 }))
    .sort((a, b) => a.cost - b.cost)[0] || null;
}
function tunnelSuccess(g, seat, route, payment) {
  if (!route.tunnel || !payment) return 1;
  const remaining = afterPayment(countCards(g.players[seat].hand), payment);
  const reserve = remaining.wild + (payment.color === "wild" ? 0 : remaining[payment.color]);
  const reveals = Math.min(3, g.deckCount + g.discardCount);
  if (reserve >= reveals) return 1;
  // Prior over unseen cards, conditioned only on our hand and the market.
  const visible = [...g.players[seat].hand, ...g.face];
  const matches = c => c === "wild" || c === payment.color;
  const p = Math.max(0, Math.min(1, ((payment.color === "wild" ? 14 : 26) - visible.filter(matches).length) / Math.max(1, 110 - visible.length)));
  let chance = 0;
  const combinations = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]][reveals];
  for (let n = 0; n <= reserve; n++) chance += combinations[n] * p ** n * (1 - p) ** (reveals - n);
  return chance;
}

// Bounded trail search for decision estimates; final scoring remains exact in
// the engine. Avoid exponential server work on unusually dense networks.
function trailLength(routes, seat, limit = 4000) {
  const own = routes.filter(r => r.owner === seat), adj = new Map();
  own.forEach((r, i) => { for (const c of [r.a, r.b]) { if (!adj.has(c)) adj.set(c, []); adj.get(c).push(i); } });
  let best = 0, visits = 0;
  function walk(city, used, length) {
    best = Math.max(best, length);
    if (++visits > limit) return;
    for (const i of adj.get(city) || []) {
      const bit = 1n << BigInt(i);
      if (used & bit) continue;
      const r = own[i]; walk(r.a === city ? r.b : r.a, used | bit, length + r.n);
      if (visits > limit) return;
    }
  }
  for (const city of adj.keys()) { walk(city, 0n, 0); if (visits > limit) break; }
  return best;
}
module.exports = { observe, rememberPublic, countCards, points, missing, availableRoutes, allocation, horizon, networks,
  urgency, afterPayment, paymentFor, tunnelSuccess, trailLength, ticketOutcome, planningConnections, graphFor, pathBetween };
