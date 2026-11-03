"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { once } = require("node:events");
const { saveCheckpoint, loadState } = require("../backend/room-store"), E = require("../backend/engine");
const Replay = require("../shared/replay-state"), { verifyAudit } = require("../scripts/verify-match-audit");
const { fakeSupabase } = require("./helpers/fake-supabase"), { connect } = require("./helpers/ws-client");
const { recording, mapRef, cookie } = require("./helpers/map-recording");
const legacy = require("./fixtures/replay-europe-v1.json");

async function server(kind, archive, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "map-public-")), file = path.join(directory, "state.json");
  const env = { ...process.env }, originalFetch = global.fetch, api = fakeSupabase(), peers = [];
  let app, base, port;
  Object.assign(process.env, { STATE_BACKEND: kind, STATE_FILE: file, AUTH_ENABLED: "false", NODE_ENV: "test" });
  delete process.env.RENDER;
  if (kind === "file") saveCheckpoint(file, { rooms: [], archive });
  else {
    api.state.matches = structuredClone(archive.matches);
    Object.assign(process.env, { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test_only" });
    global.fetch = (url, options) => String(url).startsWith(process.env.SUPABASE_URL) ? api.fetch(url, options) : originalFetch(url, options);
  }
  async function boot() {
    delete require.cache[require.resolve("../backend/server")]; app = require("../backend/server"); await app.ready;
    app.server.listen(0, "127.0.0.1"); await once(app.server, "listening"); port = app.server.address().port; base = `http://127.0.0.1:${port}`;
  }
  try {
    await boot();
    await run({ get app() { return app; }, api, file,
      http: (route, own = false) => fetch(base + route, { headers: own ? { cookie } : {} }),
      client: async (own = false) => { const c = await connect(port, { cookie: own ? cookie : "" }); peers.push(c); return c; },
      restart: async () => { for (const p of peers) p.close(); await app.shutdown(); await boot(); },
    });
  } finally {
    for (const p of peers) p.close(); if (app) await app.shutdown(); global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const kind of ["file", "supabase"]) test(`${kind} HTTP history serves stored map definitions and legacy frames without a registered live map`, async () => {
  const { record, room } = recording(), old = structuredClone(legacy.record), original = structuredClone(record);
  assert.throws(() => E.contextFor(room.game), { code: "UNKNOWN_MAP_VERSION" });
  await server(kind, { matches: { [record.id]: record, [old.id]: old }, claims: {} }, async ({ http, restart, api, file }) => {
    for (const resumed of [false, true]) {
      if (resumed) await restart();
      const list = await (await http("/api/history", true)).json();
      assert.deepEqual(list.matches.find(r => r.id === record.id).mapRef, mapRef);
      for (const own of [false, true]) {
        const response = await http(`/api/history/${record.id}`, own); assert.equal(response.status, 200);
        const replay = await response.json(), state = Replay.at(replay.frames, replay.frames.length - 1);
        assert.deepEqual(replay.match.mapRef, mapRef); assert.deepEqual(state.definition, record.frames[0].snapshot.definition);
        assert.equal(state.views.length, own ? 3 : 1); assert.equal(state.game, undefined);
        if (!own) { assert.deepEqual(state.views[0].hand, []); assert.deepEqual(state.views[0].tickets, []); }
      }
      assert.equal((await http(`/api/history/${record.id}/audit`)).status, 403);
      const audit = await (await http(`/api/history/${record.id}/audit`, true)).json();
      assert.equal(verifyAudit(audit).integrity, true); assert.deepEqual(audit.frames, original.frames);
      const oldReplay = await (await http(`/api/history/${old.id}`)).json();
      assert.equal(Replay.at(oldReplay.frames, 0).definition, undefined);
    }
    const stored = kind === "file" ? loadState(file).archive.matches : api.state.matches;
    assert.deepEqual(stored[record.id], original); assert.deepEqual(stored[old.id], old);
  });
});

test("WebSocket state and reconnection deliver the same definition that HTTP replay records", async () => {
  await server("file", { matches: {}, claims: {} }, async session => {
    const a = await session.client(true), b = await session.client();
    a.send({ type: "create", name: "A", visibility: "public" }); const lobby = await a.next("lobby");
    b.send({ type: "join", code: lobby.code, name: "B" }); await b.next("lobby"); await a.next("lobby", m => m.members.length === 2);
    a.send({ type: "start" }); const initial = await a.next("state"), other = await b.next("state");
    assert.deepEqual(initial.definition, other.definition); assert.deepEqual(initial.game.mapRef, initial.definition.mapRef);
    assert.equal(initial.definition.schemaVersion, 1); assert.equal(initial.game.definitionVersion, 1);
    assert.ok(initial.game.initial.length > 0); assert.notEqual(initial.game.initial[0].id, other.game.initial[0].id);
    const room = session.app.rooms.get(lobby.code); E.finish(room.game, true); a.send({ type: "reclaim" });
    const final = await a.next("state", m => m.game.phase === "finished");
    const replay = await (await session.http(`/api/history/${room.matchId}`, true)).json();
    assert.deepEqual(Replay.at(replay.frames, replay.frames.length - 1).definition, final.definition);
    await session.restart();
    const restored = await session.client(true); restored.send({ type: "join", code: lobby.code, name: "A", token: lobby.token });
    const rejoined = await restored.next("state"); assert.deepEqual(rejoined.definition, initial.definition);
    assert.deepEqual(rejoined.game.mapRef, initial.game.mapRef);
  });
});
