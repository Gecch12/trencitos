// Frozen first-stage policy (2026-10-31); benchmark only.
"use strict";
const E = require("../../engine");
const P = require("./practice-planner-stage1");

// Disposable, private memory. No plan or inferred rival cards enter saves/views.
const memories = new WeakMap();
function choose(items, random, quality = .92) {
  if (!items.length) return null;
  const best = Math.max(...items.map(x => x.value));
  const pool = items.filter(x => x.value >= best - Math.max(.05, Math.abs(best) * (1 - quality)));
  return pool[random(pool.length)];
}
function memoryFor(game, seat) {
  if (!memories.has(game)) memories.set(game, new Map());
  const seats = memories.get(game);
  if (!seats.has(seat)) seats.set(seat, { eventId: 0, known: {}, target: null, network: [], colors: new Map() });
  return seats.get(seat);
}
function initialChoice(g, seat, random, fallback) {
  const pending = g.players[seat].pending, counts = P.countCards(g.players[seat].hand), choices = [];
  for (let a = 0; a < pending.length; a++) for (let b = a + 1; b < pending.length; b++) {
    const context = P.networks(g, seat, [pending[a], pending[b]], counts, 40);
    const plans = context.options.filter(p => p.completed.length === 2);
    if (plans.length) choices.push({ indexes: [a, b], value: Math.max(...plans.map(p => p.value)) });
  }
  const selected = choose(choices, random);
  return selected ? { type: "choose_initial", indexes: selected.indexes } : fallback();
}
function analyze(g, seat, memory) {
  const counts = P.countCards(g.players[seat].hand), turns = P.horizon(g, seat);
  const context = P.networks(g, seat, g.players[seat].tickets, counts, turns, memory.colors);
  let plan = context.options.filter(p => p.probability >= .35).sort((a, b) => b.value - a.value)[0] || null;
  if (plan && memory.network.length) {
    const previous = memory.network.map(id => context.available.find(r => r.id === id)).filter(Boolean);
    const valid = memory.network.every(id => g.routes.some(r => r.id === id && r.owner === seat) || context.available.some(r => r.id === id));
    const retained = valid && context.evaluate(previous);
    if (retained?.gain > 0 && retained.probability >= .35 && retained.value >= plan.value * .92) plan = retained;
  }
  return { counts, turns, context, plan };
}
function tunnelAction(g, seat, memory, fallback) {
  const { color, surcharge, base, routeId } = g.tunnel;
  const counts = P.countCards(g.players[seat].hand), reserved = P.afterPayment(counts, base);
  const remaining = Object.entries(reserved).flatMap(([c, n]) => Array(Math.max(0, n)).fill(c));
  const extra = E.pay(remaining, color, surcharge);
  if (!extra) return { type: "decline_tunnel" };
  const route = g.routes.find(r => r.id === routeId);
  if (!route) return fallback();
  const a = analyze(g, seat, memory);
  const completion = a.context.pending.some(t => E.connected([...a.context.owned, route], t.a, t.b));
  const rest = (a.plan?.routes || []).filter(r => r.id !== routeId);
  const before = P.allocation(rest, reserved, g.face).turns;
  const after = P.allocation(rest, P.afterPayment(reserved, extra), g.face).turns;
  // Paying is normally worthwhile after committing the turn. Decline only when
  // the revealed surcharge destroys a substantially more valuable plan.
  const benefit = P.points(route) + (a.plan?.routes.some(r => r.id === routeId) ? a.plan.gain / a.plan.routes.length : 0);
  if (!completion && g.finalRemaining == null && rest.length && after - before > 1 && benefit < (after - before) * 5)
    return { type: "decline_tunnel" };
  return { type: "pay_tunnel", extraWild: extra.wild };
}
function drawAction(g, candidates, target, plan, counts, random) {
  const sources = [];
  if (g.deckCount || g.discardCount) sources.push({ index: -1, value: 2 });
  const resources = plan && P.allocation(plan.routes, counts, g.face, plan.resources.colors);
  g.face.forEach((color, index) => {
    if (g.drawCount && color === "wild") return;
    const after = { ...counts, [color]: counts[color] + 1 };
    let value = .5;
    for (const c of candidates) {
      const primary = c.route.id === target?.route.id;
      if (P.missing(c.route, c.color, after) < P.missing(c.route, c.color, counts)) {
        const mandatory = color === "wild" && (c.route.ferry || 0) > counts.wild;
        value = Math.max(value, (primary ? 12 : c.inPlan ? 7 : 3) * (color === "wild" && !mandatory ? .5 : 1));
      }
      if (primary && c.reserve && (color === c.payment.color || color === "wild")) value = Math.max(value, color === "wild" ? 6 : 12);
    }
    if (resources) {
      const improvement = resources.turns - P.allocation(plan.routes, after, g.face, resources.colors).turns;
      value += Math.max(0, improvement) * (color === "wild" ? 1 : 2);
    }
    sources.push({ index, value });
  });
  const selected = choose(sources, random, .96);
  return selected ? { type: "draw_train", index: selected.index } : null;
}
const claim = c => ({ type: "claim", routeId: c.route.id, color: c.payment.color, wildCount: c.payment.wild });

