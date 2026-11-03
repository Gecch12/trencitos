"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const UI = require("../frontend/game-ui");
const E = require("../backend/engine");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../frontend/app.js"), "utf8");

test("ticket numbers survive completion, display sorting and appending newly kept tickets", () => {
  const game = { tickets: [8, 3, 42].map(id => ({ id })), ticketProgress: [{ id: 8, completed: true }] };
  const numbers = () => UI.destinationEntries(game, game.tickets).map(({ ticket }) => UI.destinationNumber(game, ticket.id));
  assert.deepEqual(numbers(), [2, 3, 1]);
  assert.equal(UI.destinationNumber(game, 100, 0), 4);
  assert.equal(UI.destinationNumber(game, 101, 1), 5);
  // Owned tickets keep their number even when compared with a fresh offer.
  assert.equal(UI.destinationNumber(game, 3, 20), 2);
  game.ticketProgress.push({ id: 3, completed: true });
  game.tickets.push({ id: 101 });
  assert.deepEqual(numbers(), [3, 4, 1, 2]);
  assert.equal(UI.destinationNumber(null, 9, 1), 2);
});

test("overview deduplicates actual completed routes/stations and excludes offers and pending paths", () => {
  const game = {
    tickets: [{ id: 8, a: "A", b: "B" }, { id: 3, a: "B", b: "C" }, { id: 42, a: "C", b: "D" }],
    ticketOffer: { tickets: [{ id: 100, a: "X", b: "Y" }] },
    ticketProgress: [{ id: 8, completed: true }, { id: 3, completed: true }, { id: 42, completed: false }],
    ticketPaths: [
      { id: 8, routes: [0, 1, 2], stationRoutes: [1, 2], stations: [{ city: "B", seat: 0 }] },
      { id: 3, routes: [2, 3], stationRoutes: [], stations: [{ city: "B", seat: 0 }] },
      { id: 42, routes: [4] }, { id: 100, routes: [9] },
    ],
  };
  const before = JSON.stringify(game), overview = UI.destinationSpotlightSelection(game, null, true);
  assert.deepEqual(overview.routes, [0, 1, 2, 3]);
  assert.deepEqual(overview.stationRoutes, [1]);
  assert.deepEqual(overview.stations, [{ city: "B", seat: 0 }]);
  assert.deepEqual(overview.endpoints, ["A", "B", "C", "D"]);
  assert.deepEqual(overview.destinations.filter(t => t.a === "B" || t.b === "B").map(t => t.number), [1, 2]);
  assert.deepEqual(UI.destinationSpotlightSelection(game, 42, true).routes, []);
  assert.deepEqual(UI.destinationSpotlightSelection(game, 8, true).stationRoutes, [1, 2]);
  assert.equal(JSON.stringify(game), before);
  delete game.ticketPaths;
  assert.deepEqual(UI.destinationSpotlightSelection(game, null, true).routes, []);
});

test("endpoint badges wrap shared cities, retain double-digit numbers and differentiate completed tickets", () => {
  const context = vm.createContext({ I18n: require("../shared/i18n"), ticketColor: i => `color-${i}` });
  vm.runInContext(source.slice(source.indexOf("function destinationBadgeSize("), source.indexOf("function updateDestinationSpotlight(")), context);
  const nodes = [], el = (tag, attrs, parent) => { const node = { tag, attrs, parent }; nodes.push(node); return node; };
  const entries = Array.from({ length: 6 }, (_, i) => ({ number: i + 9, completed: i === 0 }));
  const size = context.drawDestinationBadges(el, {}, entries, 40, 20, 2);
  assert.equal(size.width, 88);
  assert.equal(size.height, 40);
  assert.deepEqual(nodes.filter(n => n.tag === "text").map(n => n.textContent), [9, 10, 11, 12, 13, 14]);
  assert.deepEqual(nodes.filter(n => n.tag === "rect").map(n => n.attrs.y), [0, 0, 0, 0, 20, 20]);
  assert.equal(nodes.find(n => n.tag === "rect").attrs.fill, "#f3d88d");
  assert.equal(nodes.filter(n => n.tag === "rect")[1].attrs.fill, "color-9");
});

test("an authoritative claim changes the overview from endpoints to the exact completed connection", () => {
  const game = E.newGame(["A", "B", "C", "D"]); game.phase = "play";
  game.players[0].tickets = [E.TICKETS.find(t => t.id === 15)];
  for (const id of [20, 16, 11]) game.routes[id].owner = 0;
  game.players[0].hand = ["green", "green"];
  assert.deepEqual(UI.destinationSpotlightSelection(E.view(game, 0), null, true).routes, []);
  E.action(game, 0, { type: "claim", routeId: 6, color: "green", wildCount: 0 });
  const own = UI.destinationSpotlightSelection(E.view(game, 0), null, true);
  assert.deepEqual(own.routes, [20, 16, 11, 6]);
  assert.equal(own.destinations[0].number, 1);
  assert.equal(own.destinations[0].completed, true);
  assert.equal(UI.destinationSpotlightSelection(E.view(game, 1), null, true), null);
});

test("destination rows use CSP-safe styles without rerendering unchanged rows after each update", () => {
  let html = "", writes = 0, color;
  const row = { dataset: { destination: "15" }, querySelector: () => ({ style: { setProperty: (_, value) => { color = value; } } }) };
  const list = { scrollTop: 40, querySelectorAll: () => [row] };
  Object.defineProperty(list, "innerHTML", { get: () => `${html}<!-- DOM-only style changes -->`, set: value => { writes++; html = value; } });
  const game = { tickets: [{ id: 15, a: "MAD", b: "DIE", p: 8 }], ticketProgress: [{ id: 15, completed: false }] };
  const context = vm.createContext({ I18n: require("../shared/i18n"), game, GameUI: UI, CITIES: E.CITIES, escapeHTML: s => s, ticketColor: i => `color-${i}`,
    $: () => list, document: { activeElement: { closest: () => null } } });
  vm.runInContext(source.slice(source.indexOf("function renderDestinations("), source.indexOf("function playerMetric(")), context);
  context.renderDestinations(); context.renderDestinations();
  assert.equal(writes, 1);
  assert.doesNotMatch(html, /style=/);
  assert.equal(color, "color-0");
  game.ticketProgress[0].completed = true;
  context.renderDestinations();
  assert.equal(writes, 2);
  assert.match(html, /is-complete/);
  assert.equal(list.scrollTop, 40);
});

test("practice controls remain accessible from history, never from the turn banner", () => {
  const html = fs.readFileSync(require.resolve("../frontend/index.html"), "utf8");
  const turn = html.slice(html.indexOf('<section id="turnBanner"'), html.indexOf('<div id="toast"'));
  const history = html.slice(html.indexOf('<section class="history-panel"'), html.indexOf('<section class="sidepanel"'));
  assert.doesNotMatch(turn, /compactPractice|Prueba/);
  assert.match(history, /id="compactPractice"/);
  assert.match(history, /Controles de la partida de prueba/);
});
