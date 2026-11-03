"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const E = require("../backend/engine"), { createBots } = require("../backend/bots");
const { createMapCatalog } = require("../game/maps/catalog");
const europe = require("../shared/maps/europe-v1");
const { practiceTools } = require("./helpers/practice-tools"), { botMap } = require("./helpers/bot-map");
const { match, random } = require("./helpers/bot-match");
const { routeSetKey } = require("../backend/practice-planner");
const { createLegacyAutomaticPlay } = require("../game/compat/legacy-automatic-play");
const baseline = require("./fixtures/bots-europe-v1.json");
const reference = { id: "bot-fixture", version: "1" };
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function runtime() {
  const engine = E.createEngine({ maps: createMapCatalog([europe, botMap(), botMap("2")]) });
  // A correct bot never consults compatibility exports, even on Europe.
  for (const key of ["COLORS", "TICKETS", "CITIES", "ROUTES", "SCORE", "pay"])
    Object.defineProperty(engine, key, { get() { throw Error(`Legacy bot dependency: ${key}`); } });
  return engine;
}
function setup(engine, mapRef = reference, seed = 9) {
  const g = engine.newGame(["A", "B"], 0, 0, null, { mapRef, random: random(seed) });
  for (let seat = 0; seat < 2; seat++) engine.action(g, seat, { type: "choose_initial", indexes: [0, 1] }, { now: 0, random: random(seed) });
  return g;
}

test("Europe bot decisions and results match the three pre-migration seeded traces", () => {
  for (const expected of baseline.games) {
    const trace = [];
    const result = match({ ...expected.options, onAction: ({ action, seat }) => trace.push([seat, action]) });
    assert.equal(trace.length, expected.decisions);
    assert.equal(hash(trace), expected.trace_sha256);
    assert.deepEqual(result, expected.result);
  }
});

test("route set identity is order independent, delimiter safe and preserves numeric versus string IDs", () => {
  const key = ids => routeSetKey(ids.map(id => ({ id })));
  assert.equal(key(["rail-03", "__proto__", "0"]), key(["0", "rail-03", "__proto__"]));
  assert.notEqual(key(["a,b", "c"]), key(["a", "b,c"]));
  assert.notEqual(key([0]), key(["0"]));
});

test("sampled worlds use only their map's tickets and preserve references, counts and card inventory", () => {
  const engine = runtime();
  for (const mapRef of [reference, { ...reference, version: "2" }, { id: "europe", version: "1" }]) {
    const g = setup(engine, mapRef), { P, S, context } = practiceTools(engine, g);
    const before = structuredClone(g), observed = P.observe(g, 0);
    const sampled = S.sampleWorld(observed, 0, {}, random(21));
    assert.deepEqual(sampled.mapRef, g.mapRef); assert.deepEqual(sampled.rulesRef, g.rulesRef);
    assert.equal(sampled.schemaVersion, g.schemaVersion);
    assert.notEqual(sampled.mapRef, g.mapRef);
    assert.deepEqual(sampled.players.map(p => p.hand.length), g.players.map(p => p.hand.length));
    assert.deepEqual(sampled.players.map(p => p.tickets.length), g.players.map(p => p.tickets.length));
    assert.equal(sampled.shortDeck.length, g.shortDeck.length);
    assert.equal(sampled.deck.length, g.deck.length);
    const ids = new Set(context.tickets.map(t => t.id)), tickets = [...sampled.shortDeck, ...sampled.players.flatMap(p => p.tickets)];
    assert.ok(tickets.every(t => ids.has(t.id))); assert.equal(new Set(tickets.map(t => t.id)).size, tickets.length);
    const cards = [...sampled.deck, ...sampled.face, ...sampled.discard, ...sampled.players.flatMap(p => p.hand)];
    for (const { color, count } of context.rules.setup.trainCards) assert.equal(cards.filter(c => c === color).length, count);
    assert.deepEqual(g, before);
    assert.equal(engine.restoreState(sampled).mapRef.id, mapRef.id);
    assert.throws(() => P.points({ n: 5 }), /Unsupported route length/);
  }
});

