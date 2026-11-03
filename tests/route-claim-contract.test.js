"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine");
const { PLAYER_COLORS } = require("../data");

// Behavioral boundary for the first extraction. Exercise the public facade,
// real Europe routes and a complete card inventory without timers or sockets.
const NOW = 1000;
const POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 6: 15, 8: 21 };
const CARDS = E.COLORS.flatMap(c => Array(12).fill(c)).concat(Array(14).fill("wild"));
function take(deck, cards) {
  for (const card of cards) {
    const index = deck.indexOf(card);
    assert.notEqual(index, -1, `fixture exhausted ${card}`);
    deck.splice(index, 1);
  }
  return [...cards];
}
function fixture(count = 4) {
  const g = {
    phase: "play", current: 0, first: 0, initialDone: count,
    players: Array.from({ length: count }, (_,i) => ({
      name: `P${i}`, color: PLAYER_COLORS[i], hand: [], tickets: [], pending: [],
      trains: 45, stations: 3, placed: [], score: 0,
    })),
    routes: E.ROUTES.map(r => ({ ...r, owner: null })),
    deck: [...CARDS], discard: [], face: [], shortDeck: [],
    finalRemaining: null, lastTrigger: null, drawCount: 0, pending: null,
    logs: [], result: null,
  };
  g.face = take(g.deck, ["blue", "green", "yellow", "black", "white"]);
  E.ensureTiming(g, NOW);
  return g;
}
function give(g, seat, cards) { g.players[seat].hand.push(...take(g.deck, cards)); }
function revealNext(g, cards) {
  take(g.deck, cards);
  g.deck.push(...[...cards].reverse());
}
function inventory(g) {
  const revealed = g.phase === "tunnel" && g.pending.stage !== "result" ? g.pending.revealed : [];
  return [...g.deck, ...g.discard, ...g.face, ...g.players.flatMap(p => p.hand), ...revealed].sort();
}
const options = now => ({ now, random: max => max - 1 });
const colorFor = r => r.color === "gray" ? "red" : r.color;
const regular = E.ROUTES.filter(r => !r.tunnel);

for (const mode of ["minimum-wild", "extra-wild", "all-wild"]) {
  test(`every ordinary/ferry route: ${mode} preserves cards, ownership, score and turn`, () => {
    for (const route of regular) {
      const g = fixture(), color = colorFor(route);
      const wild = mode === "all-wild" ? route.n : Math.min(route.n, route.ferry + (mode === "extra-wild" ? 1 : 0));
      give(g, 0, [...Array(route.n - wild).fill(color), ...Array(wild).fill("wild")]);
      const opponents = structuredClone(g.players.slice(1)), face = [...g.face], serial = g.turnSerial;
      const recorded = [];
      E.observe(g, event => recorded.push(event));
      const action = { type: "claim", routeId: route.id, color: mode === "all-wild" ? "wild" : color, wildCount: wild };
      E.action(g, 0, action, options(NOW + 50));
      assert.equal(g.routes.find(r => r.id === route.id).owner, 0, `route ${route.id}`);
      assert.equal(g.routes.filter(r => r.owner !== null).length, 1);
      assert.deepEqual(g.players[0].hand, []);
      assert.equal(g.players[0].trains, 45 - route.n);
      assert.equal(g.players[0].score, POINTS[route.n]);
      assert.equal(g.current, 1);
      assert.equal(g.turnSerial, serial + 1);
      assert.equal(g.turnDeadline, NOW + 50 + E.TURN_MS);
      assert.equal(g.phase, "play");
      assert.deepEqual(g.face, face);
      assert.deepEqual(g.players.slice(1), opponents);
      assert.deepEqual(g.discard, []);
      assert.deepEqual(inventory(g), [...CARDS].sort());
      assert.deepEqual(g.events.filter(e => e.type === "build").map(({seat,routeId}) => ({seat,routeId})), [{seat:0,routeId:route.id}]);
      assert.deepEqual(recorded, [{seat:0, action, automatic:false}]);
    }
  });
}

test("every Europe tunnel reserves the base until reveal, then builds and advances once", () => {
  for (const route of E.ROUTES.filter(r => r.tunnel)) {
    const g = fixture(), color = colorFor(route), other = E.COLORS.find(c => c !== color);
    give(g, 0, [...Array(route.n - route.ferry).fill(color), ...Array(route.ferry).fill("wild")]);
    revealNext(g, [other, other, other]);
    const hand = [...g.players[0].hand], serial = g.turnSerial;
    E.action(g, 0, {type:"claim",routeId:route.id,color,wildCount:route.ferry}, options(NOW + 50));
    assert.equal(g.routes[route.id].owner, null);
    assert.deepEqual(g.players[0].hand, hand);
    assert.equal(g.players[0].trains, 45);
    assert.equal(g.players[0].score, 0);
    assert.equal(g.turnSerial, serial);
    assert.equal(g.pending.stage, "reveal");
    assert.equal(g.pending.surcharge, 0);
    assert.deepEqual(inventory(g), [...CARDS].sort());
    const revealedAt = g.pending.until;
    assert.equal(E.expire(g, revealedAt, options().random), true);
    assert.equal(g.pending.stage, "result");
    assert.equal(g.routes[route.id].owner, 0);
    assert.equal(g.players[0].score, POINTS[route.n]);
    assert.equal(g.players[0].trains, 45 - route.n);
    assert.deepEqual(g.players[0].hand, []);
    assert.equal(g.current, 0);
    assert.deepEqual(inventory(g), [...CARDS].sort());
    assert.equal(E.expire(g, revealedAt, options().random), false);
    E.expire(g, g.pending.until, options().random);
    assert.equal(g.current, 1);
    assert.equal(g.turnSerial, serial + 1);
    assert.equal(g.events.filter(e => e.type === "build").length, 1);
    assert.deepEqual(inventory(g), [...CARDS].sort());
  }
});

