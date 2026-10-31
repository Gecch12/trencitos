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
    classList: { add: c => classes.add(c), remove: c => classes.delete(c) },
  };
  const context = vm.createContext({
    $: () => viewport, compactMedia: { matches: true }, compactPanel: panel,
    mapCenter: { x: 100, y: 100 }, zoom: 1, GameUI: UI,
    mapViewSize: () => ({ scale: 2 }), closeMapMenu() {}, applyZoom() {},
  });
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
  g.fire("pointerup");
  assert.equal(g.read("mapPinch"), null);
  assert.equal(g.read("mapPointers.size"), 0);
  assert.equal(g.fire("click").stopped, true);
  g.fire("pointerdown");
  g.fire("pointermove", { clientX: 30 });
  assert.equal(g.context.mapCenter.x, 60);
});

test("ticket preview is mouse-only; touch and keyboard focus cannot stick a deselected route", () => {
  const handlers = new Map();
  const row = { addEventListener: (type, handler) => handlers.set(type, handler) };
  const context = vm.createContext({ hoveredTicket: null, matchMedia: () => ({ matches: true }), updateTicketSelection() {} });
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
    const context = vm.createContext({
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
