"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const UI = require("../game-ui");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8");

test("destination presentation puts pending first without changing IDs, indexes, colors or input order", () => {
  const tickets = [9, 4, 7, 2].map(id => Object.freeze({ id }));
  Object.freeze(tickets);
  const game = { ticketProgress: [{ id: 9, completed: true }, { id: 7, completed: false }, { id: 2, completed: true }] };
  const entries = UI.destinationEntries(game, tickets);
  assert.deepEqual(entries.map(e => e.ticket.id), [4, 7, 9, 2]);
  assert.deepEqual(entries.map(e => e.index), [1, 2, 0, 3]);
  assert.ok(entries.every(e => tickets[e.index] === e.ticket));
  assert.deepEqual(tickets.map(t => t.id), [9, 4, 7, 2]);
  assert.deepEqual(UI.destinationEntries({}, tickets).map(e => e.index), [0, 1, 2, 3]);
});

// Exercise the actual browser handlers with explicit bubbling/ownership events.
// Real touch capture transfer is additionally checked in browser QA.
function gestures(panel = "map") {
  const handlers = new Map(), captured = new Set(), classes = new Set();
  let captureCalls = 0;
  const viewport = {
    addEventListener(type, handler) { handlers.set(type, handler); },
    hasPointerCapture(id) { return captured.has(id); },
    setPointerCapture(id) { captured.add(id); captureCalls++; },
    releasePointerCapture(id) { captured.delete(id); },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, yes) => yes ? classes.add(c) : classes.delete(c) },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const context = vm.createContext({ I18n: require("../i18n"),
    $: () => viewport, compactMedia: { matches: true }, compactPanel: panel,
    mapCenter: { x: 100, y: 100 }, zoom: 1, GameUI: UI,
    closeMapMenu() {}, applyZoom() {},
  });
  context.mapViewSize = () => ({ scale: 2 / context.zoom, sx: 0, sy: 0 });
  context.setCompactPanel = next => { context.compactPanel = next; };
  context.setZoom = next => { context.zoom = next; };
  vm.runInContext(source.slice(source.indexOf("let mapDrag = null"), source.indexOf("const cameraResize =")), context);
  return {
    context, captured, classes, captureCalls: () => captureCalls,
    read: expression => vm.runInContext(expression, context),
    fire(type, options = {}) {
      const event = { type, button: 0, pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10,
        target: viewport, currentTarget: viewport, detail: 1,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...options };
      handlers.get(type)?.(event);
      return event;
    },
  };
}

test("one-finger drag survives bubbling implicit-capture loss and follows every move", () => {
  const g = gestures();
  g.fire("pointerdown");
  g.fire("pointermove", { clientX: 20 });
  g.fire("lostpointercapture", { target: { tagName: "path" } });
  g.fire("pointerleave");
  for (const clientX of [30, 40, 50]) {
    g.fire("pointermove", { clientX });
    assert.equal(g.context.mapCenter.x, 100 - (clientX - 10) * 2);
  }
  assert.equal(g.captureCalls(), 1);
  assert.equal(g.read("mapPointers.size"), 1);
  g.fire("pointerup");
  g.fire("lostpointercapture");
  assert.equal(g.read("mapDrag"), null);
  assert.equal(g.read("mapPointers.size"), 0);
  assert.equal(g.captured.size, 0);
  assert.equal(g.fire("click").stopped, true);
});

test("ordinary route taps keep their native click; map taps dismiss compact panels only once", () => {
  const g = gestures("cards");
  g.fire("pointerdown");
  assert.equal(g.context.compactPanel, "map");
  g.fire("pointerup");
  assert.equal(g.fire("click").stopped, true);
  g.fire("pointerdown");
  g.fire("pointerup");
  assert.equal(g.fire("click").stopped, undefined);
  assert.equal(g.captureCalls(), 0);
});

test("cancelled or lost viewport capture ends dragging, but another pointer cannot end it", () => {
  for (const end of ["pointercancel", "lostpointercapture"]) {
    const g = gestures();
    g.fire("pointerdown");
    g.fire("pointermove", { clientX: 30 });
    g.fire("pointerup", { pointerId: 7 });
    assert.ok(g.read("mapDrag"));
    g.fire(end);
    assert.equal(g.read("mapDrag"), null);
    assert.equal(g.read("mapPointers.size"), 0);
    assert.equal(g.classes.has("is-panning"), false);
    assert.equal(g.fire("click").stopped, true);
  }
});

