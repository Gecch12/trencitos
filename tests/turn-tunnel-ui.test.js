"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const UI = require("../game-ui");
const E = require("../engine");
const { tunnelRoom } = require("./helpers/tunnel-preview");

test("turn banner distinguishes playing, second draw, tunnels, initial selection and waiting", () => {
  const g = { current: 0, phase: "play", drawCount: 0, players: [{ name: "A" }, { name: "B" }], initialReadyCount: 1 };
  assert.equal(UI.turnPresentation(g, 0).title, "TU TURNO");
  assert.equal(UI.turnPresentation(g, 0).hint, "Elige una acción");
  g.drawCount = 1;
  assert.equal(UI.turnPresentation(g, 0).hint, "Roba una carta más");
  assert.equal(UI.needsSecondDraw(g, 0, "map"), true);
  assert.equal(UI.needsSecondDraw(g, 0, "cards"), false);
  assert.equal(UI.needsSecondDraw(g, 1, "map"), false);
  assert.equal(UI.needsSecondDraw(g, 0, "map", false), false);
  assert.equal(UI.turnPresentation(g, 0, false).mine, false);
  g.phase = "tunnel";
  assert.equal(UI.turnPresentation(g, 0).hint, "Resuelve el túnel");
  assert.equal(UI.needsSecondDraw(g, 0, "map"), false);
  g.turnWaiting = true;
  assert.equal(UI.turnPresentation(g, 0).clock, "waiting");
  assert.equal(UI.turnPresentation(g, 0).mine, false);
  g.phase = "initial"; g.initial = [{ id: 1 }];
  assert.equal(UI.turnPresentation(g, 0).title, "ELIGE TUS DESTINOS");
  assert.equal(UI.turnPresentation(g, 0).clock, "initial");
  g.initial = null;
  assert.equal(UI.turnPresentation(g, 0).title, "ESPERANDO AL RESTO");
  g.phase = "finished";
  assert.equal(UI.turnPresentation(g, 0).clock, null);
});

test("pinch translates the midpoint while scaling and remains anchored at both zoom limits", () => {
  const start = { zoom: 1, distance: 100, scale: 2, center: { x: 500, y: 400 }, midpoint: { x: 20, y: -30 } };
  for (const distance of [1, 100, 200, 10000]) {
    const midpoint = { x: 70, y: -10 }, next = UI.pinchTransform(start, distance, midpoint);
    const scale = start.scale * start.zoom / next.zoom;
    assert.equal(next.center.x + midpoint.x * scale, start.center.x + start.midpoint.x * start.scale);
    assert.equal(next.center.y + midpoint.y * scale, start.center.y + start.midpoint.y * start.scale);
    assert.ok(next.zoom >= .25 && next.zoom <= 6);
  }
});

test("labels grow only beyond 2.5x and are capped at 24 screen pixels", () => {
  for (const zoom of [.25, 1, 2, 2.5]) assert.equal(UI.cityLabelScale(zoom), 1);
  assert.ok(UI.cityLabelScale(3) > 1);
  assert.ok(UI.cityLabelScale(4) > UI.cityLabelScale(3));
  assert.equal(15 * UI.cityLabelScale(6), 24);
  assert.deepEqual(UI.ROUTE_POINTS, E.SCORE);
});

for (const [kind, cards, surcharge] of [
  ["color", ["white", "black", "wild"], 2], ["zero", ["red", "black", "blue"], 0],
  ["wild", ["red", "black", "wild"], 1], ["short", ["white", "black"], 1],
]) test(`tunnel ${kind} emits exact evidence once, privately, without extending the deadline`, () => {
  const g = tunnelRoom("QATEST", kind, true).game;
  E.ensureTiming(g);
  const deadline = g.turnDeadline;
  const route = g.routes.find(r => r.tunnel && r.color === "gray" && r.n === 2);
  E.action(g, 0, { type: "claim", routeId: route.id, color: kind === "wild" ? "wild" : "white", wildCount: kind === "wild" ? 2 : 0 });
  const event = g.events.find(e => e.type === "tunnel_reveal");
  assert.deepEqual(event.revealed, cards);
  assert.equal(event.surcharge, surcharge);
  assert.equal(E.view(g, 0).events.filter(e => e.type === "tunnel_reveal").length, 1);
  assert.equal(E.view(g, 1).events.some(e => e.type === "tunnel_reveal"), false);
  assert.deepEqual(E.view(JSON.parse(JSON.stringify(g)), 0).events.find(e => e.type === "tunnel_reveal"), event);
  if (surcharge) {
    assert.equal(g.turnDeadline, deadline);
    assert.equal(g.pending.revealId, event.id);
    assert.equal(route.owner, null);
    const before = JSON.stringify(g.events);
    assert.throws(() => E.action(g, 0, { type: "claim", routeId: route.id, color: "white", wildCount: 0 }));
    assert.equal(JSON.stringify(g.events), before);
  } else {
    assert.equal(g.current, 1);
    assert.equal(route.owner, 0);
    assert.equal(g.phase, "play");
    assert.ok(g.events.find(e => e.type === "build").id > event.id);
  }
  assert.equal(g.deck.length + g.discard.length + g.face.length + g.players.reduce((n, p) => n + p.hand.length, 0) + (g.pending?.revealed?.length || 0), 110);
});

