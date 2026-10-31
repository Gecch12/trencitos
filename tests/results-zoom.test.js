"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const UI = require("../game-ui");
const app = fs.readFileSync(require.resolve("../app.js"), "utf8");
const source = app.slice(app.indexOf("function renderResultMap("), app.indexOf('$("viewResults").onclick'));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

// Execute the actual score-map camera/handlers. Intentionally defer every paint
// to catch rapid wheel events that would otherwise reuse a stale rendered scale.
function harness() {
  const events = new Map(), bounds = { x: 100, y: 80, width: 600, height: 400 };
  const svg = { clientWidth: 850, clientHeight: 360,
    addEventListener(type, fn, options) { events.set(type, { fn, options }); } };
  const context = vm.createContext({ GameUI: UI, svg, bounds, camera: null,
    resultCamera: { zoom: 1, center: { x: 400, y: 280 } },
    schedule() {}, pointerPoint: e => ({ x: e.clientX, y: e.clientY }) });
  vm.runInContext(source.slice(source.indexOf("  function refreshCamera()"), source.indexOf("  function paint()")) +
    source.slice(source.indexOf("  function zoomAt("), source.indexOf("  const observer =")), context);
  context.refreshCamera();
  const point = { x: 505, y: 175 };
  return { context, svg, point,
    wheel(deltaY, deltaMode = 0, p = point) {
      let prevented = false;
      assert.equal(events.get("wheel").options.passive, false);
      events.get("wheel").fn({ deltaY, deltaMode, clientX: p.x, clientY: p.y, preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
    },
    key(key) { svg.onkeydown({ target: svg, key, preventDefault() {} }); },
    doubleClick() { svg.ondblclick({ clientX: point.x, clientY: point.y, preventDefault() {} }); },
    world(p = point) {
      context.refreshCamera();
      return { x: context.camera.x + p.x * context.camera.scale, y: context.camera.y + p.y * context.camera.scale };
    } };
}
test("direct zoom can shrink as well as grow, preserving the cursor's world anchor", () => {
  const start = { zoom: 2, scale: 1.5, center: { x: 500, y: 400 }, midpoint: { x: 30, y: -40 } };
  for (const zoom of [.25, 1, 2, 4, 6]) {
    const next = UI.zoomTransform(start, zoom, start.midpoint), scale = start.scale * start.zoom / zoom;
    assert.equal(next.zoom, zoom);
    near(next.center.x + start.midpoint.x * scale, start.center.x + start.midpoint.x * start.scale);
    near(next.center.y + start.midpoint.y * scale, start.center.y + start.midpoint.y * start.scale);
  }
});
test("wheel zoom-in then zoom-out restores the original overview", () => {
  const h = harness(), before = h.world();
  h.wheel(-650); assert.ok(h.context.resultCamera.zoom > 3);
  h.wheel(650); near(h.context.resultCamera.zoom, 1);
  near(h.context.resultCamera.center.x, 400); near(h.context.resultCamera.center.y, 280);
  const after = h.world(); near(after.x, before.x); near(after.y, before.y);
});
test("rapid wheel events preserve cursor anchoring even without an intervening paint", () => {
  const h = harness(), before = h.world();
  for (let i = 0; i < 20; i++) h.wheel(-25);
  near(h.context.resultCamera.zoom, Math.exp(1));
  const after = h.world(); near(after.x, before.x); near(after.y, before.y);
  for (let i = 0; i < 20; i++) h.wheel(25);
  near(h.context.resultCamera.zoom, 1);
  near(h.context.resultCamera.center.x, 400); near(h.context.resultCamera.center.y, 280);
});
test("zoom limits stay reversible, including extreme wheel deltas", () => {
  const h = harness();
  h.wheel(-1000000); assert.equal(h.context.resultCamera.zoom, 6);
  h.wheel(-100); assert.equal(h.context.resultCamera.zoom, 6);
  h.wheel(100); assert.ok(h.context.resultCamera.zoom < 6);
  h.wheel(1000000); assert.equal(h.context.resultCamera.zoom, 1);
  h.wheel(100); assert.equal(h.context.resultCamera.zoom, 1);
  h.wheel(-100); assert.ok(h.context.resultCamera.zoom > 1);
});
test("wheel pixel, line and page units apply the same physical zoom", () => {
  const pixel = harness(), line = harness(), page = harness();
  pixel.wheel(-360); line.wheel(-22.5, 1); page.wheel(-1, 2);
  near(pixel.context.resultCamera.zoom, line.context.resultCamera.zoom);
  near(pixel.context.resultCamera.zoom, page.context.resultCamera.zoom);
});
test("double click returns to the centered overview after zoom and pan", () => {
  const h = harness();
  h.doubleClick(); assert.equal(h.context.resultCamera.zoom, 2);
  h.key("ArrowRight"); h.key("ArrowDown");
  h.doubleClick(); assert.equal(h.context.resultCamera.zoom, 1);
  assert.equal(h.context.resultCamera.center.x, 400); assert.equal(h.context.resultCamera.center.y, 280);
});
test("keyboard minus shrinks and Home restores the centered overview", () => {
  const h = harness();
  h.key("+"); assert.equal(h.context.resultCamera.zoom, 1.25);
  h.key("-"); assert.equal(h.context.resultCamera.zoom, 1);
  h.wheel(-650); h.key("ArrowRight"); h.key("Home");
  assert.equal(h.context.resultCamera.zoom, 1);
  assert.equal(h.context.resultCamera.center.x, 400); assert.equal(h.context.resultCamera.center.y, 280);
});
