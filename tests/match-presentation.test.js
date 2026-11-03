"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), crypto = require("node:crypto");
const Presentation = require("../frontend/match-presentation"), UI = require("../frontend/game-ui"), E = require("../backend/engine");
const europeLayout = require("../frontend/layouts/europe-v1"), {engine,layout,reference} = require("./helpers/client-map");
const legacy = require("./fixtures/replay-europe-v1.json"), Replay = require("../shared/replay-state");
const make = () => { const game=engine.newGame(["A","B"],0,0,null,{mapRef:reference}); return {game,view:engine.view(game,0),definition:engine.definition(game)}; };

test("client context resolves opaque IDs and names independently of array order and keeps contexts isolated",()=>{
  const resolver=Presentation.create({layouts:[europeLayout,layout]}), {view,definition}=make(), before=JSON.stringify({view,definition});
  const one=resolver.resolve(view,definition);
  for(const route of definition.map.routes) { assert.equal(one.geometryFor(route.id).cells.length,route.n); assert.equal(one.routeIdFromDom(String(route.id)),route.id); }
  assert.equal(one.routeIdFromDom("__proto__"),"__proto__"); assert.equal(one.routeIdFromDom("0"),"0");
  assert.equal(one.ticketIdFromDom('ticket"[odd]'),'ticket"[odd]'); assert.equal(one.ticketIdFromDom("missing"),undefined);
  assert.equal(one.cityName("A"),"Alpha"); assert.equal(resolver.resolve(view,structuredClone(definition)),one);
  const other=structuredClone(definition); other.map.routes.reverse(); other.map.cities.reverse(); other.map.tickets.reverse();
  const two=resolver.resolve({...view,routes:[...view.routes].reverse()},other);
  for(const route of definition.map.routes) assert.deepEqual(two.geometryFor(route.id),one.geometryFor(route.id));
  const euro=E.newGame(["E","U"]), three=resolver.resolve(E.view(euro,0),E.definition(euro));
  assert.equal(three.routeIdFromDom("0"),0); assert.equal(three.cityName("PAR"),"Paris"); assert.equal(three.cityName("A"),"A");
  assert.equal(one.cityName("A"),"Alpha"); assert.equal(JSON.stringify({view,definition}),before);
  definition.map.cities[0].name="changed"; layout.cities.A[0]++;
  assert.equal(one.cityName("A"),"Alpha"); assert.equal(one.layout.cities.A[0],80); layout.cities.A[0]--;
});

test("only an entirely legacy replay uses the frozen Europe fallback; current missing or incompatible data fail",()=>{
  const resolver=Presentation.create();
  for(let i=0;i<legacy.record.frames.length;i++) {
    const state=Replay.at(legacy.record.frames,i), view=state.views[0], before=JSON.stringify(state);
    assert.equal(resolver.resolve(view,undefined,{replay:true}).legacy,true);
    assert.throws(()=>resolver.resolve(view),/compatible/);
    assert.equal(JSON.stringify(state),before);
    assert.throws(()=>resolver.resolve({...view,mapRef:{id:"europe",version:"1"}},undefined,{replay:true}),/compatible/);
  }
  const game=E.newGame(["A","B"]), view=E.view(game,0), definition=E.definition(game);
  assert.equal(resolver.resolve(view,definition,{replay:true}).legacy,false);
  for(const corrupt of [undefined,null,{...definition,schemaVersion:2},{...definition,rulesRef:{id:"other",version:"1"}}])
    assert.throws(()=>resolver.resolve(view,corrupt,{replay:true}),/compatible/);
  assert.throws(()=>resolver.resolve({...view,mapRef:{id:"europe",version:"2"}},{...definition,mapRef:{id:"europe",version:"2"}}),/diseño/);
  const missing=structuredClone(view); missing.routes.pop(); assert.throws(()=>resolver.resolve(missing,definition),/compatible/);
  const renamed=structuredClone(view); renamed.routes[0].id="wrong"; assert.throws(()=>resolver.resolve(renamed,definition),/compatible/);
});

