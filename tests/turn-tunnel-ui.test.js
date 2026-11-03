"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const UI = require("../frontend/game-ui");
const E = require("../backend/engine");
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
]) test(`tunnel ${kind} shares committed cards and evidence but never the player's remaining hand`, () => {
  const g = tunnelRoom("QATEST", kind, true).game;
  const now = Date.now(), remaining = g.turnDeadline - now;
  const route = g.routes.find(r => r.tunnel && r.color === "gray" && r.n === 2);
  E.action(g, 0, { type: "claim", routeId: route.id, color: kind === "wild" ? "wild" : "white", wildCount: kind === "wild" ? 2 : 0 }, {now});
  assert.equal(g.turnDeadline, null);
  assert.equal(g.current, 0); assert.equal(route.owner, null);
  for (const seat of [-1, 0, 1, 2]) {
    const v = E.view(g, seat);
    assert.deepEqual(v.sharedTunnel.revealed, cards);
    assert.equal(v.sharedTunnel.surcharge, surcharge);
    assert.equal(v.sharedTunnel.stage, "reveal");
    assert.deepEqual(v.sharedTunnel.base, g.pending.base);
    if (seat !== 0) {
      assert.equal(v.tunnel, null);
      assert.deepEqual(v.events.find(e => e.type === "tunnel_reveal").base, g.pending.base);
    }
  }
  const end = g.pending.until;
  assert.equal(E.expire(g, end - 1), false);
  E.expire(g, end);
  assert.equal(g.current, 0);
  if (surcharge) {
    assert.equal(g.pending.stage, "decision");
    assert.equal(g.turnDeadline, end + remaining);
  } else {
    assert.equal(g.pending.stage, "result"); assert.equal(route.owner, 0);
    E.expire(g, g.pending.until);
    assert.equal(g.current, 1); assert.equal(g.turnDeadline, end + E.TUNNEL_RESULT_MS + E.TURN_MS);
  }
});

test("reconnect snapshots never replay stored tunnel evidence, while fresh events are consumed once", () => {
  const source = fs.readFileSync(require.resolve("../frontend/app.js"), "utf8");
  const context = vm.createContext({ I18n: require("../shared/i18n"), lastEffectId: null, waitingForGameStart: false, document: { hidden: false } });
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

function revealHarness(reduced = false) {
  const source = fs.readFileSync(require.resolve("../frontend/app.js"), "utf8");
  let time = 1000;
  const slots = Array.from({length: 3}, () => ({children: [], animations: 0, classList: {toggle() {}},
    replaceChildren(...children) { this.children = children; }, append(node) { this.children.push(node); }, animate() { this.animations++; return {cancel() {}}; }}));
  const nodes = { dialog: {dataset: {}, classList: {add() {}}, querySelector() {return null;}, querySelectorAll() {return [];}}, dialogTitle: {}, tunnelRevealStatus: {},
    tunnelSequence: { querySelector: selector => slots[+selector.match(/"(\d+)"/)[1]] } };
  const game = {players: [{name: "A"}, {name: "B"}], routes: [{id: 0,n:2}], sharedTunnel: {id: 7, seat: 0, routeId: 0, revealed: ["red", "blue", "wild"], paymentColor: "red", surcharge: 2, stage: "reveal", startedAt: 1000, until: 3800, cardMs: 700}};
  const context = vm.createContext({I18n: require('../shared/i18n'), GameUI:UI, gameRules:require("../frontend/match-presentation").legacyRules, game, seat: 1, tunnelReveal: null, uiDialog: null,
    reducedMotion: {matches: reduced}, Date: {now: () => time}, serverOffset: 0, replayAt: null,
    document: {hidden: false, createElement: () => ({})}, $: id => nodes[id], escapeHTML: String, routeName: () => "Paris — Bruxelles",
    colorCard: color => ({color}), playSound() {}, syncBoard3D() {}, showTunnelDialog() {throw Error('Rival cannot decide');},
    showDialog(title) {nodes.dialog.dataset = {}; nodes.dialogTitle.textContent = title;}
  });
  vm.runInContext(source.slice(source.indexOf("function prepareTunnelReveal("), source.indexOf("function showTunnelDialog(")), context);
  return {context, game, slots, nodes, at(value) {time = value; context.showSharedTunnel();}};
}
for (const reduced of [false, true]) test(`shared reveal follows server timestamps, including reconnect and reduced motion=${reduced}`, () => {
  const h = revealHarness(reduced);
  h.at(1000); assert.equal(h.context.tunnelReveal.shown, 0);
  h.at(1700); assert.equal(h.context.tunnelReveal.shown, 1);
  h.at(3100); assert.equal(h.context.tunnelReveal.shown, 3);
  assert.deepEqual(h.slots.map(s => s.children[0].color), ['red','blue','wild']);
  assert.deepEqual(h.slots.map(s => s.children[1].textContent), ['+1','—','+1']);
  if(reduced) assert.ok(h.slots.every(s => s.animations === 0));
  const sequence = h.context.tunnelReveal; h.at(5000);
  assert.equal(h.context.tunnelReveal, sequence); // No client timer closes the modal.
  h.context.cancelTunnelReveal(); h.at(5000);
  assert.equal(h.context.tunnelReveal.shown, 3); // A cancelled/disconnected surface can hydrate the same stage.
  h.game.sharedTunnel.stage = 'decision'; h.at(5001);
  assert.match(h.nodes.tunnelRevealStatus.textContent, /A está decidiendo/);
  h.game.sharedTunnel.stage = 'result'; h.game.sharedTunnel.outcome = 'declined'; h.at(6000);
  assert.equal(h.nodes.dialogTitle.textContent, 'Túnel no construido');
  h.game.sharedTunnel = null; h.context.prepareTunnelReveal(); assert.equal(h.context.tunnelReveal, null);
  const reconnect = revealHarness(reduced); reconnect.at(3100);
  assert.equal(reconnect.context.tunnelReveal.shown, 3);
});