test("pinch survives SVG capture transfer, suppresses clicks and allows the next single-finger drag", () => {
  const g = gestures();
  g.fire("pointerdown");
  g.fire("pointerdown", { pointerId: 2, clientX: 110 });
  g.fire("lostpointercapture", { target: { tagName: "rect" } });
  g.fire("pointermove", { pointerId: 2, clientX: 210 });
  assert.equal(g.context.zoom, 2);
  g.fire("pointerup", { pointerId: 2 });
  const afterPinch = g.context.mapCenter.x;
  g.fire("pointermove", { clientX: 20 });
  assert.equal(g.context.mapCenter.x, afterPinch - 10);
  g.fire("pointerup");
  assert.equal(g.read("mapPinch"), null);
  assert.equal(g.read("mapPointers.size"), 0);
  assert.equal(g.fire("click").stopped, true);
  g.fire("pointerdown");
  const beforeDrag = g.context.mapCenter.x;
  g.fire("pointermove", { clientX: 30 });
  assert.equal(g.context.mapCenter.x, beforeDrag - 20);
});

test("ticket preview is mouse-only; touch and keyboard focus cannot stick a deselected route", () => {
  const handlers = new Map();
  const row = { addEventListener: (type, handler) => handlers.set(type, handler) };
  const context = vm.createContext({ I18n: require("../i18n"), hoveredTicket: null, matchMedia: () => ({ matches: true }), updateTicketSelection() {} });
  vm.runInContext(source.slice(source.indexOf("function bindTicketPreview("), source.indexOf("function showTicketDialog(")), context);
  context.bindTicketPreview(row, 2, [], 1);
  handlers.get("pointerenter")({ pointerType: "touch" });
  assert.equal(context.hoveredTicket, null);
  assert.equal(handlers.has("focusin"), false);
  assert.equal(handlers.has("mouseenter"), false);
  handlers.get("pointerenter")({ pointerType: "mouse" });
  assert.equal(context.hoveredTicket, 2);
  handlers.get("pointerdown")({ pointerType: "touch" });
  assert.equal(context.hoveredTicket, null);
  context.matchMedia = () => ({ matches: false });
  handlers.get("pointerenter")({ pointerType: "mouse" });
  assert.equal(context.hoveredTicket, null);
});

test("fullscreen control is hidden unless the document and method both support it", () => {
  for (const enabled of [undefined, false, true]) for (const method of [undefined, () => {}]) {
    let hidden;
    const context = vm.createContext({ I18n: require("../i18n"),
      document: { fullscreenEnabled: enabled, documentElement: { requestFullscreen: method } },
      $: () => ({ classList: { toggle: (_, value) => { hidden = value; } }, setAttribute() {} }),
    });
    vm.runInContext(source.slice(source.indexOf("function updateFullscreenControl("), source.indexOf("updateFullscreenControl();")), context);
    context.updateFullscreenControl();
    assert.equal(hidden, !(enabled === true && !!method));
    context.document.fullscreenElement = {};
    context.updateFullscreenControl();
    assert.equal(hidden, false);
  }
});

test("destination overview includes only kept tickets and their completed private paths", () => {
  const game = { tickets: [{ id: 1, a: "A", b: "B" }, { id: 2, a: "B", b: "C" }],
    ticketOffer: [{ id: 3, a: "D", b: "E" }], initialTickets: [{ id: 4, a: "F", b: "G" }],
    ticketProgress: [{ id: 1, completed: true }, { id: 2, completed: false }],
    ticketPaths: [{ id: 1, routes: [12], stationRoutes: [12], stations: [{ city: "A", seat: 0 }] }] };
  const before = JSON.stringify(game);
  assert.deepEqual(UI.destinationSpotlightSelection(game, null, true), {
    endpoints: ["A", "B", "C"], routes: [12], stationRoutes: [12], stations: [{ city: "A", seat: 0 }], overview: true,
    destinations: [{ id: 1, a: "A", b: "B", number: 1, completed: true }, { id: 2, a: "B", b: "C", number: 2, completed: false }],
  });
  assert.deepEqual(UI.destinationSpotlightSelection(game, 1, true), {
    endpoints: ["A", "B"], routes: [12], stationRoutes: [12], stations: [{ city: "A", seat: 0 }],
    destinations: [{ id: 1, a: "A", b: "B", number: 1, completed: true }],
  });
  assert.equal(UI.destinationSpotlightSelection(game, null, false), null);
  assert.equal(UI.destinationSpotlightSelection(game, 3, false), null);
  assert.equal(UI.destinationSpotlightSelection({ tickets: [] }, null, true), null);
  assert.equal(UI.destinationSpotlightSelection(null, null, true), null);
  const result = { endpoints: ["X"], routes: [7] };
  assert.equal(UI.destinationSpotlightSelection(game, null, false, result), result);
  assert.equal(JSON.stringify(game), before);
  game.tickets.push({ id: 5, a: "C", b: "H" });
  assert.deepEqual(UI.destinationSpotlightSelection(game, null, true).endpoints, ["A", "B", "C", "H"]);
});