test("double-route restrictions hold through claim for all player counts", () => {
  const pair = E.ROUTES.filter(r => r.a === "EDI" && r.b === "LON");
  assert.equal(pair.length, 2);
  for (const count of [2,3,4,5]) {
    const g = fixture(count), [a,b] = pair;
    give(g, 0, Array(a.n).fill(a.color));
    give(g, 1, Array(b.n).fill(b.color));
    E.action(g, 0, {type:"claim",routeId:a.id,color:a.color}, options(NOW + 1));
    const before = structuredClone(g), action = {type:"claim",routeId:b.id,color:b.color};
    if (count <= 3) {
      assert.throws(() => E.action(g, 1, action, options(NOW + 2)), /disponible/);
      assert.deepEqual(g, before);
    } else {
      E.action(g, 1, action, options(NOW + 2));
      assert.equal(g.routes[b.id].owner, 1);
    }
    assert.deepEqual(inventory(g), [...CARDS].sort());
  }
  const g = fixture(), [a,b] = pair;
  give(g, 0, [...Array(a.n).fill(a.color), ...Array(b.n).fill(b.color)]);
  E.action(g, 0, {type:"claim",routeId:a.id,color:a.color}, options(NOW + 1));
  // Put the same player back on turn to isolate the parallel-lane rule.
  g.current = 0; E.ensureTiming(g, NOW + 2);
  const before = structuredClone(g);
  assert.throws(() => E.action(g, 0, {type:"claim",routeId:b.id,color:b.color}, options(NOW + 3)), /disponible/);
  assert.deepEqual(g, before);
});

test("rejected claims before a deadline leave the entire state and randomness untouched", () => {
  const route = regular.find(r => r.color === "gray" && !r.ferry && r.n >= 2);
  const ferry = regular.find(r => r.ferry > 0);
  const cases = [
    {name:"missing route", action:{routeId:-1}},
    {name:"occupied", change:g => {g.routes[route.id].owner=1;}},
    {name:"insufficient trains", change:g => {g.players[0].trains=route.n-1;}},
    {name:"invalid gray color", action:{color:"invalid"}},
    {name:"insufficient cards", empty:true},
    {name:"invalid wildcard count", action:{wildCount:-1}},
    {name:"missing mandatory ferry wildcard", route:ferry, action:{wildCount:0}},
    {name:"wrong seat", seat:1},
    {name:"unfinished draw", change:g => {g.drawCount=1;}},
  ];
  for (const scenario of cases) {
    const g = fixture(), r = scenario.route || route;
    if (!scenario.empty) give(g, 0, Array(r.n).fill(colorFor(r)));
    scenario.change?.(g);
    const before = structuredClone(g), observations = [];
    E.observe(g, event => observations.push(event));
    const action = {type:"claim",routeId:r.id,color:colorFor(r), ...scenario.action};
    let randomCalls = 0;
    assert.throws(() => E.action(g, scenario.seat || 0, action, {now:NOW+10,random:() => {randomCalls++;return 0;}}), undefined, scenario.name);
    assert.deepEqual(g, before, scenario.name);
    assert.equal(randomCalls, 0, scenario.name);
    assert.deepEqual(observations, [], scenario.name);
  }
});

test("a late rejected claim still preserves the separately accepted timeout draws", () => {
  const g = fixture(), route = regular.find(r => r.n === 1);
  give(g, 0, [colorFor(route)]);
  const before = inventory(g), hand = g.players[0].hand.length, observed = [];
  E.observe(g, event => observed.push(event));
  assert.throws(() => E.action(g, 0, {type:"claim",routeId:route.id,color:colorFor(route)}, options(g.turnDeadline)), /turno/);
  assert.equal(g.routes[route.id].owner, null);
  assert.equal(g.players[0].hand.length, hand + 2);
  assert.equal(g.players[0].score, 0);
  assert.equal(g.current, 1);
  assert.deepEqual(observed.map(e => [e.action.type,e.automatic]), [["draw_train",true],["draw_train",true]]);
  assert.deepEqual(inventory(g), before);
});

test("a claim triggers the final round after paying and includes its builder's final turn", () => {
  const g = fixture(), route = regular.find(r => r.n === 1);
  give(g, 0, [colorFor(route)]); g.players[0].trains = 3;
  E.action(g, 0, {type:"claim",routeId:route.id,color:colorFor(route)}, options(NOW + 1));
  assert.equal(g.players[0].trains, 2);
  assert.equal(g.finalRemaining, 4);
  assert.equal(g.lastTrigger, 0);
  assert.equal(g.current, 1);
  assert.equal(g.phase, "play");
  assert.equal(g.result, null);
});
