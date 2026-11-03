"use strict";
const E = require("./engine");
const P = require("./practice-planner");
const T = require("./practice-tactics");
const LIMITS = Object.freeze({ candidates: 3, samples: 2, ownTurns: 3, actionsPerBranch: 48 });
const randomStream = seed => max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = random(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

// Input is the redacted observation, never a real game. Only hypothetical
// opponent hands, destinations and deck orders are constructed here.
function sampleWorld(g, seat, known, random, retired = new Set()) {
  const counts = Object.fromEntries([...E.COLORS, "wild"].map(c => [c, c === "wild" ? 14 : 12]));
  for (const c of [...g.players[seat].hand, ...g.face]) counts[c] = Math.max(0, counts[c] - 1);
  const hands = g.players.map((p, i) => i === seat ? [...p.hand] : []);
  for (let i = 0; i < hands.length; i++) if (i !== seat) {
    for (const [c, count] of Object.entries(known[i] || {})) {
      const n = Math.min(count, counts[c] || 0, g.players[i].handCount - hands[i].length);
      for (let j = 0; j < n; j++) hands[i].push(c);
      counts[c] -= n;
    }
  }
  const unseen = shuffled(Object.entries(counts).flatMap(([c, n]) => Array(n).fill(c)), random);
  for (let i = 0; i < hands.length; i++) if (i !== seat) {
    hands[i].push(...unseen.splice(0, Math.max(0, g.players[i].handCount - hands[i].length)));
  }
  const ownIds = new Set(g.players[seat].tickets.map(t => t.id));
  let ticketPool = E.TICKETS.filter(t => !ownIds.has(t.id) && !retired.has(t.id));
  const opponents = g.players.flatMap((p, i) => i !== seat && p.ticketsCount ? [i] : []);
  const neededLong = Math.max(0, opponents.reduce((sum, i) => sum + g.players[i].ticketsCount, 0)
    - Math.max(0, ticketPool.filter(t => !t.long).length - g.ticketDeckCount));
  const reserved = new Map();
  for (const i of shuffled(opponents, random).slice(0, neededLong)) {
    const long = ticketPool.flatMap((t, index) => t.long ? [index] : []);
    if (long.length) reserved.set(i, ticketPool.splice(long[random(long.length)], 1)[0]);
  }
  const players = g.players.map((p, i) => {
    const tickets = i === seat ? [...p.tickets] : reserved.has(i) ? [reserved.get(i)] : [];
    if (i !== seat) {
      const cities = new Set(g.routes.filter(r => r.owner === i).flatMap(r => [r.a, r.b]));
      while (tickets.length < p.ticketsCount && ticketPool.length) {
        // A weak hypothesis from public construction, never a known objective.
        const eligible = ticketPool.flatMap((t, index) => t.long && tickets.some(held => held.long) ? [] : [{ t, index }]);
        if (!eligible.length) break;
        const weights = eligible.map(({ t }) => 1 + Number(cities.has(t.a)) + Number(cities.has(t.b)));
        let roll = random(weights.reduce((a, b) => a + b, 0)), index = 0;
        while (index < weights.length - 1 && roll >= weights[index]) roll -= weights[index++];
        tickets.push(...ticketPool.splice(eligible[index].index, 1));
      }
    }
    return { name: `Sample ${i}`, color: E.COLORS[i], trains: p.trains, stations: p.stations,
      placed: [...p.placed], score: p.score || 0, hand: hands[i], tickets, pending: [], offer: null };
  });
  return { phase: "play", current: seat, first: seat, initialDone: players.length, players,
    routes: g.routes.map(r => ({ ...r })), face: [...g.face], deck: unseen.splice(0, g.deckCount),
    discard: unseen.splice(0, g.discardCount), shortDeck: shuffled(ticketPool.filter(t => !t.long), random).slice(0, g.ticketDeckCount),
    drawCount: 0, finalRemaining: g.finalRemaining, lastTrigger: null, pending: null, logs: [], result: null,
    turnSerial: g.turnSerial || 1, turnSeat: seat, turnClockPhase: "play", turnWaiting: false, turnDeadline: 60000 };
}
function settleTunnel(game, seat) {
  const t = game.pending, counts = P.afterPayment(P.countCards(game.players[seat].hand), t.base);
  const hand = Object.entries(counts).flatMap(([c, n]) => Array(Math.max(0, n)).fill(c));
  const payment = E.pay(hand, t.color, t.surcharge);
  return payment ? { type: "pay_tunnel", extraWild: payment.wild } : { type: "decline_tunnel" };
}

// Cheap rollout policy, distinct from the root planner: no recursive search.
function rolloutAction(game, seat, random, rootSeat = seat) {
  const p = game.players[seat];
  if (p.offer && game.phase !== "tunnel") {
    const g = P.observe(game, seat), values = T.estimateTickets(g, seat, p.offer.tickets, game.phase === "closing" ? 0 : P.horizon(g, seat));
    let indexes = values.flatMap((v, i) => v.value > 0 ? [i] : []);
    if (!indexes.length) indexes = [values.reduce((best, v, i) => v.value > values[best].value ? i : best, 0)];
    return { type: "keep_tickets", offerId: p.offer.id, indexes };
  }
  if (game.phase === "tunnel") return settleTunnel(game, seat);
  const g = P.observe(game, seat), counts = P.countCards(p.hand), outcome = P.ticketOutcome(g, seat);
  const available = P.availableRoutes(g, seat), benefits = new Map();
  const colors = new Map(available.map(r => [r.id, r.color === "gray"
    ? E.COLORS.reduce((a, b) => counts[a] >= counts[b] ? a : b) : r.color]));
  const graph = P.graphFor(P.planningConnections(g, seat), available, r => 1 + P.missing(r, colors.get(r.id), counts) * .7);
  for (const t of p.tickets.filter((_, i) => !outcome.tickets[i]).slice(0, 8)) {
    const path = P.pathBetween(graph, t.a, t.b)?.filter(r => r.owner === null);
    if (!path?.length || path.reduce((sum, r) => sum + r.n, 0) > p.trains) continue;
    for (const r of path) benefits.set(r.id, (benefits.get(r.id) || 0) + t.p * 2 / path.length);
  }
  const candidates = available.map(r => {
    const color = colors.get(r.id), need = P.missing(r, color, counts);
    const payment = E.pay(p.hand, color, r.n, r.ferry || 0);
    const value = (P.points(r) + (benefits.get(r.id) || 0) + 2) / (1 + need * .7);
    return { r, color, payment, value };
  }).sort((a, b) => b.value - a.value);
  if (!game.drawCount) {
    const station = seat === rootSeat && p.stations && p.tickets.some((_, i) => !outcome.tickets[i]) ? T.stationCandidates(g, seat, null, false)[0] : null;
    if (station?.immediate > (candidates[0]?.value || 0)) return station.action;
    const target = candidates[0];
    const affordable = candidates.filter(c => c.payment);
    const choice = game.finalRemaining != null
      ? affordable.sort((a, b) => (P.points(b.r) + (benefits.get(b.r.id) || 0)) - (P.points(a.r) + (benefits.get(a.r.id) || 0)))[0]
      : target?.payment ? target : affordable.find(c => !benefits.size || benefits.has(c.r.id));
    if (choice) return { type: "claim", routeId: choice.r.id, color: choice.payment.color, wildCount: choice.payment.wild };
  }
  const target = candidates[0], sources = [];
  if (game.deck.length || game.discard.length) sources.push({ index: -1, value: 2 });
  game.face.forEach((color, index) => {
    if (game.drawCount && color === "wild") return;
    let value = .5;
    if (target && P.missing(target.r, target.color, { ...counts, [color]: counts[color] + 1 }) < P.missing(target.r, target.color, counts))
      value = color === "wild" ? 5 : 10;
    sources.push({ index, value });
  });
  sources.sort((a, b) => b.value - a.value);
  if (sources.length) return { type: "draw_train", index: sources[random(sources.filter(s => s.value === sources[0].value).length)].index };
  return null;
}

function utility(game, seat) {
  if (game.phase === "finished") {
    const own = game.result.find(r => r.seat === seat);
    return own.score - Math.max(...game.result.filter(r => r.seat !== seat).map(r => r.score)) * .3;
  }
  const g = P.observe(game, seat), p = g.players[seat], outcome = P.ticketOutcome(g, seat), counts = P.countCards(p.hand);
  const available = P.availableRoutes(g, seat), turns = g.finalRemaining != null ? 0 : P.horizon(g, seat);
  const graph = P.graphFor(P.planningConnections(g, seat), available, r => {
    const color = r.color === "gray" ? E.COLORS.reduce((a, b) => counts[a] >= counts[b] ? a : b) : r.color;
    return 1 + P.missing(r, color, counts) * .85;
  });
  const paths = p.tickets.flatMap((t, i) => {
    if (outcome.tickets[i]) return [];
    const path = P.pathBetween(graph, t.a, t.b)?.filter(r => r.owner === null);
    return path?.length ? [{ t, path }] : [];
  });
  const union = [...new Map(paths.flatMap(x => x.path).map(r => [r.id, r])).values()];
  const joint = P.allocation(union, counts, g.face);
  const jointFactor = union.reduce((sum, r) => sum + r.n, 0) > p.trains ? .35 : Math.min(1, turns / Math.max(1, joint.turns));
  const eventual = P.ticketOutcome(g, seat, { routes: union });
  const potential = Math.min(Math.max(0, eventual.score - outcome.score), paths.reduce((sum, { t, path }) => {
    if (!eventual.tickets[p.tickets.indexOf(t)]) return sum;
    const need = P.allocation(path, counts, g.face).turns;
    const probability = path.length <= turns ? Math.min(1, turns / (need + 1)) ** 2 * .88 ** path.length * Math.exp(-need * .08) : 0;
    return sum + t.p * 2 * probability * jointFactor;
  }, 0));
  const ownLength = P.trailLength(g.routes, seat, 1200);
  let express = ownLength * .12;
  if (turns <= 5) express = ownLength >= Math.max(...g.players.map((_, i) => i === seat ? 0 : P.trailLength(g.routes, i, 1200))) ? 10 : 0;
  const opposition = Math.max(...g.players.filter((_, i) => i !== seat).map(p => p.score + p.stations * 4));
  return p.score + p.stations * 4 + outcome.score + potential + p.hand.length * .5 + express - opposition * .3;
}

function chooseLookahead(g, seat, actions, memory, random) {
  const unique = [...new Map(actions.filter(Boolean).map(a => [JSON.stringify(a), a])).values()].slice(0, LIMITS.candidates);
  if (unique.length < 2 || g.drawCount || g.finalRemaining != null) return { action: unique[0], branches: 0, nodes: 0 };
  const seeds = Array.from({ length: LIMITS.samples }, () => random(0x100000000));
  const results = []; let nodes = 0;
  for (const action of unique) {
    const values = [];
    for (const seed of seeds) {
      const rng = randomStream(seed), world = sampleWorld(g, seat, memory.known, rng, memory.retired);
      let turns = 0, steps = 0, time = 0, first = true;
      while (world.phase !== "finished" && turns < LIMITS.ownTurns && steps++ < LIMITS.actionsPerBranch) {
        if (E.tunnelBusy(world)) {
          const actor = world.current, serial = world.turnSerial;
          time = Math.max(time, world.pending.until); E.expire(world, time, rng);
          if (actor === seat && world.turnSerial !== serial) turns++;
          nodes++; continue;
        }
        const offering = world.phase === "tunnel" ? -1 : world.players.findIndex(p => p.offer);
        const actor = offering >= 0 ? offering : world.current;
        const selected = first ? action : rolloutAction(world, actor, rng, seat);
        first = false;
        const serial = world.turnSerial;
        if (selected) E.action(world, actor, selected, { now: ++time, random: rng }); else E.next(world, ++time);
        nodes++;
        if (actor === seat && world.turnSerial !== serial) turns++;
      }
      values.push(utility(world, seat));
    }
    // Compare paired worlds. A noisy speculative gain should not displace a
    // sound plan; require an improvement after a disagreement penalty.
    const deltas = values.map((value, i) => value - (results[0]?.values[i] ?? value));
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const spread = Math.sqrt(deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / deltas.length);
    results.push({ action, values, value: action === unique[0] ? 0 : mean - 1.5 - spread * .5 });
  }
  results.sort((a, b) => b.value - a.value);
  return { action: results[0].action, branches: unique.length * seeds.length, nodes, results };
}
module.exports = { chooseLookahead, sampleWorld, rolloutAction, utility, randomStream, LIMITS };
