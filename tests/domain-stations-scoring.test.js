"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Stations = require("../game/domain/stations"), Network = require("../game/domain/network"), Scoring = require("../game/domain/scoring");

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
const stationContext = freeze({ map: { cities: [{ id: "LIM" }, { id: 0 }, { id: "0" }] },
  rules: { colors: ["copper"], stationCosts: [2,4] } });
const scoringRules = freeze({ routePoints: { 1: 6, 2: 9 }, unusedStationPoints: 3, expressPoints: 7,
  tieBreakers: ["score","completed","stations","express"] });

test("station plans use injected costs and palette, keeping opaque city identity", () => {
  for (const remainingStations of [2,1]) {
    const state = freeze({ remainingStations, hand: ["copper","copper","copper","wild"], occupiedCities: new Set(["0"]) });
    const before = structuredClone(state);
    const decision = Stations.decideStation(state, { cityId: 0, color: "copper", cost: 0, stations: 999 }, stationContext);
    assert.equal(decision.ok, true);assert.equal(decision.plan.cityId, 0);
    assert.equal(decision.plan.payment.regular + decision.plan.payment.wild, remainingStations === 2 ? 2 : 4);
    assert.equal(Stations.canBuildStation(state, stationContext), true);
    assert.deepEqual(state, before);
  }
});

test("station availability precedes payment errors and rejected plans leave inputs untouched", () => {
  const cases = [
    [{ remainingStations: 0, hand: [] }, "LIM", "STATION_UNAVAILABLE"],
    [{ remainingStations: 2, hand: [] }, "missing", "STATION_UNAVAILABLE"],
    [{ remainingStations: 2, hand: [] }, "constructor", "STATION_UNAVAILABLE"],
    [{ remainingStations: 2, hand: [] }, "0", "STATION_UNAVAILABLE"],
    [{ remainingStations: 2, hand: ["copper"] }, "LIM", "INSUFFICIENT_STATION_PAYMENT"],
  ];
  for (const [values, cityId, code] of cases) {
    const state = freeze({ ...values, occupiedCities: new Set(["0"]) }), before = structuredClone(state);
    assert.deepEqual(Stations.decideStation(state, { cityId, color: "copper" }, stationContext), { ok: false, error: { code } });
    assert.deepEqual(state, before);
  }
  assert.equal(Stations.canBuildStation({ remainingStations: 2, hand: ["wild","wild"], occupiedCities: new Set(["LIM",0,"0"]) }, stationContext), false);
});

test("explicit station payments cannot mix colors or demand unavailable locomotives", () => {
  const state = freeze({ remainingStations: 2, hand: ["copper","copper"], occupiedCities: new Set() });
  for (const command of [{ cityId: "LIM", color: "unknown" }, { cityId: "LIM", color: "copper", wildCount: 1 }])
    assert.equal(Stations.decideStation(state, command, stationContext).ok, false);
  const wilds = Stations.decideStation({ ...state, hand: ["wild","wild"] }, { cityId: "LIM", color: "wild" }, stationContext);
  assert.deepEqual(wilds.plan.payment, { color: "wild", regular: 0, wild: 2 });
});

test("a station chooses one shared loan for competing destinations, never one per ticket", () => {
  const context = freeze({ map: { routes: [
    { id: "SA090", a: "A", b: "B", length: 2 }, { id: 41, a: "A", b: "C", length: 2 },
    { id: "free", a: "A", b: "D", length: 1 },
  ] } });
  const state = freeze({ seat: 0, placed: ["A"], owners: new Map([["SA090",1],[41,1]]), tickets: [
    { id: "T1", a: "A", b: "B", points: 10 }, { id: "T2", a: "A", b: "C", points: 6 },
    { id: "T3", a: "A", b: "D", points: 50 },
  ] });
  const before = structuredClone(state);
  assert.deepEqual(Stations.assignStations(state, context), { tickets: [true,false,false], completed: 1, score: -46, assigned: ["SA090"] });
  assert.deepEqual(state, before);
});