test("closing routes clears transient preview, selects Map on mobile and preserves explicit overview", () => {
  for (const mobile of [true, false]) {
    let focused = null, updated = 0;
    const hidden = new Set();
    const context = vm.createContext({ I18n: require("../i18n"),
      uiDialog: "routes", game: {}, seat: 0, compactMedia: { matches: mobile }, compactPanel: "destinations",
      buildTarget: {}, buildSubmitting: false, pendingChoiceKey: "routes", hoveredDestination: 2,
      allDestinationsVisible: true, dialogReturnFocus: { isConnected: true, focus() { focused = "row"; } },
      $: () => ({ classList: { add: value => hidden.add(value) } }),
      document: { querySelector: () => ({ focus() { focused = "map"; } }) },
      updateDestinationSpotlight() { updated++; },
    });
    context.setCompactPanel = panel => { context.compactPanel = panel; };
    vm.runInContext(source.slice(source.indexOf("function closeOptionalDialog("), source.indexOf("function openRoutes(")), context);
    context.closeOptionalDialog();
    assert.equal(context.uiDialog, null);
    assert.equal(context.hoveredDestination, null);
    assert.equal(context.allDestinationsVisible, true);
    assert.equal(context.compactPanel, mobile ? "map" : "destinations");
    assert.equal(focused, mobile ? "map" : "row");
    assert.equal(context.dialogReturnFocus, null);
    assert.equal(hidden.has("hidden"), true);
    assert.equal(updated, 1);
    // A compulsory ticket choice still cannot be dismissed.
    context.uiDialog = "tickets";
    context.game = { current: 0, turnWaiting: true, ticketOffer: [{}] };
    context.closeOptionalDialog();
    assert.equal(context.uiDialog, "tickets");
    assert.equal(updated, 1);
  }
});

test("main-map preview ignores touch and restored focus; overview is local UI state only", () => {
  const handlers = new Map(), toggle = {}, contextClasses = new Set();
  let updated = 0;
  const context = vm.createContext({ I18n: require("../i18n"),
    uiDialog: null, hoveredDestination: null, allDestinationsVisible: false, resultMapSelection: {},
    game: { tickets: [{ id: 2 }] }, compactMedia: { matches: true }, compactPanel: "destinations",
    matchMedia: () => ({ matches: true }), updateDestinationSpotlight() { updated++; }, toast() {},
    $: id => id === "ticketList" ? { addEventListener: (type, fn) => handlers.set(type, fn) }
      : id === "toggleDestinations" ? toggle : { classList: { add: c => contextClasses.add(c) } },
  });
  context.setCompactPanel = panel => { context.compactPanel = panel; };
  vm.runInContext(source.slice(source.indexOf('for (const type of ["pointerover", "pointerout"])'), source.indexOf("function updateDestinationSpotlight(")), context);
  const row = { dataset: { destination: "2" }, contains: () => false };
  const event = pointerType => ({ pointerType, target: { closest: () => row } });
  handlers.get("pointerover")(event("touch"));
  assert.equal(context.hoveredDestination, null);
  assert.equal(handlers.has("focusin"), false);
  handlers.get("pointerover")(event("mouse"));
  assert.equal(context.hoveredDestination, 2);
  handlers.get("pointerout")(event("mouse"));
  assert.equal(context.hoveredDestination, null);
  context.uiDialog = "routes";
  handlers.get("pointerover")(event("mouse"));
  assert.equal(context.hoveredDestination, null);
  context.uiDialog = null;
  toggle.onclick();
  assert.equal(context.allDestinationsVisible, true);
  assert.equal(context.resultMapSelection, null);
  assert.equal(context.compactPanel, "map");
  assert.equal(contextClasses.has("hidden"), true);
  toggle.onclick();
  assert.equal(context.allDestinationsVisible, false);
  assert.equal(updated, 4);
  context.game.tickets = [];
  toggle.onclick();
  assert.equal(context.allDestinationsVisible, false);
  assert.equal(updated, 4);
});
