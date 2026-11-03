"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const E = require("../backend/engine"), Replay = require("../shared/replay-state");
const { projectDefinition } = require("../game/queries/match-definition");
const { createLegacyAuthorizedViews } = require("../game/compat/legacy-authorized-views");
const { createMatchArchive, frameHash } = require("../backend/match-archive");
const { createHistoryQueries } = require("../game/application/history-queries");
const { verifyAudit } = require("../scripts/verify-match-audit");
const { recording, mapRef, identity } = require("./helpers/map-recording");
const legacy = require("./fixtures/replay-europe-v1.json");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
const archiveFor = record => createMatchArchive({ saved: { matches: { [record.id]: record }, claims: {} } });

test("public definitions match live identities and corridors on Europe and an opaque-ID map", () => {
  for (const ref of [{ id: "europe", version: "1" }, mapRef]) {
    const { engine, room } = recording(ref), g = room.game;
    g.routes.reverse(); const before = structuredClone(g), definition = engine.definition(freeze(g));
    assert.equal(definition.schemaVersion, 1); assert.deepEqual(definition.mapRef, ref);
    assert.deepEqual(definition.rulesRef, g.rulesRef); assert.equal(definition.map.routes.length, g.routes.length);
    const corridors = new Map(definition.map.corridors.map(c => [c.id, c.cityIds]));
    for (const route of definition.map.routes) {
      const { corridorId, ...row } = route, live = engine.routeById(g, route.id);
      for (const [key, value] of Object.entries(row)) assert.deepEqual(live[key], value);
      assert.deepEqual([...corridors.get(corridorId)].sort(), [route.a, route.b].sort());
      assert.equal(typeof route.id, ref.id === "europe" ? "number" : "string");
      assert.equal(Object.hasOwn(route, "owner"), false);
    }
    assert.ok(g.players.flatMap(p => p.tickets).every(t => definition.map.tickets.some(row => row.id === t.id)));
    assert.deepEqual(definition.rules.routePoints, engine.contextFor(g).rules.routePoints);
    assert.equal(definition.rules.setup.trainCards.reduce((sum, card) => sum + card.count, 0), 110);
    definition.map.cities[0].name = "changed"; definition.rules.stationCosts.push(999); definition.mapRef.id = "changed";
    assert.deepEqual(g, before); assert.deepEqual(engine.definition(g).mapRef, ref);
  }
});

test("definition projection reads only public context and never hidden allocations or extra rule fields", () => {
  const { engine, room } = recording(), context = engine.contextFor(room.game);
  const forbidden = () => { throw Error("private field read"); };
  const g = { schemaVersion: 1, mapRef: room.game.mapRef, rulesRef: room.game.rulesRef };
  for (const key of ["players", "deck", "shortDeck", "pending", "routes"]) Object.defineProperty(g, key, { get: forbidden });
  const rules = { ...context.rules }; Object.defineProperty(rules, "private", { enumerable: true, get: forbidden });
  assert.deepEqual(projectDefinition({ ...context, rules }), engine.definition(g));
  assert.equal(Object.hasOwn(engine.definition(g).rules, "private"), false);
});

test("authorized state and recording carry one detached definition shared in meaning across perspectives", () => {
  const { engine, room } = recording(), projections = createLegacyAuthorizedViews({ engine, now: () => 42 });
  const before = structuredClone(room.game), messages = [-1, 0, 1].map(seat => projections.state(room, seat));
  const saved = projections.recording(room);
  for (const message of messages) {
    assert.deepEqual(message.definition, saved.definition);
    assert.equal(message.game.definitionVersion, 1); assert.deepEqual(message.game.mapRef, mapRef);
    assert.equal(Object.hasOwn(message.game, "definition"), false);
    message.definition.map.routes[0].id = "changed";
  }
  assert.deepEqual(messages[0].game.hand, []); assert.deepEqual(messages[0].game.tickets, []);
  for (const row of messages[0].game.result) assert.deepEqual(row.tickets, []);
  assert.deepEqual(room.game, before); assert.notEqual(saved.definition.map.routes[0].id, "changed");
  assert.ok(saved.views.every(view => !Object.hasOwn(view, "definition")));
});

test("archive records map metadata and hashes its public definition without duplicating it in each view", async () => {
  const { engine, room, archive, record } = recording();
  assert.deepEqual(record.mapRef, mapRef); assert.equal(record.map, mapRef.id);
  assert.equal(record.definitionVersion, 1); assert.deepEqual(record.rulesRef, room.game.rulesRef);
  const audit = await archive.replay(identity, record.id, true); assert.equal(verifyAudit(audit).integrity, true);
  for (let i = 0; i < audit.frames.length; i++) {
    const state = Replay.at(audit.frames, i);
    assert.deepEqual(state.definition, engine.definition(room.game));
    assert.ok(state.views.every(view => !view.definition && view.mapRef.id === mapRef.id));
    if (i) assert.ok((audit.frames[i].changes || []).every(change => change.path[0] !== "definition"));
  }
  const tampered = structuredClone(audit); tampered.frames[0].snapshot.definition.map.cities[0].name = "tampered";
  assert.throws(() => verifyAudit(tampered), /cadena/);
});