test("station loans are optimized jointly, can borrow from seat zero and resolve IDs without array offsets", () => {
  const map = { routes: [
    { id: "own", a: "A", b: "B", length: 2 }, { id: 0, a: "B", b: "C", length: 1 },
    { id: "0", a: "C", b: "D", length: 1 }, { id: 90, a: "B", b: "E", length: 1 },
  ] };
  const state = freeze({ seat: 1, placed: ["B","C"], owners: new Map([["own",1],[0,0],["0",0],[90,0]]), tickets: [
    { id: "long", a: "A", b: "D", points: 9 }, { id: "short", a: "A", b: "C", points: 4 },
  ] });
  for (const routes of [map.routes, [...map.routes].reverse()]) {
    const context = freeze({ map: { routes } });
    const assignment = Stations.assignStations(state, context);
    assert.deepEqual(assignment, { tickets: [true,true], completed: 2, score: 13, assigned: [0,"0"] });
    const detail = Scoring.destinationDetails(state, context, assignment);
    assert.deepEqual(detail.paths[0], { id: "long", routes: ["own",0,"0"], stationRoutes: [0,"0"],
      stations: [{ city: "B", routeId: 0, seat: 1 }, { city: "C", routeId: "0", seat: 1 }] });
    assert.equal(detail.progress[0].viaStation, true);
  }
});

test("station ties prefer no unnecessary loan and never borrow an unclaimed route", () => {
  const state = freeze({ seat: 0, placed: ["A"], owners: new Map([[1,0],[2,1]]), tickets: [{ id: 0, a: "A", b: "B", points: 7 }] });
  const context = freeze({ map: { routes: [{ id: 1, a: "A", b: "B", length: 2 }, { id: 2, a: "A", b: "C", length: 1 }] } });
  assert.deepEqual(Stations.assignStations(state, context).assigned, [null]);
  assert.deepEqual(Scoring.destinationDetails(state, context).paths[0].stationRoutes, []);
  assert.equal(Scoring.destinationDetails(state, context).progress[0].viaStation, false);
});

test("network paths preserve numeric zero and special string identities", () => {
  const routes = freeze([{ id: "r9", a: "__proto__", b: 0, length: 2 }, { id: 42, a: 0, b: "0", length: 3 }]);
  assert.equal(Network.connected(routes,"__proto__","0"), true);
  assert.deepEqual(Network.connectionPath(routes,"__proto__","0"), ["r9",42]);
  assert.deepEqual(Network.connectionPath(routes,"0",0), [42]);
  assert.deepEqual(Network.connectionPath(routes,"0","missing"), []);
  assert.deepEqual(Network.longestTrail(routes), { length: 5, routes: ["r9",42], cities: ["__proto__",0,"0"] });
});

test("longest trail permits cycles and parallel lanes but never reuses a lane", () => {
  const routes = freeze([
    { id: "ab", a: "A", b: "B", length: 2 }, { id: "bc", a: "B", b: "C", length: 3 },
    { id: "ca", a: "C", b: "A", length: 4 }, { id: "parallel", a: "A", b: "B", length: 5 },
    { id: "tail", a: "B", b: "D", length: 1 },
  ]);
  const trail = Network.longestTrail(routes);
  assert.equal(trail.length, 15);assert.equal(new Set(trail.routes).size, 5);
  trail.routes.forEach((id,i)=>assert.deepEqual(new Set([routes.find(r=>r.id===id).a,routes.find(r=>r.id===id).b]),new Set(trail.cities.slice(i,i+2))));
  const branch = ["B","C","D"].map(b=>({id:b,a:"A",b,length:1}));
  assert.equal(Network.longestTrail(branch).length, 2);
  assert.deepEqual(Network.longestTrail([]), { length: 0, routes: [], cities: [] });
});

test("longest trail supports more than 32 lanes and chooses the best disconnected component", () => {
  const chain = Array.from({length:34},(_,i)=>({id:`SA${100-i}`,a:i,b:i+1,length:1}));
  const trail = Network.longestTrail(freeze([...chain,{id:"island",a:"X",b:"Y",length:2}]));
  assert.equal(trail.length, 34);assert.equal(new Set(trail.routes).size, 34);
  assert.ok(!trail.routes.includes("island"));
});

