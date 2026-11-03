"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const { createMapCatalog, validateMapDefinition, validateMapForRules } = require("../game/maps/catalog");
const europe = require("../shared/maps/europe-v1");
const { decideRouteClaim } = require("../game/domain/route-claim");

function mini() {
  return { schemaVersion:1,id:"test-map",version:"1",
    cities:[{id:"A",name:"Alpha"},{id:"B",name:"Beta"},{id:"C",name:"Gamma"}],
    corridors:[{id:"AB",cityIds:["A","B"]},{id:"BC",cityIds:["B","C"]}],
    routes:[
      {id:"rail-90",corridorId:"AB",a:"A",b:"B",length:2,color:"copper",tunnel:false,ferry:0},
      {id:"rail-03",corridorId:"AB",a:"B",b:"A",length:2,color:"gray",tunnel:false,ferry:1},
      {id:"rail-50",corridorId:"BC",a:"B",b:"C",length:1,color:"copper",tunnel:true,ferry:0}],
    tickets:[{id:"journey-17",a:"A",b:"C",points:4,kind:"short"}] };
}
const rules = () => ({colors:["copper"],routePoints:{1:1,2:2},capabilities:{tunnels:true,ferries:true},doubleRoutesMinPlayers:4});
const code = expected => error => error.code === expected;

test("catalog holds explicit versions, isolates input and exposes only frozen definitions and references", () => {
  const source = mini(), next = mini(); next.version="2"; next.cities[0].name="Changed";
  const catalog = createMapCatalog([europe,source,next]); source.routes.length=0;
  assert.deepEqual(catalog.list(),[{id:"europe",version:"1"},{id:"test-map",version:"1"},{id:"test-map",version:"2"}]);
  const map=catalog.get({id:"test-map",version:"1"});assert.equal(map.routes.length,3);
  assert.equal(catalog.get({id:"test-map",version:"2"}).cities[0].name,"Changed");
  assert.throws(()=>{map.cities[0].name="Mutated";},TypeError);
  assert.throws(()=>map.routes.push({}),TypeError);assert.throws(()=>catalog.list().pop(),TypeError);
  assert.equal(europe.routes.length,101);
});

test("missing, malformed and duplicate versions fail explicitly without falling back to Europe", () => {
  const catalog=createMapCatalog([europe,mini()]);
  for(const ref of [{id:"missing",version:"1"},{id:"europe",version:"2"}]) assert.throws(()=>catalog.get(ref),code("UNKNOWN_MAP_VERSION"));
  for(const ref of [null,"europe",{id:"europe"},{id:"europe",version:1},{id:"europe",version:""},{id:"europe",version:"1",extra:true}]) {
    assert.throws(()=>catalog.get(ref),code("INVALID_MAP_REFERENCE"));
  }
  assert.throws(()=>createMapCatalog([mini(),mini()]),code("DUPLICATE_MAP_VERSION"));
  const map=mini();map.schemaVersion=2;assert.throws(()=>createMapCatalog([map]),code("UNSUPPORTED_MAP_SCHEMA"));
});

test("definition validation rejects state, layout, missing fields and ambiguous identities", () => {
  const changes=[m=>{m.owner=0;},m=>{m.cities[0].x=10;},m=>{m.routes[0].owner=null;},m=>{delete m.version;},
    m=>{m.cities[0].name=" ";},m=>{m.cities[1].id="A";},m=>{m.routes[1].id="rail-90";},
    m=>{m.routes[0].id=90;},m=>{m.corridors[1].id="AB";},m=>{m.tickets.push({...m.tickets[0]});}];
  for(const change of changes){const map=mini();change(map);assert.throws(()=>createMapCatalog([map]),code("INVALID_MAP_DEFINITION"));}
});

test("routes, corridors and destinations must agree and all cities must be reachable", () => {
  const changes=[m=>{m.routes[0].a="missing";},m=>{m.routes[0].b="A";},m=>{m.routes[0].corridorId="BC";},
    m=>{m.corridors[0].cityIds=["A"];},m=>{m.corridors[0].cityIds=["A","A"];},
    m=>{m.corridors.push({id:"alternate-AB",cityIds:["B","A"]});m.routes[1].corridorId="alternate-AB";},
    m=>{m.routes=m.routes.filter(r=>r.corridorId!=="BC");},m=>{m.cities.push({id:"D",name:"Isolated"});},
    m=>{m.tickets[0].b="missing";},m=>{m.tickets[0].b="A";}];
  for(const change of changes){const map=mini();change(map);assert.throws(()=>validateMapDefinition(map),code("INVALID_MAP_DEFINITION"));}
});

