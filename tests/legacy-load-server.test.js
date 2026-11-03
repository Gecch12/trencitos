"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { once } = require("node:events");
const E = require("../engine"), { hashToken, loadState } = require("../room-store");
const { connect } = require("./helpers/ws-client"), { fakeSupabase } = require("./helpers/fake-supabase");

for (const backend of ["file", "supabase"]) test(`${backend} load normalizes old results and clocks before publishing and commits compatible state`, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rail-legacy-load-"));
  const originalFetch = global.fetch, originalEnv = { ...process.env }, api = fakeSupabase();
  const savedAt = Date.now() - 1000, token = "a".repeat(64);
  const finished = E.newGame(["A", "B"], 0, savedAt, null, { random: () => 0 });E.finish(finished);
  finished.result[0].route += 7;finished.result[0].score += 7;
  const totals = finished.result.map(r => r.score);for (const result of finished.result) delete result.details;
  const initial = E.newGame(["A", "B"], 0, savedAt, null, { random: () => 0 });
  delete initial.initialDeadline;initial.current = 1;initial.turnSeat = 1;initial.turnDeadline = savedAt + 45000;
  const saved = [finished, initial].map((game, i) => ({ code: `1234567${i}`, updated: savedAt, savedAt, revision: 7,
    hostSeat: 0, visibility: "private", game, members: game.players.map((p, seat) => ({ name: p.name, color: p.color, tokenHash: hashToken(seat ? "b".repeat(64) : token) })) }));
  Object.assign(process.env, { STATE_BACKEND: backend, STATE_FILE: path.join(directory, "state.json"), AUTH_ENABLED: "false", NODE_ENV: "test" });
  delete process.env.RENDER;
  if (backend === "file") fs.writeFileSync(process.env.STATE_FILE, JSON.stringify(saved));
  else {
    api.state.rooms = structuredClone(saved);
    Object.assign(process.env, { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test_only" });
    global.fetch = (url, options) => String(url).startsWith(process.env.SUPABASE_URL) ? api.fetch(url, options) : originalFetch(url, options);
  }
  let app, peer;
  try {
    delete require.cache[require.resolve("../server")];app = require("../server");await app.ready;
    const g = app.rooms.get(saved[0].code).game, clock = app.rooms.get(saved[1].code);
    assert.deepEqual(g.result.map(r => r.score), totals);assert.ok(g.result.every(r => r.details));
    assert.equal(g.result[0].details.routeAdjustment, 7);
    assert.equal(clock.game.current, 0);assert.equal(clock.game.initialDeadline, clock.game.turnDeadline);
    assert.ok(clock.game.turnDeadline - clock.emptySince <= 45000);
    assert.ok(clock.game.turnDeadline - clock.emptySince >= 44000);
    const committed = backend === "file" ? loadState(process.env.STATE_FILE).rooms : api.state.rooms;
    assert.ok(committed.find(r => r.code === saved[0].code).game.result.every(r => r.details));
    const before = structuredClone(g);E.view(g, 0, { now: Date.now() });assert.deepEqual(g, before);
    app.server.listen(0, "127.0.0.1");await once(app.server, "listening");
    peer = await connect(app.server.address().port);peer.send({ type: "join", code: saved[0].code, token });
    await peer.next("lobby");const message = await peer.next("state");
    assert.equal(message.game.revision, 7);assert.deepEqual(message.game.result.map(r => r.score), totals);
    assert.ok(message.game.result.every(r => r.details));assert.equal(message.game.turnDeadline, null);
  } finally {
    peer?.close();if (app) await app.shutdown();global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);fs.rmSync(directory, { recursive: true, force: true });
  }
});
