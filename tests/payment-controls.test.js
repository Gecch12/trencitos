"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const UI = require("../frontend/game-ui");
const E = require("../backend/engine");
const source = fs.readFileSync(require.resolve("../frontend/app.js"), "utf8");
const key = o => `${o.color}/${o.regular}/${o.wild}`;

test("65 legal payments become eight color choices without losing any combination", () => {
  const hand = E.COLORS.flatMap(c => Array(8).fill(c)).concat(Array(8).fill("wild"));
  const options = UI.payments(hand, 8), before = JSON.stringify(options), groups = UI.paymentGroups(options);
  assert.equal(options.length, 65);
  assert.equal(groups.length, 8);
  assert.deepEqual(new Set(groups.flatMap(g => g.options.map(key))), new Set(options.map(key)));
  for (const group of groups) {
    assert.equal(group.options.length, 9);
    assert.deepEqual(group.options.map(o => o.wild), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(group.options.at(-1).color, "wild");
  }
  assert.equal(JSON.stringify(options), before);
});

test("grouped payments obey stock, fixed colors and ferry minima, including all-wild hands", () => {
  assert.deepEqual(UI.paymentGroups([]), []);
  assert.deepEqual(UI.paymentGroups(UI.payments(["wild", "wild"], 2)), [{ color: "wild", options: [{ color: "wild", regular: 0, wild: 2 }] }]);
  for (const color of ["gray", "red"]) for (const cost of [1, 2, 3, 8]) for (const ferry of [0, 1, 2]) {
    for (const red of [0, 1, 3, 8]) for (const wild of [0, 1, 3, 8]) {
      const hand = [...Array(red).fill("red"), "blue", "blue", ...Array(wild).fill("wild")];
      const options = UI.payments(hand, cost, color, ferry), groups = UI.paymentGroups(options);
      assert.deepEqual(new Set(groups.flatMap(g => g.options.map(key))), new Set(options.map(key)));
      for (const group of groups) for (const option of group.options) {
        assert.ok(E.pay(hand, option.color, cost, ferry, option.wild));
        assert.ok(option.wild >= ferry);
        assert.ok(option.wild <= wild);
        assert.equal(option.wild + option.regular, cost);
        assert.ok(option.color === group.color || option.color === "wild");
      }
    }
  }
});

function dialog(hand, route = { id: 0, a: "PAR", b: "BRU", color: "gray", n: 2, ferry: 0, owner: null }) {
  const nodes = {}, sent = [], messages = [];
  const game = { current: 0, phase: "play", drawCount: 0, hand, routes: [route], players: [{ trains: 45, stations: 3, placed: [] }] };
  const node = () => ({ textContent: "", disabled: false, dataset: {}, setAttribute() {}, animate() {}, children: [], style: { setProperty() {} }, classList: { add() {} }, replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); } });
  let html, inputs = [];
  const context = vm.createContext({ I18n: require("../shared/i18n"),
    gameRules: require("../frontend/match-presentation").legacyRules, game, seat: 0, buildTarget: { routeId: 0 }, GameUI: UI, buildSubmitting: false, reducedMotion: {matches: false},
    N: Object.fromEntries([...E.COLORS, "wild"].map(c => [c, c])), C: UI.ROUTE_COLORS,
    $: id => nodes[id], escapeHTML: s => s, routeName: r => `${r.a} — ${r.b}`, cityName: s => s,
    plural: (n, word) => `${n} ${word}`, dialogClockHTML: () => "", updateClocks() {}, closeOptionalDialog() {},
    colorCard: (color, count) => ({ color, count }), paymentDescription: p => key(p),
    document: { querySelectorAll: () => inputs, createElement: () => node() },
    WebSocket: { OPEN: 1 }, sock: { readyState: 1 }, act: (type, data) => sent.push({ type, ...data }), toast: message => messages.push(message), error: message => messages.push(message),
    showDialog(title, body) {
      html = body;
      for (const match of body.matchAll(/id="([^"]+)"/g)) nodes[match[1]] = node();
      nodes.dialog = { ...node(), querySelector: () => node() };
      inputs = [...body.matchAll(/name="buildColor" value="([^"]+)"/g)].map(m => ({ value: m[1] }));
    },
  });
  vm.runInContext(source.slice(source.indexOf("function showBuildDialog("), source.indexOf("function dialogClockHTML(")), context);
  context.showBuildDialog();
  return { nodes, game, context, sent, messages, html: () => html, inputs: () => inputs };
}

