// Frozen pre-upgrade practice policy for reproducible comparisons (2026-10-31).
"use strict";
const Engine = require("../../backend/engine");

// Private, disposable intent: never put plans into the game, broadcasts or saves.
// Reconnection keeps the same game; replacing/collecting a game resets its plans.
const plans = new WeakMap();
const countCards = hand => Object.fromEntries([...Engine.COLORS, "wild"].map(c => [c, hand.filter(x => x === c).length]));
const points = route => Engine.SCORE[route.n] || route.n;
const missing = (route, color, counts) => Math.max(0, (route.ferry || 0) - counts.wild, route.n - counts[color] - counts.wild);
const routeCost = route => route.n + 1.5 + (route.ferry || 0) * .8 + (route.tunnel ? .7 : 0);

// Sample among comparably good choices. Small noise gives variety without
// allowing a clearly unhelpful move to displace a destination-completing one.
function weightedChoice(items, random, quality = .7) {
  if (!items.length) return null;
  const best = Math.max(...items.map(item => item.value));
  const pool = items.filter(item => item.value >= best * quality);
  const weights = pool.map(item => Math.max(1, Math.round(item.value * item.value * 100)));
  let roll = random(weights.reduce((sum, weight) => sum + weight, 0));
  for (let i = 0; i < pool.length; i++) { roll -= weights[i]; if (roll < 0) return pool[i]; }
  return pool.at(-1);
}

function availableRoutes(game, seat) {
  return game.routes.filter(r => r.owner === null && r.n <= game.players[seat].trains && !Engine.block(game, r, seat));
}

function graphFor(game, seat, available) {
  const graph = new Map();
  for (const r of [...game.routes.filter(r => r.owner === seat), ...available]) {
    for (const [from, to] of [[r.a, r.b], [r.b, r.a]]) {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push({ to, route: r, cost: r.owner === seat ? 0 : routeCost(r) });
    }
  }
  return graph;
}

// Dijkstra over at most 47 cities. Owned track is free; opponents' tracks and
// forbidden parallel routes are absent. No hidden cards or destinations enter it.
function pathBetween(graph, from, to) {
  const distance = new Map([[from, 0]]), previous = new Map(), visited = new Set();
  while (true) {
    let current = null, best = Infinity;
    for (const [city, value] of distance) if (!visited.has(city) && value < best) { current = city; best = value; }
    if (current === null) return null;
    if (current === to) break;
    visited.add(current);
    for (const edge of graph.get(current) || []) {
      const next = best + edge.cost;
      if (next < (distance.get(edge.to) ?? Infinity)) {
        distance.set(edge.to, next); previous.set(edge.to, { city: current, route: edge.route });
      }
    }
  }
  const routes = [];
  for (let city = to; city !== from;) {
    const step = previous.get(city); routes.push(step.route); city = step.city;
  }
  return routes.reverse();
}

function initialChoice(game, seat, random, fallback) {
  const pending = game.players[seat].pending;
  if (pending.length < 2) return fallback(game, seat, random);
  const graph = graphFor(game, seat, availableRoutes(game, seat));
  const paths = pending.map(t => pathBetween(graph, t.a, t.b));
  const pairs = [];
  for (let a = 0; a < pending.length; a++) for (let b = a + 1; b < pending.length; b++) {
    if (!paths[a] || !paths[b]) continue;
    const union = new Map([...paths[a], ...paths[b]].map(r => [r.id, r]));
    const trains = [...union.values()].reduce((sum, r) => sum + r.n, 0);
    if (trains > game.players[seat].trains) continue;
    const shared = paths[a].filter(r => paths[b].some(other => r.id === other.id)).reduce((sum, r) => sum + r.n, 0);
    pairs.push({ indexes: [a, b], value: (pending[a].p + pending[b].p + shared * 2) / (3 + trains + union.size * .8) });
  }
  const choice = weightedChoice(pairs, random, .8);
  return choice ? { type: "choose_initial", indexes: choice.indexes } : fallback(game, seat, random);
}

function paymentFor(route, hand) {
  const colors = route.color === "gray" ? [...Engine.COLORS, "wild"] : [route.color, "wild"];
  const valid = colors.map(c => Engine.pay(hand, c, route.n, route.ferry))
    .filter(p => p && p.wild >= route.ferry && (p.regular > 0 || p.color === "wild"));
  return valid.sort((a, b) => a.wild - b.wild)[0] || null;
}

function targetColor(route, counts, random) {
  if (route.color !== "gray") return route.color;
  const most = Math.max(...Engine.COLORS.map(c => counts[c]));
  const colors = Engine.COLORS.filter(c => counts[c] === most);
  return colors[random(colors.length)];
}

