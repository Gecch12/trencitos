"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { once } = require('node:events');
const { connect } = require('./helpers/ws-client');
const { fakeSupabase } = require('./helpers/fake-supabase');
const api = fakeSupabase(), originalFetch = global.fetch;
process.env.STATE_BACKEND = 'supabase';
process.env.SUPABASE_URL = 'https://fixture.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
global.fetch = (url, options) => String(url).startsWith(process.env.SUPABASE_URL) ? api.fetch(url, options) : originalFetch(url, options);
let app, port; const clients = [];
async function boot() {
  delete require.cache[require.resolve('../server')]; app = require('../server'); await app.ready;
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); port = app.server.address().port;
}
async function stop() {
  for (const c of clients.splice(0)) c.close();
  await app.shutdown();
}
async function client() { const c = await connect(port); clients.push(c); return c; }
async function playing() {
  const a = await client(), b = await client(); a.send({ type: 'create', name: 'A' });
  const la = await a.next('lobby'); b.send({ type: 'join', code: la.code, name: 'B' });
  const lb = await b.next('lobby'); await a.next('lobby', m => m.members.length === 2);
  a.send({ type: 'start' }); await a.next('state'); await b.next('state');
  for (const c of [a,b]) c.send({ type: 'action', action: { type: 'choose_initial', indexes: [0,1] } });
  await a.next('state', m => m.game.phase === 'play'); await b.next('state', m => m.game.phase === 'play');
  return { a, b, la, lb, room: app.rooms.get(la.code) };
}
test.before(boot);
test.after(async () => { await stop(); global.fetch = originalFetch; });
let recovery;
test('remote WebSocket actions are serialized across rooms and acknowledged only after the save', async () => {
  const f = await playing(), other = await playing(); recovery = { code: f.la.code, token: f.la.token };
  const seat = f.room.game.current, c = [f.a,f.b][seat], old = f.room.game.players[seat].hand.length;
  const otherSeat = other.room.game.current, d = [other.a,other.b][otherSeat];
  const action = { type: 'action', id: 'remote-draw-0001', revision: f.room.revision, action: { type: 'draw_train', index: -1 } };
  const release = api.hold();
  c.send(action); d.send({ ...action, id: 'remote-draw-0002', revision: other.room.revision });
  await assert.rejects(c.next('ack', m => m.id === action.id, 60));
  assert.equal(api.state.rooms.find(r => r.code === f.la.code).game.players[seat].hand.length, old);
  release(); await c.next('ack', m => m.id === action.id); await d.next('ack', m => m.id === 'remote-draw-0002');
  assert.equal(api.state.rooms.find(r => r.code === f.la.code).game.players[seat].hand.length, old + 1);
  c.send(action); await c.next('ack', m => m.id === action.id);
  assert.equal(f.room.game.players[seat].hand.length, old + 1);
  recovery.hand = [...f.room.game.players[0].hand]; recovery.revision = f.room.revision;
  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.deepEqual(await health.json(), { ok: true, storage: 'supabase', rooms: 2 });
});
test('server restart reloads remote rooms and restores the same private seat, hand and revision', async () => {
  await stop(); await boot();
  assert.equal(app.rooms.size, 2);
  const c = await client(); c.send({ type: 'join', code: recovery.code, token: recovery.token });
  const lobby = await c.next('lobby'), state = await c.next('state');
  assert.equal(lobby.seat, 0); assert.deepEqual(state.game.hand, recovery.hand); assert.equal(state.game.revision, recovery.revision);
  assert.ok(!JSON.stringify(api.state.rooms).includes(recovery.token));
});
test('remote timeout commits automatic draws before broadcasting the next turn', async () => {
  const f = await playing(), seat = f.room.game.current, count = f.room.game.players[seat].hand.length;
  f.room.game.turnDeadline = Date.now() + 40;
  f.a.send({ type: 'reclaim' }); // Resync clock after setting this test deadline.
  await f.a.next('state', m => m.game.current !== seat);
  const saved = api.state.rooms.find(r => r.code === f.la.code);
  assert.equal(saved.game.players[seat].hand.length, count + 2);
  assert.notEqual(saved.game.current, seat);
});
test('server-only database modules, credentials and migration are not static assets', async () => {
  for (const file of ['.env','supabase-store.js','room-state.json','supabase/001_active_games.sql'])
    assert.equal((await fetch(`http://127.0.0.1:${port}/${file}`)).status, 404);
});
test('remote failure restores room membership and tokens, emits no success, and pauses rather than silently using disk', async () => {
  const room = app.rooms.get(recovery.code), tokenHash = room.members[0].tokenHash;
  const c = await client(); c.send({ type: 'join', code: recovery.code, token: recovery.token }); await c.next('lobby');
  api.fail = true;
  c.send({ type: 'rotate_token' });
  assert.equal((await c.next('error', m => m.code === 'STORAGE_FAILED')).code, 'STORAGE_FAILED');
  assert.equal(room.members[0].tokenHash, tokenHash);
  await assert.rejects(c.next('lobby', m => m.token !== recovery.token, 60));
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 503);
  api.fail = false;
});

test('custom codes and chosen colors commit atomically to Supabase and survive a restart', async () => {
  await stop(); await boot();
  const colors = require('../data').PLAYER_COLORS;
  const a = await client(); a.send({ type: 'create', code: '0022334455', name: 'Colores', color: colors[4] });
  const lobby = await a.next('lobby');
  const release = api.hold();
  a.send({ type: 'select_color', color: colors[2] });
  await assert.rejects(a.next('lobby', m => m.members[0].color === colors[2], 60));
  assert.equal(api.state.rooms.find(r => r.code === lobby.code).members[0].color, colors[4]);
  release(); await a.next('lobby', m => m.members[0].color === colors[2]);
  assert.equal(api.state.rooms.find(r => r.code === lobby.code).members[0].color, colors[2]);
  await stop(); await boot();
  const recovered = await client(); recovered.send({ type: 'join', code: lobby.code, token: lobby.token });
  assert.equal((await recovered.next('lobby')).members[0].color, colors[2]);
  api.fail = true;
  recovered.send({ type: 'select_color', color: colors[1] });
  await recovered.next('error', m => m.code === 'STORAGE_FAILED');
  assert.equal(app.rooms.get(lobby.code).members[0].color, colors[2]);
  await assert.rejects(recovered.next('lobby', m => m.members[0].color === colors[1], 60));
  api.fail = false;
});
