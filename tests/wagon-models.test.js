'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PLAYER_PALETTE } = require('../data');
const UI = require('../game-ui');

test('every player color has a wagon, including legacy yellow, without changing paint ownership', async () => {
  const { WAGON_STYLES, wagonStyle } = await import('../wagon-models.mjs');
  assert.equal(WAGON_STYLES.length, PLAYER_PALETTE.length);
  assert.equal(new Set(WAGON_STYLES.map(s => s.model)).size, PLAYER_PALETTE.length);
  for (const { color, finish = 'paint' } of PLAYER_PALETTE) {
    const style = wagonStyle(color);
    assert.equal(style.model, WAGON_STYLES.find(s => s.color === color).model);
    assert.equal(style.color, color);
    assert.equal(style.finish, finish);
    assert.equal(wagonStyle(UI.playerColor(color)).model, style.model);
    const custom = wagonStyle(color, { model: 'tanker', finish: 'paint' });
    assert.deepEqual(custom, { color, model: 'tanker', finish: 'paint' });
  }
  assert.equal(wagonStyle('#123456').color, '#123456');
  assert.equal(wagonStyle('#123456', { model: 'missing', finish: 'missing' }).model, 'passenger');
});

test('wagon primitives stay within their shared footprint and height budget', async () => {
  const { WAGON_STYLES, wagonParts } = await import('../wagon-models.mjs');
  const shapes = new Set(['box', 'round', 'wheel', 'tank', 'disc', 'rock', 'mound', 'coil', 'roof', 'car-body', 'canopy']);
  for (const { model } of WAGON_STYLES) {
    const parts = wagonParts(model);
    assert.ok(parts.length > 10 && parts.length <= 70, model);
    for (const part of parts) {
      assert.ok(shapes.has(part.shape));
      assert.ok(part.size.every(n => n > 0 && Number.isFinite(n)));
      const [x, y, z] = part.xyz, [w, d, h] = part.size;
      assert.ok(Math.abs(x) + w / 2 <= 10.7, `${model} length`);
      assert.ok(Math.abs(y) + d / 2 <= 4.7, `${model} width`);
      assert.ok(z - (part.shape === 'roof' ? 0 : h / 2) >= 0, `${model} ground`);
      assert.ok(z + h * (part.shape === 'roof' ? 1 : .5) <= 10.4, `${model} height`);
    }
  }
});