function routeCandidates(game, seat, counts) {
  const player = game.players[seat], available = availableRoutes(game, seat), graph = graphFor(game, seat, available);
  const benefits = new Map(), owned = game.routes.filter(r => r.owner === seat);
  const ownedCities = new Set(owned.flatMap(r => [r.a, r.b]));
  const pending = player.tickets.filter(t => !Engine.connected(owned, t.a, t.b));
  for (const ticket of pending) {
    const path = pathBetween(graph, ticket.a, ticket.b);
    if (!path) continue;
    const remaining = path.filter(r => r.owner !== seat);
    if (remaining.reduce((sum, r) => sum + r.n, 0) > player.trains) continue;
    for (const r of remaining) {
      benefits.set(r.id, (benefits.get(r.id) || 0) + (12 + ticket.p) / remaining.length);
    }
  }
  return available.map(route => {
    const color = route.color === "gray" ? Engine.COLORS.reduce((best, c) => counts[c] > counts[best] ? c : best) : route.color;
    const need = missing(route, color, counts), payment = paymentFor(route, player.hand);
    // A different bridge may complete the same ticket even if Dijkstra chose
    // another path. Evaluate actual connectivity, not just membership in a plan.
    const completion = pending.filter(t => Engine.connected([...owned, route], t.a, t.b)).reduce((sum, t) => sum + t.p * 2, 0);
    const benefit = benefits.get(route.id) || completion;
    const attached = ownedCities.has(route.a) || ownedCities.has(route.b);
    return { route, payment, color, need, benefit, completion,
      value: (3 + points(route) * 1.1 + benefit + completion + (attached ? 2 : 0)) / (1 + need * .65) };
  });
}

function claim(candidate) {
  const p = candidate.payment;
  return { type: "claim", routeId: candidate.route.id, color: p.color, wildCount: p.wild };
}

function chooseDraw(game, candidates, target, counts, random) {
  const sources = [], blind = game.deck.length || game.discard.length;
  if (blind) sources.push({ index: -1, value: 2 });
  game.face.forEach((color, index) => {
    if (game.drawCount && color === "wild") return;
    const after = { ...counts, [color]: counts[color] + 1 };
    let value = .5;
    for (const c of candidates) {
      const primary = c.route.id === target?.route.id;
      const suit = primary ? target.color : c.color;
      if (missing(c.route, suit, after) < missing(c.route, suit, counts)) {
        const mandatory = color === "wild" && c.route.ferry > counts.wild;
        // A visible wildcard costs both draws. Prefer the needed regular card
        // unless the ferry specifically requires a wildcard.
        value = Math.max(value, (primary ? 12 : c.benefit ? 6 : 3) * (color === "wild" && !mandatory ? .55 : 1));
      }
    }
    sources.push({ index, value });
  });
  const chosen = weightedChoice(sources, random, .75);
  return chosen ? { type: "draw_train", index: chosen.index } : null;
}

function choosePracticeAction(game, seat, random, fallback) {
  const player = game.players[seat];
  if (!player || game.phase === "finished") return null;
  if (game.phase === "initial") return initialChoice(game, seat, random, fallback);
  if (game.current !== seat || game.turnWaiting) return null;
  // Preserve the legal tunnel payment/decline behavior, including its reserved
  // base payment. Hidden deck contents are never used to predict tunnel cards.
  if (game.phase !== "play") return fallback(game, seat, random);
  const counts = countCards(player.hand), candidates = routeCandidates(game, seat, counts);
  if (!candidates.length) return fallback(game, seat, random);
  let seats = plans.get(game);
  if (!seats) { seats = new Map(); plans.set(game, seats); }
  let plan = seats.get(seat);
  if (plan && plan.serial !== game.turnSerial) { plan.age++; plan.serial = game.turnSerial; }
  const finalTurn = game.finalRemaining != null;
  const late = finalTurn || Math.min(...game.players.map(p => p.trains)) <= 8;
  const useful = candidates.filter(c => c.benefit > 0);
  const pool = useful.length ? useful : candidates;
  let target = plan && pool.find(c => c.route.id === plan.routeId);
  // Keep an almost-ready target, even when it took more than four own turns to
  // save. Invalid/blocked plans disappear immediately from the candidate pool.
  if (!target || (plan.age >= 4 && !target.payment && missing(target.route, plan.color, counts) > 1)) {
    target = weightedChoice(pool, random);
    plan = { routeId: target.route.id, color: targetColor(target.route, counts, random), age: 0, serial: game.turnSerial };
    seats.set(seat, plan);
  }
  target = { ...target, color: plan.color };
  // Once drawing begins it must finish; never build after the first card.
  if (game.drawCount) return chooseDraw(game, candidates, target, counts, random);
  const affordable = candidates.filter(c => c.payment);
  const completing = affordable.filter(c => c.completion > 0);
  if (completing.length) return claim(weightedChoice(completing, random, .85));
  if (finalTurn && affordable.length) {
    return claim(weightedChoice(affordable.map(c => ({ ...c, value: points(c.route) - c.payment.wild * .1 })), random, .9));
  }
  if (late && !target.payment && target.need > 2 && affordable.length) {
    return claim(weightedChoice(affordable, random));
  }
  const canDraw = game.deck.length || game.discard.length || game.face.length;
  if (target.payment && (!canDraw || late || player.hand.length >= 16 || random(100) < 88)) return claim(target);
  // An opportunistic build must leave the planned route at least as affordable.
  // This allows useful side connections without constantly spending the savings.
  const before = missing(target.route, target.color, counts);
  const opportunities = affordable.filter(c => {
    if (c.route.id === target.route.id) return false;
    const after = { ...counts, [c.payment.color]: counts[c.payment.color] - c.payment.regular, wild: counts.wild - c.payment.wild };
    return missing(target.route, target.color, after) <= before && (!useful.length || c.benefit > 0);
  });
  if (opportunities.length && (late || random(100) < 22)) return claim(weightedChoice(opportunities, random));
  // Avoid hoarding forever when a plan is slow or no cards can be drawn.
  if (affordable.length && (!canDraw || player.hand.length >= 18)) return claim(weightedChoice(affordable, random));
  return chooseDraw(game, candidates, target, counts, random);
}

module.exports = { choosePracticeAction };