test("reconnect snapshots never replay stored tunnel evidence, while fresh events are consumed once", () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const context = vm.createContext({ lastEffectId: null, waitingForGameStart: false, document: { hidden: false } });
  vm.runInContext(source.slice(source.indexOf("function prepareEffects("), source.indexOf("function playEffects(")), context);
  const next = { events: [{ id: 4, type: "tunnel_reveal", seat: 0, revealed: ["red"] }] };
  assert.equal(context.prepareEffects(next).length, 0);
  next.events.push({ id: 5, type: "tunnel_reveal", seat: 0, revealed: ["blue"] });
  assert.equal(context.prepareEffects(next).length, 1);
  assert.equal(context.prepareEffects(next).length, 0);
  context.document.hidden = true;
  next.events.push({ id: 6, type: "tunnel_reveal", seat: 0, revealed: ["green"] });
  assert.equal(context.prepareEffects(next).length, 0);
  context.document.hidden = false;
  assert.equal(context.prepareEffects(next).length, 0);
});

function revealHarness(surcharge = 0, reduced = false) {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const noop = () => {}, timers = new Map(), sounds = [], builds = [];
  let serial = 0, renders = 0;
  const node = () => ({ dataset: {}, classList: { add: noop, remove: noop, toggle: noop }, replaceChildren: noop, append: noop, animate: noop });
  const nodes = Object.fromEntries(["board", "dialog", "dialogTitle", "tunnelSequence", "tunnelRevealStatus", "skipTunnelReveal"].map(id => [id, node()]));
  const slots = Array.from({ length: 3 }, node);
  nodes.board.querySelectorAll = () => [];
  nodes.tunnelSequence.querySelector = selector => slots[+selector.match(/\d+/)[0]];
  const event = { id: 10, type: "tunnel_reveal", seat: 0, routeId: 19, paymentColor: "white", surcharge, revealed: surcharge ? ["white", "black", "wild"] : ["red", "black", "blue"] };
  const build = { id: 11, type: "build", seat: 0, routeId: 19 };
  const game = { phase: surcharge ? "tunnel" : "play", current: surcharge ? 0 : 1, turnDeadline: Date.now() + 60000, routes: [{ id: 19 }], tunnel: surcharge ? { revealId: 10 } : null };
  const context = vm.createContext({
    tunnelReveal: null, game, seat: 0, serverOffset: 0, uiDialog: "build", buildTarget: {},
    reducedMotion: { matches: reduced }, document: { hidden: false, createElement: node },
    $: id => nodes[id], N: { white: "Blanco", wild: "Locomotora" }, escapeHTML: x => x,
    routeName: () => "Pamplona — Barcelona", dialogClockHTML: () => "", colorCard: () => node(),
    constructionTarget: node, playSound: kind => sounds.push(kind), animateConstruction: e => builds.push(e),
    renderDialog: () => { renders++; }, showDialog: () => { nodes.dialog.dataset = {}; },
    setTimeout: (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source.slice(source.indexOf("function prepareTunnelReveal("), source.indexOf("function showTunnelDialog(")), context);
  context.prepareTunnelReveal(surcharge ? [event] : [event, build]);
  context.showTunnelReveal();
  return { context, timers, sounds, builds, nodes, build, renders: () => renders, next() {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id); timer.fn(); return timer.ms;
  } };
}

test("tunnel cards reveal at 700ms intervals, then zero surcharge releases exactly one build effect", () => {
  const h = revealHarness();
  assert.equal(h.build.deferredForTunnel, true);
  for (const count of [1, 2, 3]) {
    assert.equal(h.next(), 700);
    assert.equal(h.context.tunnelReveal.shown, count);
    assert.equal(h.sounds.length, count);
    assert.equal(h.builds.length, 0);
  }
  h.next();
  assert.equal(h.nodes.dialogTitle.textContent, "Túnel construido");
  h.next();
  assert.equal(h.context.tunnelReveal, null);
  assert.equal(h.builds.length, 1);
  assert.equal(h.renders(), 1);
  h.context.finishTunnelReveal(true);
  assert.equal(h.builds.length, 1);
});

test("skip, reduced motion, cancellation and a returning turn clean timers without spending or rerolling", () => {
  const skip = revealHarness(2);
  const deadline = skip.context.game.turnDeadline;
  skip.context.finishTunnelReveal(true);
  assert.equal(skip.timers.size, 0);
  assert.equal(skip.context.game.turnDeadline, deadline);
  assert.equal(skip.renders(), 1);
  assert.equal(skip.builds.length, 0);
  const reduced = revealHarness(2, true);
  assert.equal(reduced.next(), 0);
  assert.equal(reduced.sounds.length, 0);
  assert.equal(reduced.context.tunnelReveal, null);
  const expired = revealHarness(2);
  expired.context.game.tunnel = null;
  expired.context.prepareTunnelReveal([]);
  assert.equal(expired.timers.size, 0);
  assert.equal(expired.context.tunnelReveal, null);
  const nextTurn = revealHarness();
  nextTurn.context.game.current = 0;
  nextTurn.context.prepareTunnelReveal([]);
  assert.equal(nextTurn.context.tunnelReveal, null);
  assert.equal(nextTurn.timers.size, 0);
  assert.equal(nextTurn.builds.length, 1);
});
