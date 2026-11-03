"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Map = require("../frontend/map-layout");
const { ROUTES, CITIES } = require("../shared/data");
const network = Map.createNetwork(ROUTES);

function corners(cell) {
  const a = cell.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [
    cell.x + x * cell.width / 2 * cos - y * cell.height / 2 * sin,
    cell.y + x * cell.width / 2 * sin + y * cell.height / 2 * cos,
  ]);
}
function intersect(a, b) {
  const A = corners(a), B = corners(b);
  for (const polygon of [A, B]) for (let i = 0; i < 2; i++) {
    const p = polygon[i], q = polygon[i + 1], x = p[1] - q[1], y = q[0] - p[0];
    const aa = A.map(p => p[0] * x + p[1] * y), bb = B.map(p => p[0] * x + p[1] * y);
    if (Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb)) < 0.001) return false;
  }
  return true;
}

test("cartography preserves every city, route ID and train count without mutating rules", () => {
  const before = JSON.stringify({ CITIES, ROUTES });
  assert.deepEqual(Object.keys(Map.cities).sort(), Object.keys(CITIES).sort());
  const drawn = Map.createNetwork(ROUTES);
  assert.equal(drawn.length, 101);
  assert.equal(drawn.reduce((n, r) => n + r.cells.length, 0), 300);
  for (let i = 0; i < ROUTES.length; i++) {
    assert.equal(drawn[i].id, ROUTES[i].id);
    assert.equal(drawn[i].cells.length, ROUTES[i].n);
  }
  assert.equal(JSON.stringify({ CITIES, ROUTES }), before);
  assert.ok(Map.cities.ANG[0] > Map.cities.CON[0] && Map.cities.ANG[1] > Map.cities.CON[1]);
  assert.ok(Map.cities.ANG[0] > Map.cities.SMY[0] && Map.cities.ANG[0] < Map.cities.ERZ[0]);
});

test("all 300 slots have identical dimensions, follow their path tangents and fit inside the water bounds", () => {
  for (const route of network) {
    assert.ok(route.margin >= Map.tile.cityMargin - 0.01, `margin ${route.id}`);
    for (const cell of route.cells) {
      assert.equal(cell.width, Map.tile.width);
      assert.equal(cell.height, Map.tile.height);
      const p = Map.pointAt(route, cell.at), a = Map.pointAt(route, cell.at - 0.5), b = Map.pointAt(route, cell.at + 0.5);
      assert.ok(Math.hypot(p[0] - cell.x, p[1] - cell.y) < 0.0001);
      assert.ok(Math.abs(cell.angle - Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) < 0.0001);
      for (const [x, y] of corners(cell)) {
        assert.ok(x >= Map.bounds.x && x <= Map.bounds.x + Map.bounds.width);
        assert.ok(y >= Map.bounds.y && y <= Map.bounds.y + Map.bounds.height);
      }
    }
  }
  const curve = network[ROUTES.find(r => r.a === "BER" && r.b === "DAN").id];
  assert.ok(Math.max(...curve.cells.map(c => c.angle)) - Math.min(...curve.cells.map(c => c.angle)) > 30);
});

test("train slots do not overlap, including parallel tracks and crowded city approaches", () => {
  const overlaps = [];
  for (let i = 0; i < network.length; i++) for (let j = i; j < network.length; j++) {
    for (let a = 0; a < network[i].cells.length; a++) for (let b = i === j ? a + 1 : 0; b < network[j].cells.length; b++) {
      if (intersect(network[i].cells[a], network[j].cells[b]))
        overlaps.push(`${i}:${a} ${ROUTES[i].a}-${ROUTES[i].b} / ${j}:${b} ${ROUTES[j].a}-${ROUTES[j].b}`);
    }
  }
  assert.deepEqual(overlaps, []);
});

test("tracks never pass through an unrelated city and terminate at their own endpoints", () => {
  for (const route of network) {
    const rule = ROUTES[route.id];
    assert.deepEqual(route.points[0], Map.cities[rule.a]);
    assert.deepEqual(route.points.at(-1), Map.cities[rule.b]);
    for (const [key, city] of Object.entries(Map.cities)) {
      if (key === rule.a || key === rule.b) continue;
      const clearance = Math.min(...route.points.map(p => Math.hypot(p[0] - city[0], p[1] - city[1])));
      assert.ok(clearance >= 11, `${rule.a}-${rule.b} crosses ${key}`);
    }
  }
});

test("constant-screen-size labels remain separated and contained at desktop fit sizes", () => {
  for (const [width, height] of [[897, 440], [1080, 620], [1560, 858]]) {
    const scale = Math.max(Map.bounds.width / width, Map.bounds.height / height);
    const entries = Object.entries(Map.cities).map(([key, [x, y]]) => ({
      key, x: width / 2 + (x - 430) / scale, y: height / 2 + (y - 320) / scale,
      width: CITIES[key][2].length * 6.9,
    }));
    const labels = Map.placeLabels(entries, width, height);
    for (let i = 0; i < labels.length; i++) {
      const a = labels[i];
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height, a.key);
      for (const b of labels.slice(i + 1))
        assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${width}: ${a.key} / ${b.key}`);
    }
  }
});