test("lookahead executes hypothetical actions through the same engine and map context", () => {
  const engine = runtime(), g = setup(engine), seen = [];
  g.players[0].hand = Array(10).fill("red");
  const apply = engine.action;
  engine.action = (world, seat, action, options) => { seen.push(world.mapRef); return apply(world, seat, action, options); };
  const { P, S } = practiceTools(engine, g), before = structuredClone(g);
  const result = S.chooseLookahead(P.observe(g, 0), 0, [
    { type: "claim", routeId: "__proto__", color: "red" }, { type: "claim", routeId: "chord-0", color: "red" },
  ], { known: {}, retired: new Set() }, random(12));
  assert.equal(result.branches, 4); assert.ok(result.nodes > 4); assert.ok(seen.length > 4);
  assert.ok(seen.every(ref => ref.id === reference.id)); assert.deepEqual(g, before);
});

test("bots cannot inspect hidden cards or ticket contents while sampling a custom map", () => {
  const engine = runtime(), bots = createBots({ engine }), g = setup(engine), hidden = structuredClone(g);
  const lengthOnly = items => new Proxy({ length: items.length }, { get(target, key) {
    if (key === "length") return target.length;
    throw Error(`Hidden information read: ${String(key)}`);
  } });
  hidden.deck = lengthOnly(hidden.deck); hidden.discard = lengthOnly(hidden.discard); hidden.shortDeck = lengthOnly(hidden.shortDeck);
  hidden.players[1].hand = lengthOnly(hidden.players[1].hand); hidden.players[1].tickets = lengthOnly(hidden.players[1].tickets);
  for (const field of ["pending", "offer"]) Object.defineProperty(hidden.players[1], field, { get() { throw Error(`Hidden rival ${field}`); } });
  assert.deepEqual(bots.chooseBotAction(g, 0, random(7)), bots.chooseBotAction(hidden, 0, random(7)));
});

test("stations and destination opportunities use the custom map, including retired tickets", () => {
  const engine = runtime(), g = setup(engine), { P, T } = practiceTools(engine, g);
  g.routes.forEach(r => { r.owner = 1; }); g.players[0].hand = ["red"];
  g.players[0].tickets = [{ id: "test-ticket", a: "town-0", b: "town-1", p: 20 }];
  const stations = T.stationCandidates(P.observe(g, 0), 0);
  assert.ok(stations.length > 0); assert.ok(stations.every(s => ["town-0", "town-1"].includes(s.action.city)));
  const action = createBots({ engine }).chooseBotAction(g, 0, random(4));
  assert.equal(action.type, "station"); engine.action(g, 0, action, { now: 1 });
  assert.equal(g.players[0].placed[0], action.city);
  g.routes.forEach(r => { r.owner = 0; }); g.current = 0; g.players[0].tickets = []; g.finalRemaining = 1;
  const observation = P.observe(g, 0);
  assert.equal(T.ticketOpportunity(observation, 0, null).action.type, "draw_tickets");
  assert.equal(T.ticketOpportunity(observation, 0, null, new Set(engine.contextFor(g).tickets.map(t => t.id))), null);
});

