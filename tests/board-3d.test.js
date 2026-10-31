"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const Camera = require('../board-camera');
const UI = require('../game-ui');
const Map = require('../map-layout');
const { CITIES } = require('../data');

test('tilted ground projection fits safe area and preserves a zoom anchor', () => {
  for (const size of [{ width: 1460, height: 888 }, { width: 390, height: 792 }]) {
    const safe = { x: 16, y: 90, width: size.width - 32, height: size.height - 210 };
    const center = { x: 430, y: 320 };
    const before = Camera.view(Map.bounds, size, safe, 1, center, UI.camera);
    const after = Camera.view(Map.bounds, size, safe, 2, center, UI.camera);
    assert.ok(Map.bounds.width / before.scale <= safe.width + .001);
    assert.ok(Map.bounds.height / before.scaleY <= safe.height + .001);
    const offset = { x: 20, y: -40 };
    const nextCenter = { x: center.x + offset.x * (before.scale - after.scale), y: center.y + offset.y * (before.scaleY - after.scaleY) };
    const next = Camera.view(Map.bounds, size, safe, 2, nextCenter, UI.camera);
    assert.ok(Math.abs(before.focus.x + offset.x * before.scale - next.focus.x - offset.x * next.scale) < 1e-8);
    assert.ok(Math.abs(before.focus.y + offset.y * before.scaleY - next.focus.y - offset.y * next.scaleY) < 1e-8);
  }
});

test('dense labels prioritize focus, reject collisions, bound leaders and reuse stable offsets', () => {
  const entries = Object.entries(Map.cities).map(([key, [x, y]]) => ({ key, x: (x + 60) * .36, y: (y + 10) * .36, width: CITIES[key][2].length * 7, priority: key === 'PAR' ? 3 : 0 }));
  const options = { maxLeader: 36, hideColliding: true };
  const labels = Map.placeLabels(entries, 360, 250, [], { height: 18, baseline: 13 }, options);
  assert.equal(labels[0].key, 'PAR');
  assert.ok(labels.length < entries.length);
  for (const [i, a] of labels.entries()) {
    assert.ok(a.x >= 4 && a.y >= 4 && a.x + a.width <= 356 && a.y + a.height <= 246);
    const city = entries.find(c => c.key === a.key);
    assert.ok(Math.hypot(Math.max(a.x, Math.min(city.x, a.x + a.width)) - city.x, Math.max(a.y, Math.min(city.y, a.y + a.height)) - city.y) <= 36);
    for (const b of labels.slice(i + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
  const e = [{ key: 'PAR', x: 160, y: 120, width: 40, priority: 3 }];
  const first = Map.placeLabels(e, 360, 250, [], undefined, options)[0];
  const previous = new globalThis.Map([['PAR', { dx: first.x - 160, dy: first.y - 120 }]]);
  const second = Map.placeLabels([{ ...e[0], x: 162, y: 123 }], 360, 250, [], undefined, { ...options, previous })[0];
  assert.equal(second.x - first.x, 2); assert.equal(second.y - first.y, 3);
});