test("stored definitions support replay without a registered map or access to the current engine", async () => {
  const { record, room } = recording(), original = structuredClone(record);
  const forbidden = () => { throw Error("Replay consulted the live engine"); };
  const archive = createMatchArchive({ saved: { matches: { [record.id]: freeze(record) }, claims: {} },
    engine: { contextFor: forbidden, normalize: forbidden, definition: forbidden, view: forbidden } });
  for (const who of [{}, identity]) {
    const result = await archive.replay(who, record.id), state = Replay.at(result.frames, result.frames.length - 1);
    assert.deepEqual(state.definition.mapRef, mapRef); assert.equal(state.game, undefined);
    assert.equal(state.views.length, who === identity ? 3 : 1);
    assert.deepEqual(state.definition.map.tickets, original.frames[0].snapshot.definition.map.tickets);
    assert.ok(state.views.every(view => view.mapRef.id === mapRef.id));
    if (who !== identity) { assert.deepEqual(state.views[0].hand, []); assert.deepEqual(state.views[0].tickets, []); }
    state.definition.map.cities[0].name = "changed";
  }
  assert.equal((await archive.list(identity))[0].mapRef.id, mapRef.id);
  assert.deepEqual(record, original); assert.throws(() => E.contextFor(room.game), { code: "UNKNOWN_MAP_VERSION" });
});

test("original Europe public, participant and audit responses retain their frozen hashes", async () => {
  const record = freeze(structuredClone(legacy.record)), archive = archiveFor(record), before = structuredClone(record);
  for (const [name, who, audit] of [["public", {}, false], ["participant", { guestId: "legacy-a" }, false], ["audit", { guestId: "legacy-a" }, true]]) {
    const result = await archive.replay(who, record.id, audit);
    assert.equal(hash(result), legacy.responsesSha256[name]);
    if (audit) { assert.equal(verifyAudit(result).integrity, true); assert.deepEqual(result.frames, record.frames); }
    else assert.ok(!Replay.at(result.frames, 0).definition);
  }
  assert.deepEqual(record, before);
});

test("resuming a legacy recording appends definitions while preserving its original prefix and hash chain", async () => {
  for (const restart of [false, true]) {
    const record = structuredClone(legacy.record); record.frames = record.frames.slice(0, 2);
    record.status = "active"; record.steps = 2; record.digest = record.frames.at(-1).hash; record.closedAt = null;
    const old = structuredClone(record.frames), last = Replay.at(old, 1), archive = archiveFor(record);
    const room = { code: record.code, visibility: "public", members: record.players, game: E.restoreState(last.game),
      matchId: record.id, archiveSeq: 1, archiveHash: record.digest, archiveFull: true, archiveStartedAt: record.startedAt,
      ...(!restart ? { _archiveState: last } : {}) };
    archive.capture(room); archive.commit(archive.prepare()); E.finish(room.game, true);
    archive.capture(room); archive.commit(archive.prepare());
    const current = archive.state.matches[record.id]; assert.deepEqual(current.frames.slice(0, 2), old);
    assert.equal(current.frames[2].previousHash, old[1].hash);
    assert.equal(Boolean(current.frames[2].snapshot), restart);
    const audit = await archive.replay({ guestId: "legacy-a" }, record.id, true);
    assert.equal(verifyAudit(audit).integrity, true);
    const publicReplay = await archive.replay({}, record.id);
    assert.equal(Replay.at(publicReplay.frames, 1).definition, undefined);
    assert.equal(Replay.at(publicReplay.frames, 2).definition.mapRef.id, "europe");
  }
});

test("unknown definition versions and incomplete references reject before loading remote frames", async () => {
  const { record } = recording(), { frames, ...metadata } = record;
  for (const change of [r => r.definitionVersion = 2, r => delete r.mapRef, r => delete r.rulesRef,
    r => r.mapRef = { id: "bot-fixture" }, r => delete r.definitionVersion]) {
    const copy = structuredClone(metadata); change(copy); let reads = 0;
    const queries = createHistoryQueries({ repository: { records: async () => ({ matches: [copy], claims: {} }),
      frames: async () => { reads++; return frames; } } });
    await assert.rejects(queries.replay(identity, record.id), error => error.status === 409); assert.equal(reads, 0);
  }
});

test("incompatible recorded definitions and mixed view references never silently fall back to Europe", async () => {
  const { record } = recording();
  for (const change of [s => s.definition.schemaVersion = 2, s => s.definition.mapRef.version = "missing",
    s => s.views[1].rulesRef.version = "missing", s => delete s.definition, s => delete s.views[1].mapRef]) {
    const copy = structuredClone(record); change(copy.frames[0].snapshot); const before = structuredClone(copy), archive = archiveFor(copy);
    for (const [who, audit] of [[{}, false], [identity, false], [identity, true]])
      await assert.rejects(archive.replay(who, record.id, audit), error => error.status === 409);
    assert.deepEqual(copy, before);
  }
});

test("new metadata requires a recorded definition and cannot label an entirely legacy recording", async () => {
  const record = structuredClone(legacy.record), context = E.contextFor({});
  Object.assign(record, { definitionVersion: 1, mapRef: context.mapRef, rulesRef: context.rulesRef });
  await assert.rejects(archiveFor(record).replay({}, record.id), error => error.status === 409);
  for (const { hash: digest, ...frame } of record.frames) assert.equal(frameHash(frame), digest);
});
