"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const UI = require("../frontend/game-ui"), E = require("../backend/engine");
const { resultsRoom } = require("./helpers/results-preview");
const app = fs.readFileSync(require.resolve("../frontend/app.js"), "utf8");
test("route map contains only the selected player's routes and exact point badges", () => {
  const g = resultsRoom().game, before = JSON.stringify(g);
  for (const r of g.result) {
    const m = UI.resultSelection(g, r.seat);
    assert.deepEqual(m.routes, g.routes.filter(t => t.owner === r.seat).map(t => t.id));
    assert.equal(m.badges.reduce((sum, b) => sum + b.points, 0), r.route);
    assert.ok(m.badges.every(b => b.points === E.SCORE[g.routes[b.routeId].n]));
    assert.equal(new Set(m.badges.map(b => b.routeId)).size, m.routes.length);
    assert.deepEqual(m.stationRoutes, []);
  }
  const selected = UI.resultSelection(g, 0, "routes", 3);
  assert.deepEqual(selected.highlighted, [g.result.find(r => r.seat === 0).details.routes[3].id]);
  assert.equal(JSON.stringify(g), before);
});
test("destination audit distinguishes completed, borrowed and incomplete paths", () => {
  const g = resultsRoom().game;
  const complete = UI.resultSelection(g, 0, "destinations", 0);
  assert.ok(complete.routes.length); assert.equal(complete.incomplete, false);
  assert.ok(complete.routes.every(id => g.routes[id].owner === 0));
  const station = UI.resultSelection(g, 0, "destinations", 1);
  assert.equal(station.routes.length, 1); assert.deepEqual(station.routes, station.stationRoutes);
  assert.equal(g.routes[station.routes[0]].owner, 2);
  assert.equal(station.stations[0].city, "ROM");
  const incomplete = UI.resultSelection(g, 0, "destinations", 2);
  assert.equal(incomplete.incomplete, true); assert.deepEqual(incomplete.routes, []);
  assert.deepEqual(incomplete.endpoints, ["LIS", "DAN"]);
});
test("stations only expose their assigned loan, not unrelated rival routes", () => {
  const g = resultsRoom().game, m = UI.resultSelection(g, 0, "stations");
  assert.equal(m.stations.length, 1); assert.equal(m.stations[0].city, "ROM");
  assert.equal(m.routes.length, 1); assert.deepEqual(m.routes, m.stationRoutes);
  assert.deepEqual(UI.resultSelection(g, 3, "stations").routes, []);
});
test("longest-route comparison uses each server trail, preserves ties and never mutates rank", () => {
  const g = resultsRoom().game, order = g.result.map(r => r.seat);
  const rows = UI.resultStandings(g);
  assert.ok(rows.every((r, i) => !i || rows[i - 1].longest >= r.longest));
  for (const r of rows) {
    const m = UI.resultSelection(g, 0, "express", null, r.seat);
    assert.equal(m.seat, r.seat); assert.deepEqual(m.routes, r.details.express.routes);
    assert.equal(m.routes.reduce((sum, id) => sum + g.routes[id].n, 0), r.longest);
    assert.ok(m.routes.every(id => g.routes[id].owner === r.seat));
  }
  assert.deepEqual(g.result.map(r => r.seat), order);
  const tied = { result: [{ seat: 2, longest: 8, express: 10 }, { seat: 0, longest: 8, express: 10 }] };
  assert.deepEqual(UI.resultStandings(tied).map(r => r.express), [10, 10]);
});
test("empty and legacy results are safe and do not invent routes or points", () => {
  const g = resultsRoom().game;
  for (const category of ["routes", "destinations", "stations", "express"]) {
    const m = UI.resultSelection(g, 3, category);
    assert.deepEqual(m.routes, []); assert.deepEqual(m.badges, []);
  }
  assert.equal(UI.resultSelection(null, 0), null);
  assert.equal(UI.resultSelection({ result: [{ seat: 0 }] }, 0), null);
});
function renderHarness() {
  const g = resultsRoom().game, result = g.result.find(r => r.seat === 0);
  const controls = { onclick: null, setAttribute() {} };
  const panel = { innerHTML: "", setAttribute() {}, querySelectorAll: () => [], querySelector: () => controls, classList: { toggle() {} } };
  const context = vm.createContext({ I18n: require("../shared/i18n"), game: g, members: [], resultViews: new Map(), expandedResults: new Set(), resultMapCleanup: null, GameUI: UI,
    $: () => panel, matchContext: {cityName: id => E.CITIES[id]?.[2] || id}, playerAvatar: () => '<span class="player-avatar"></span>',
    applyPlayerAppearance() {}, renderResultMap() {},
    escapeHTML: x => String(x).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;") });
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/shell-icons.js'),'utf8'),context);
  vm.runInContext(app.slice(app.indexOf("const cityName ="), app.indexOf("function showResults()")), context);
  return { g, result, panel, context };
}
test("station UI is minimal while routes keep an accessible list and an audit adjustment", () => {
  const { result, context, panel } = renderHarness();
  context.resultView(0).category = "stations"; context.renderResultPanel(result);
  assert.match(panel.innerHTML, /2 sin construir × 4/);
  assert.match(panel.innerHTML, /Estación en Roma/);
  assert.doesNotMatch(panel.innerHTML, /Las estaciones construidas|sumar puntos|<strong>0<\/strong>/);
  context.resultView(0).category = "routes"; result.details.routeAdjustment = 2;
  context.renderResultPanel(result);
  assert.match(panel.innerHTML, /Ver lista · 13 tramos/);
  assert.match(panel.innerHTML, /Ajuste de partida antigua: \+2/);
});
test("comparison UI renders everyone, marks bonuses and escapes player names", () => {
  const { g, result, context, panel } = renderHarness();
  g.result[0].name = '<img src=x onerror="bad">';
  context.resultView(0).category = "express"; context.renderResultPanel(result);
  assert.equal((panel.innerHTML.match(/data-express-seat=/g) || []).length, 4);
  assert.match(panel.innerHTML, /&lt;img/); assert.doesNotMatch(panel.innerHTML, /<img/);
  assert.match(panel.innerHTML, /Bonificación: 10 puntos/);
  assert.doesNotMatch(panel.innerHTML, /Se suman los vagones|Máximo de la partida/);
});
test("table category buttons expose controls and signed destination penalties", () => {
  const { result, context, panel } = renderHarness();
  const row = context.resultRowHTML(result, 0);
  assert.equal((row.match(/data-score-category=/g) || []).length, 4);
  assert.match(row, /colspan="6"/);
  assert.match(row, /aria-expanded="false"/);
  context.resultView(0).category = "destinations"; context.resultView(0).index = 2;
  context.renderResultPanel(result);
  assert.match(panel.innerHTML, /No completado/); assert.match(panel.innerHTML, /−20/);
});
test("empty route UI does not invite tapping nonexistent points or an empty list", () => {
  const { g, context, panel } = renderHarness();
  context.renderResultPanel(g.result.find(r => r.seat === 3));
  assert.match(panel.innerHTML, /Sin rutas construidas/);
  assert.doesNotMatch(panel.innerHTML, /Toca los puntos|Ver lista/);
});
test("unchanged finished snapshots preserve the current tab, focus, scroll and map gesture", () => {
  const game = resultsRoom().game;
  const dialog = { _resultSignature: JSON.stringify([game.result, game.players.map(p => p.color)]), querySelector: () => ({}) };
  const context = vm.createContext({ I18n: require("../shared/i18n"), Postgame:{mode:()=>"results"}, game, uiDialog: "results", $: id => id === "dialog" ? dialog : { classList: { contains: () => false } },
    showDialog() { throw new Error("An unchanged snapshot must not rebuild the results DOM"); } });
  vm.runInContext(app.slice(app.indexOf("function showResults()"), app.indexOf("function renderResultMap(")), context);
  context.showResults();
});