test("client refuses ambiguous DOM identities, missing coordinates and mismatched route data",()=>{
  const {view,definition}=make();
  const resolver=Presentation.create({layouts:[layout]}), bad=structuredClone(definition);
  bad.map.routes.push({...bad.map.routes.find(r=>r.id==="0"),id:0});
  assert.throws(()=>resolver.resolve(view,bad),/compatible/);
  const wrong=structuredClone(layout); delete wrong.cities.A;
  assert.throws(()=>Presentation.create({layouts:[wrong]}).resolve(view,definition),/compatible/);
  view.routes[0].n++; assert.throws(()=>resolver.resolve(view,definition),/compatible/);
});

test("client payment and pass hints use the supplied rule values without granting authority",()=>{
  const rules={...Presentation.legacyRules,colors:["green"],doubleRoutesMinPlayers:2,setup:{stations:2},stationCosts:[2,4]};
  const game={phase:"play",current:0,drawCount:0,hand:["red","red","green","green"],players:[{trains:5,stations:2,placed:[]},{trains:5,stations:2,placed:[]}],
    routes:[{id:"0",a:"A",b:"B",n:2,color:"gray",ferry:0,owner:null},{id:"parallel",a:"B",b:"A",n:2,color:"red",ferry:0,owner:1}],face:[],deckCount:0,discardCount:0,ticketDeckCount:0};
  assert.equal(UI.construction(game,0,{routeId:"0"}).options.length,0);
  assert.deepEqual(UI.construction(game,0,{routeId:"0"},rules).options,[{color:"green",wild:0,regular:2}]);
  assert.equal(UI.construction(game,0,{city:"C"},rules).cost,2);
  game.players[0].stations=1; game.players[0].placed=["A"];
  assert.equal(UI.construction(game,0,{city:"C"},rules).cost,4);
  game.hand=["red","red"]; assert.equal(UI.canPass(game,0,["C"],rules),true);
  game.routes[1].owner=0; assert.ok(UI.construction(game,0,{routeId:"0"},rules).reason);
});

test("extracted Europe geometry preserves the frozen layout and stable double lanes",()=>{
  const frozen=require("./fixtures/europe-layout-v1.json"), sha=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const after=require("../frontend/map-layout"), routes=require("../shared/data").ROUTES;
  const expected=require("./fixtures/europe-geometry-v1.json"); assert.equal(sha(expected),frozen.network);
  // Compare numbers with a tolerance, not rounded hashes: a rounding boundary
  // can split two values that differ by only a few picounits across V8 versions.
  function compare(actual,wanted) {
    if(typeof wanted === "number") assert.ok(Math.abs(actual-wanted)<=1e-9,`${actual} ≠ ${wanted}`);
    else if(wanted && typeof wanted === "object") {
      assert.deepEqual(Object.keys(actual),Object.keys(wanted)); for(const key of Object.keys(wanted)) compare(actual[key],wanted[key]);
    } else assert.equal(actual,wanted);
  }
  compare(after.createNetwork(routes),expected);
  const reversed=new Map(after.createNetwork([...routes].reverse()).map(row=>[row.id,row]));
  for(const path of after.createNetwork(routes)) assert.deepEqual(reversed.get(path.id),path);
  for(const key of ["bounds","tile","cities","bends","labels","land","details"]) assert.equal(sha(after[key]),frozen.layout[key]);
});

test("browser classic scripts load the client read model without backend imports",()=>{
  const sandbox={structuredClone}; vm.createContext(sandbox);
  for(const file of ["shared/maps/europe-v1.js","shared/maps/europe-legacy-v1.js","shared/data.js","frontend/layouts/europe-v1.js","frontend/layouts/laboratory-v1.js","frontend/map-layout.js","frontend/match-presentation.js"])
    vm.runInContext(fs.readFileSync(require.resolve("../"+file),"utf8"),sandbox);
  const game=E.newGame(["A","B"]); sandbox.view=E.view(game,0); sandbox.definition=E.definition(game);
  assert.equal(vm.runInContext('MatchPresentation.create().resolve(view,definition).cityName("PAR")',sandbox),"Paris");
});