function scoringFixture() {
  return { state: { owners: new Map([["a",0],[42,1]]), players: [
    { name: "A", score: 11, stations: 1, placed: ["B"], tickets: [{id:"yes",a:"A",b:"B",points:5},{id:"no",a:"A",b:"D",points:7}] },
    { name: "B", score: 9, stations: 2, placed: [], tickets: [] },
    { name: "C", score: 0, stations: 3, placed: [], tickets: [] },
  ] }, context: { map: { routes: [{id:"a",a:"A",b:"B",length:2},{id:42,a:"C",b:"D",length:2}] }, rules: scoringRules } };
}

test("score and audit use supplied bonuses, signed destinations, ties and recorded route adjustment", () => {
  const f = freeze(scoringFixture()), before = structuredClone(f);
  const results = Scoring.scoreMatch(f.state, f.context);
  assert.deepEqual(results.map(r=>[r.seat,r.score,r.express,r.winner]), [[1,22,7,true],[0,19,7,false],[2,9,0,false]]);
  const a = results.find(r=>r.seat===0);
  assert.equal(a.destination,-2);assert.equal(a.completed,1);assert.equal(a.details.routeAdjustment,2);
  assert.deepEqual(a.details.destinations.map(t=>t.points), [5,-7]);
  assert.deepEqual(a.details.express.tiedSeats,[1,0]);assert.equal(a.details.express.length,2);
  assert.deepEqual(a.details.totals,{routes:11,destinations:-2,stations:3,express:7,total:19});
  assert.deepEqual(f,before);
});

test("borrowed routes can complete destinations but never count toward the player's longest trail", () => {
  const f = scoringFixture();f.state.players[0].placed=["C"];f.state.players[0].tickets=[{id:"loan",a:"C",b:"D",points:20}];
  const a = Scoring.scoreMatch(freeze(f.state),freeze(f.context)).find(r=>r.seat===0);
  assert.equal(a.destination,20);assert.deepEqual(a.stationRoutes,[42]);
  assert.deepEqual(a.details.express.routes,["a"]);assert.equal(a.longest,2);
});

test("empty networks retain the existing express tie and zero bonuses do not corrupt the audit", () => {
  const f = scoringFixture();f.context.map.routes=[];f.state.owners=new Map();f.state.players.forEach(p=>{p.score=0;p.tickets=[];});
  const results = Scoring.scoreMatch(f.state,f.context);
  assert.ok(results.every(r=>r.longest===0&&r.express===7));
  const zero = Scoring.scoreMatch(f.state,{...f.context,rules:{...scoringRules,expressPoints:0,unusedStationPoints:0}});
  assert.ok(zero.every(r=>r.score===0&&r.winner));
  assert.equal(zero[0].details.stations.unused,1);
});

test("ranking follows each tiebreaker in order, supports shared winners and preserves input order", () => {
  const base = {score:100,completed:3,stations:6,express:7};
  for (const field of scoringRules.tieBreakers) {
    const lesser = {...base};
    for (const lower of scoringRules.tieBreakers.slice(scoringRules.tieBreakers.indexOf(field)+1)) lesser[lower]=999;
    const rows = freeze([{seat:0,...lesser},{seat:1,...base,[field]:base[field]+1}]);
    const ranked = Scoring.rankResults(rows,scoringRules);
    assert.deepEqual(ranked.map(r=>r.seat),[1,0]);assert.equal(ranked[0].winner,true);assert.equal(ranked[1].winner,false);
  }
  const tied = Scoring.rankResults(freeze([{seat:2,...base},{seat:0,...base},{seat:1,...base,score:99}]),scoringRules);
  assert.deepEqual(tied.map(r=>[r.seat,r.winner]),[[2,true],[0,true],[1,false]]);
  assert.deepEqual(Scoring.rankResults([{...base,seat:0,express:0},{...base,seat:1,score:1}],{tieBreakers:["express","score"]}).map(r=>r.seat),[1,0]);
});

test("explaining a stored result preserves its totals and station assignment without rescoring", () => {
  const f = scoringFixture(), rows = Scoring.scoreMatch(f.state,f.context);
  const stored = rows.find(r=>r.seat===0);stored.route=99;stored.score=107;stored.winner=true;delete stored.details;
  const before = structuredClone(stored);freeze(stored);
  const details = Scoring.resultDetails(freeze(f.state),stored,rows,freeze(f.context));
  assert.equal(details.routeAdjustment,90);assert.equal(details.totals.total,107);assert.equal(details.totals.routes,99);
  assert.deepEqual(stored,before);
});