function choosePracticeAction(game, seat, random, fallback) {
  if (!game.players[seat] || ["finished", "closing"].includes(game.phase)) return null;
  if (game.phase !== "initial" && (game.current !== seat || game.turnWaiting)) return null;
  const g = P.observe(game, seat), memory = memoryFor(game, seat);
  P.rememberPublic(g, memory);
  const simple = () => fallback(game, seat, random);
  if (g.phase === "initial") return initialChoice(g, seat, random, simple);
  if (g.phase === "tunnel") return tunnelAction(g, seat, memory, simple);
  if (g.phase !== "play") return simple();
  const { counts, turns, context, plan } = analyze(g, seat, memory);
  if (!context.available.length) return simple();
  const player = g.players[seat], canDraw = g.deckCount || g.discardCount || g.face.length;
  const candidates = context.available.map(route => {
    const inPlan = !!plan?.routes.some(r => r.id === route.id);
    const rest = (plan?.routes || []).filter(r => r.id !== route.id);
    const payment = P.paymentFor(route, player.hand, rest, g.face, memory.colors);
    const color = plan?.resources.colors.get(route.id) || (route.color === "gray"
      ? memory.target?.routeId === route.id ? memory.target.color : E.COLORS.reduce((a, b) => counts[a] >= counts[b] ? a : b) : route.color);
    const need = P.missing(route, color, counts);
    const completion = context.pending.filter(t => E.connected([...context.owned, route], t.a, t.b)).reduce((s, t) => s + t.p * 2, 0);
    const urgent = P.urgency(g, seat, route, plan, context, memory.known);
    const success = P.tunnelSuccess(g, seat, route, payment);
    const benefit = inPlan ? 6 + plan.gain / plan.routes.length : 0;
    const attached = context.owned.some(r => [r.a, r.b].some(city => city === route.a || city === route.b));
    let value = (3 + P.points(route) * 1.1 + benefit + completion + urgent + (attached ? 2 : 0)) / (1 + need * .7);
    if (payment) value *= .5 + success * .5;
    return { route, payment, color, need, completion, urgent, success, inPlan, value,
      reserve: !!payment && success < .75 && turns > 2 && urgent < 10 };
  });
  const affordable = candidates.filter(c => c.payment);
  // Only near the finish: bounded public-network estimates of the Express.
  if (turns <= 6 && affordable.length) {
    const lengths = g.players.map((_, i) => P.trailLength(g.routes, i));
    const rival = Math.max(...lengths.filter((_, i) => i !== seat));
    const before = lengths[seat] >= rival ? 10 : 0;
    for (const c of affordable) {
      const length = P.trailLength(g.routes.map(r => r.id === c.route.id ? { ...r, owner: seat } : r), seat);
      c.express = (length >= rival ? 10 : 0) - before;
    }
  }
  const finishValue = c => (P.points(c.route) + c.completion + (c.express || 0)) * c.success;
  if (g.finalRemaining != null && affordable.length && !g.drawCount)
    return claim(choose(affordable.map(c => ({ ...c, value: finishValue(c) })), random, 1));

  if (memory.target && memory.target.serial !== g.turnSerial) { memory.target.age++; memory.target.serial = g.turnSerial; }
  const pool = plan ? candidates.filter(c => c.inPlan) : candidates;
  let target = pool.find(c => c.route.id === memory.target?.routeId);
  const best = choose(pool, random);
  if (!target || (memory.target.age >= 4 && !target.payment && target.need > 1)
    || best.urgent > target.urgent + 8 || best.value > target.value * 1.6) target = best;
  if (target.route.id !== memory.target?.routeId)
    memory.target = { routeId: target.route.id, color: target.color, age: 0, serial: g.turnSerial };
  memory.network = (plan?.routes || []).map(r => r.id);
  memory.colors = plan?.resources.colors || new Map([[target.route.id, target.color]]);
  if (g.drawCount) return drawAction(g, candidates, target, plan, counts, random);

  // Ending the game forfeits the remainder of a feasible destination network.
  const closingLoss = c => player.trains - c.route.n <= 2 && plan && plan.routes.length > 1
    ? Math.max(0, plan.gain - c.completion) * plan.probability : 0;
  const completing = affordable.filter(c => c.completion && (!c.reserve || !canDraw));
  if (completing.length) return claim(choose(completing.map(c => ({ ...c, value: finishValue(c) + c.urgent - closingLoss(c) })), random, 1));
  if (turns <= 3 && affordable.length && (!plan || plan.resources.turns > turns))
    return claim(choose(affordable.map(c => ({ ...c, value: finishValue(c) })), random, 1));
  if (target.payment && (!target.reserve || !canDraw) && closingLoss(target) < target.value
    && (plan || !canDraw || turns <= 6 || player.hand.length >= 16 || random(100) < 92)) return claim(target);

  const opportunities = affordable.filter(c => {
    if (c.route.id === target.route.id || c.reserve || closingLoss(c) > P.points(c.route)) return false;
    if (plan && !c.inPlan && turns > 6 && player.hand.length < 16) return false;
    const rest = (plan?.routes || [target.route]).filter(r => r.id !== c.route.id);
    const before = P.allocation(rest, counts, g.face, memory.colors).turns;
    const after = P.allocation(rest, P.afterPayment(counts, c.payment), g.face, memory.colors).turns;
    return after <= before + .01;
  });
  if (opportunities.length && (plan || turns <= 6 || random(100) < 22)) return claim(choose(opportunities, random));
  if (affordable.length && (!canDraw || player.hand.length >= 18)) return claim(choose(affordable, random));
  return drawAction(g, candidates, target, plan, counts, random);
}
module.exports = { choosePracticeAction };
