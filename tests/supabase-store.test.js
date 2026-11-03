"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createSupabaseStore } = require('../backend/supabase-store');
const { fakeSupabase } = require('./helpers/fake-supabase');
const { hashToken } = require('../backend/room-store');
const options = { url: 'https://fixture.supabase.co', secret: 'sb_secret_test_only' };
const rooms = () => new Map([['ABC123', { code: 'ABC123', updated: Date.now(), members: [{ name: 'A', token: 'private-token' }] }],
  ['PRACT', { code: 'PRACT', practice: true, members: [] }]]);
test('archive pages preserve exact sequence and reject missing frames', async () => {
  const api=fakeSupabase(),id='33333333-3333-4333-a333-333333333333';
  api.state.matches[id]={id,steps:49,frames:Array.from({length:49},(_,seq)=>({seq,snapshot:{value:seq}}))};
  const store=createSupabaseStore({...options,fetchImpl:api.fetch});
  assert.equal((await store.readArchive({},id)).matches[0].frames,undefined);
  assert.deepEqual((await store.readFrames(id,49)).map(f=>f.seq),Array.from({length:49},(_,i)=>i));
  assert.ok(api.calls.filter(c=>c.method==='trencitos_read_frames').every(c=>c.body.p_count<=16));
  api.state.matches[id].frames.splice(18,1);
  await assert.rejects(store.readFrames(id,49),{code:'STORE_UNAVAILABLE'});
});
test('Supabase stores private rooms with hashed recovery tokens and reloads after restart', async () => {
  const api = fakeSupabase(), first = createSupabaseStore({ ...options, fetchImpl: api.fetch });
  assert.deepEqual(await first.load(), []); await first.save(rooms());
  const second = createSupabaseStore({ ...options, fetchImpl: api.fetch }), restored = await second.load();
  assert.equal(restored.length, 1); assert.equal(restored[0].members[0].tokenHash, hashToken('private-token'));
  assert.ok(!JSON.stringify(restored).includes('private-token'));
  assert.equal(api.calls[0].headers.apikey, options.secret); assert.equal(api.calls[0].headers.Authorization, undefined);
  await assert.rejects(first.save(rooms()), { code: 'STORE_CONFLICT' });
  assert.equal(api.state.version, 1);
});
test('lost save response retries the same commit once, without duplicating the version', async () => {
  const api = fakeSupabase(), store = createSupabaseStore({ ...options, fetchImpl: api.fetch });
  await store.load(); api.lostResponses = 1; await store.save(rooms());
  assert.equal(api.state.version, 1); assert.equal(api.calls[1].body.p_commit, api.calls[2].body.p_commit);
});
test('uncertain remote commit fences later writes; restart reads the committed result', async () => {
  const api = fakeSupabase(), store = createSupabaseStore({ ...options, fetchImpl: api.fetch });
  await store.load(); api.lostResponses = 2;
  await assert.rejects(store.save(rooms()), { code: 'STORE_UNCERTAIN' });
  await assert.rejects(store.save(new Map()), { code: 'STORE_CONFLICT' });
  assert.equal(api.state.rooms.length, 1);
  const next = createSupabaseStore({ ...options, fetchImpl: api.fetch });
  assert.equal((await next.load()).length, 1);
});
test('failed load never becomes an empty save; invalid config and public keys fail closed', async () => {
  assert.throws(() => createSupabaseStore({ ...options, url: 'http://fixture.supabase.co' }), /HTTPS/);
  assert.throws(() => createSupabaseStore({ ...options, secret: 'sb_publishable_test' }), /secreta/);
  assert.throws(() => createSupabaseStore({ ...options, url: 'https://secret@fixture.supabase.co/' }), /HTTPS/);
  const api = fakeSupabase(), store = createSupabaseStore({ ...options, fetchImpl: api.fetch });
  api.fail = true; await assert.rejects(store.load()); await assert.rejects(store.save(new Map()));
  assert.equal(api.state.version, 0);
});
test('schema mismatch and corrupt remote room lists are not overwritten', async () => {
  const api = fakeSupabase(); api.state.schema_version = 2;
  const store = createSupabaseStore({ ...options, fetchImpl: api.fetch });
  await assert.rejects(store.load(), /no compatible/);
  api.state.schema_version = 1; api.state.rooms = [{}]; await assert.rejects(store.load(), /inválido/);
});
test('SQL denies browser roles and fences/idempotently commits under a row lock', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/001_active_games.sql'), 'utf8');
  assert.match(sql, /enable row level security/); assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /for update/); assert.match(sql, /r\.writer is distinct from p_writer/);
  assert.match(sql, /r\.last_commit = p_commit/); assert.match(sql, /r\.version <> p_version/);
  assert.doesNotMatch(sql, /security definer|create policy/i);
});