test("replacement and practice bots settle opaque tunnel IDs and enforce ferry payment", () => {
  const engine = runtime(), bots = createBots({ engine });
  for (const policy of [bots.chooseBotAction, bots.chooseReplacementAction]) {
    const g = setup(engine); g.players[0].hand = Array(9).fill("red"); g.deck = ["blue", "green", "red"]; g.discard = [];
    engine.action(g, 0, { type: "claim", routeId: "a,b", color: "red" }, { now: 1 });
    assert.equal(policy(g, 0, random(1)), null);
    engine.expire(g, g.pending.until); assert.equal(g.pending.surcharge, 1);
    const action = policy(g, 0, random(1)); assert.equal(action.type, "pay_tunnel");
    engine.action(g, 0, action, { now: g.pending.until + 1 }); assert.equal(engine.routeById(g, "a,b").owner, 0);
    const ferry = setup(engine); ferry.routes.forEach(r => { if (r.id !== "a") r.owner = 1; });
    ferry.players[0].hand = Array(8).fill("red"); ferry.players[0].tickets = [];
    assert.notEqual(policy(ferry, 0, () => 0)?.type, "claim");
    ferry.players[0].hand.push("wild"); ferry.finalRemaining = 2;
    const claim = policy(ferry, 0, () => 0); assert.equal(claim.type, "claim"); assert.equal(claim.routeId, "a"); assert.equal(claim.wildCount, 1);
    engine.action(ferry, 0, claim, { now: 1 }); assert.equal(engine.routeById(ferry, "a").owner, 0);
  }
});

test("an unknown reference and an observation passed to the wrong policy context fail without mutation", () => {
  const engine = runtime(), g = setup(engine), before = structuredClone(g), tools = practiceTools(engine);
  assert.throws(() => tools.P.observe(g, 0), /another match context/);
  assert.throws(() => tools.S.sampleWorld(practiceTools(engine, g).P.observe(g, 0), 0, {}, random(1)), /another match context/);
  assert.throws(() => createBots().chooseBotAction(g, 0), { code: "UNKNOWN_MAP_VERSION" });
  assert.deepEqual(g, before);
  g.rulesRef.version = "missing";
  assert.throws(() => createBots({ engine }).chooseReplacementAction(g, 0), { code: "UNKNOWN_RULES_VERSION" });
});

test("automatic play interleaves full Europe and custom-map games, including restoration, without cross-map memory", () => {
  const engine = runtime(), rooms = [reference, { id: "europe", version: "1" }].map((mapRef, i) => ({
    game: engine.newGame(["A", "B"], 0, 0, null, { mapRef, random: random(30 + i) }),
    members: [{ name: "A", bot: true }, { name: "B", bot: true }], revision: 0,
  }));
  let time = 0, staged = 0, restored = false;
  const play = createLegacyAutomaticPlay({ engine, stageRoom: () => staged++, now: () => time, random: random(44), botRandom: random(55) });
  for (let step = 0; step < 1200 && rooms.some(r => r.game.phase !== "finished"); step++) {
    for (const room of rooms) {
      const g = room.game; if (g.phase === "finished") continue;
      time++;
      if (engine.tunnelBusy(g)) { time = Math.max(time, g.pending.until); play.expire(room); }
      else play.playPermanentBots(room);
      const cards = [...g.deck, ...g.discard, ...g.face, ...g.players.flatMap(p => p.hand),
        ...(g.phase === "tunnel" && g.pending.stage !== "result" ? g.pending.revealed : [])];
      const { rules, tickets } = engine.contextFor(g), ids = new Set(tickets.map(t => t.id));
      for (const { color, count } of rules.setup.trainCards) assert.equal(cards.filter(c => c === color).length, count);
      assert.ok(g.players.every(p => p.trains >= 0 && p.placed.length + p.stations === rules.setup.stations && p.tickets.every(t => ids.has(t.id))));
    }
    if (step === 25) { for (const room of rooms) room.game = engine.restoreState(JSON.parse(JSON.stringify(room.game))); restored = true; }
  }
  assert.ok(staged > 50); assert.ok(restored);
  for (const room of rooms) {
    assert.equal(room.game.phase, "finished", JSON.stringify({ map: room.game.mapRef, trains: room.game.players.map(p => p.trains) }));
    assert.equal(room.game.finalRemaining, 0); assert.equal(room.game.result.length, 2);
    assert.ok(room.game.result.some(r => r.winner)); assert.deepEqual(engine.restoreState(room.game), room.game);
  }
});
