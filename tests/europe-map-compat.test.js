"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto");
const europe=require("../shared/maps/europe-v1"),legacy=require("../shared/maps/europe-legacy-v1");
const baseline=require("./fixtures/europe-legacy-v1.json"),data=require("../shared/data"),E=require("../backend/engine");

test("versioned Europe and its frozen numeric bridge preserve every legacy city, route and ticket",()=>{
  assert.deepEqual(legacy.adapt(europe),baseline.data);
  assert.deepEqual({CITIES:data.CITIES,ROUTES:data.ROUTES,TICKETS:data.TICKETS},baseline.data);
  assert.equal(legacy.routes.find(r=>r.legacyId===51).id,"eu-route-051");
  assert.equal(legacy.tickets.find(t=>t.legacyId===45).id,"eu-ticket-045");
  assert.throws(()=>{legacy.routes[0].legacyId=10;},TypeError);
  assert.throws(()=>{europe.routes[0].length=9;},TypeError);
});

test("reordering definitions leaves legacy IDs, route order and deterministic deck order unchanged",()=>{
  const reordered=structuredClone(europe);
  for(const key of ["cities","corridors","routes","tickets"])reordered[key].reverse();
  assert.deepEqual(legacy.adapt(reordered),baseline.data);
  const copy=legacy.adapt(europe);copy.ROUTES[0].n=100;copy.TICKETS[0].p=99;copy.CITIES.EDI[2]="Changed";
  assert.deepEqual(legacy.adapt(europe),baseline.data);
});

test("the Europe bridge cannot silently accept a different map, version, missing ID or duplicate",()=>{
  for(const change of [m=>{m.id="another";},m=>{m.version="2";},m=>{m.version=1;},m=>{m.schemaVersion=2;},
    m=>{m.routes.pop();},m=>{m.routes[0].id="unknown";},m=>{m.routes[0].id=m.routes[1].id;},
    m=>{m.tickets[0].id="unknown";},m=>{m.cities[0].id="unknown";}]) {
    const map=structuredClone(europe);change(map);assert.throws(()=>legacy.adapt(map),/Europe/);
  }
});

test("browser classic scripts and Node deliver identical legacy data without server modules",()=>{
  const sources=["maps/europe-v1.js","maps/europe-legacy-v1.js","data.js"].map(file=>fs.readFileSync(require.resolve("../shared/"+file),"utf8"));
  const json=vm.runInNewContext(sources.join("\n")+"\nJSON.stringify({CITIES,ROUTES,TICKETS})");
  assert.deepEqual(JSON.parse(json),baseline.data);
});

test("complete seeded setups retain their pre-extraction fingerprints for two through five players",()=>{
  for(const count of [2,3,4,5]){
    let seed=500+count;const random=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*max);};
    const game=E.newGame(Array.from({length:count},(_,i)=>`P${i}`),1,123,null,{random});
    assert.equal(crypto.createHash("sha256").update(JSON.stringify(game)).digest("hex"),baseline.setupSha256[count]);
  }
});