test("actual dialog stepper reaches all-wild once, reverses safely and submits the previewed payment", () => {
  const d = dialog(["red", "red", "blue", "wild", "wild"]);
  assert.equal(d.inputs().length, 2);
  assert.doesNotMatch(d.html(), /buildPayment|build-options|<select/);
  assert.equal(d.nodes.wildCount.textContent, 0);
  assert.equal(d.nodes.wildLess.disabled, true);
  d.nodes.wildMore.onclick();
  assert.equal(d.nodes.wildCount.textContent, 1);
  d.nodes.wildMore.onclick();
  assert.equal(d.nodes.wildCount.textContent, 2);
  assert.equal(d.nodes.wildMore.disabled, true);
  d.nodes.wildMore.onclick(); // Programmatic overshoot is bounded as well.
  assert.equal(d.nodes.wildCount.textContent, 2);
  d.nodes.wildLess.onclick();
  assert.equal(d.nodes.wildCount.textContent, 1);
  d.nodes.wildMore.onclick();
  d.nodes.confirmBuild.onclick(); d.nodes.confirmBuild.onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(d.sent)), [{ type: "claim", routeId: 0, color: "wild", wildCount: 2 }]);
});

test("changing color resets to its minimum valid wildcards and ferry bounds cannot be bypassed", () => {
  const route = { id: 0, a: "PAR", b: "BRU", color: "gray", n: 3, ferry: 1, owner: null };
  const d = dialog(["red", "red", "blue", "wild", "wild", "wild"], route);
  assert.equal(d.nodes.wildCount.textContent, 1);
  d.nodes.wildLess.onclick();
  assert.equal(d.nodes.wildCount.textContent, 1);
  d.nodes.wildMore.onclick(); d.nodes.wildMore.onclick();
  d.inputs().find(i => i.value === "blue").onchange();
  assert.equal(d.nodes.wildCount.textContent, 2);
  assert.equal(d.nodes.wildLess.disabled, true);
  d.nodes.confirmBuild.onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(d.sent)), [{ type: "claim", routeId: 0, color: "blue", wildCount: 2 }]);
});

test("fixed-color routes avoid redundant color questions; single payments avoid all extra controls", () => {
  const route = { id: 0, a: "PAR", b: "BRU", color: "red", n: 2, ferry: 0, owner: null };
  const d = dialog(["red", "red", "blue", "blue", "wild"], route);
  assert.equal(d.inputs().length, 0);
  assert.equal(d.nodes.wildCount.textContent, 0);
  d.nodes.wildMore.onclick();
  assert.equal(d.nodes.wildMore.disabled, true);
  const allWild = dialog(["wild", "wild"], route);
  assert.doesNotMatch(allWild.html(), /change-payment|wild-stepper/);
  allWild.nodes.confirmBuild.onclick();
  assert.equal(allWild.sent[0].color, "wild");
});

test("confirmation revalidates hand and turn instead of submitting stale payment controls", () => {
  const d = dialog(["red", "red", "wild"]);
  d.game.hand = [];
  d.nodes.confirmBuild.onclick();
  assert.equal(d.sent.length, 0);
  assert.match(d.messages[0], /cartas suficientes/);
  d.game.current = 1;
  d.nodes.confirmBuild.onclick();
  assert.equal(d.sent.length, 0);
  assert.match(d.messages[1], /turno/);
});
test("friendly tunnel shortfall counts only matching cards left after the base payment", () => {
  const t={color:"red",base:{color:"red",regular:2,wild:1},surcharge:3};
  assert.equal(UI.tunnelShortfall(["red","red","wild","blue","blue"],t),3);
  assert.equal(UI.tunnelShortfall(["red","red","red","wild","wild"],t),1);
  assert.equal(UI.tunnelShortfall(["red","red","red","red","wild","wild"],t),0);
  assert.equal(UI.tunnelShortfall(["wild","wild","wild","red","red"],{color:"wild",base:{color:"wild",regular:0,wild:2},surcharge:2}),1);
});