test("numeric quantities and route flags are checked before a map is registered", () => {
  const changes=[m=>{m.routes[0].length=0;},m=>{m.routes[0].length=1.5;},m=>{m.routes[0].length="2";},
    m=>{m.routes[0].length=Infinity;},m=>{m.routes[0].ferry=-1;},m=>{m.routes[0].ferry=3;},
    m=>{m.routes[0].ferry=0.5;},m=>{m.routes[0].tunnel=1;},m=>{m.routes[0].color="";},
    m=>{m.tickets[0].points=0;},m=>{m.tickets[0].points="4";},m=>{m.tickets[0].kind="special";}];
  for(const change of changes){const map=mini();change(map);assert.throws(()=>validateMapDefinition(map),code("INVALID_MAP_DEFINITION"));}
});

test("rules must supply route scores, colors and the mechanics required by the map", () => {
  const map=mini();assert.equal(validateMapForRules(map,rules()),map);
  for(const change of [r=>{delete r.routePoints[2];},r=>{r.routePoints[2]=NaN;},r=>{r.colors=["red"];},
    r=>{r.capabilities.tunnels=false;},r=>{r.capabilities.ferries=false;},r=>{r.capabilities.ferries="true";}]) {
    const r=rules();change(r);assert.throws(()=>validateMapForRules(map,r),code("INCOMPATIBLE_MAP_RULES"));
  }
  assert.throws(()=>validateMapForRules(map,null),code("INCOMPATIBLE_MAP_RULES"));
});

test("Europe and an opaque-ID map can drive the same construction policy independently of array order", () => {
  const other=mini();other.routes.reverse();other.cities.reverse();other.corridors.reverse();
  const catalog=createMapCatalog([europe,other]);
  const map=catalog.get({id:"test-map",version:"1"}), state={seat:0,playerCount:4,hand:["copper","wild"],trains:45,owners:new Map()};
  const result=decideRouteClaim(state,{routeId:"rail-03",color:"copper",wildCount:1},{map,rules:rules()});
  assert.equal(result.ok,true);assert.equal(result.plan.routeId,"rail-03");assert.equal(result.plan.points,2);
  state.owners.set("rail-90",1);state.playerCount=3;
  assert.equal(decideRouteClaim(state,{routeId:"rail-03",color:"copper",wildCount:1},{map,rules:rules()}).ok,false);
  const eu=catalog.get({id:"europe",version:"1"});
  assert.equal(decideRouteClaim({...state,owners:new Map(),hand:["purple"]},{routeId:"eu-route-007"},
    {map:eu,rules:{...rules(),colors:["purple"],routePoints:{1:1}}}).plan.routeId,"eu-route-007");
});

test("opaque IDs with prototype-like names and version delimiters do not collide", () => {
  const first=mini(),second=mini();first.id="x:y";first.version="z";second.id="x";second.version="y:z";
  first.routes[0].id="__proto__";second.routes[0].id="constructor";
  const catalog=createMapCatalog([first,second]);assert.equal(catalog.get({id:"x:y",version:"z"}).routes[0].id,"__proto__");
  assert.equal(catalog.get({id:"x",version:"y:z"}).routes[0].id,"constructor");
});

test("catalog policies need no transport, file, clock or random dependency", () => {
  const forbidden=()=>{throw Error("ambient dependency");},module={exports:{}},math=Object.create(Math);math.random=forbidden;
  vm.runInNewContext(fs.readFileSync(require.resolve("../game/maps/catalog"),"utf8"),{
    module,structuredClone,require:forbidden,fetch:forbidden,Date:{now:forbidden},Math:math,setTimeout:forbidden });
  const catalog=module.exports.createMapCatalog([mini()]);assert.equal(catalog.get({id:"test-map",version:"1"}).routes.length,3);
});
