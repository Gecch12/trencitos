"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { decideRouteClaim } = require("../game/domain/route-claim");

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
function fixture() {
  return {
    state: {seat:0,playerCount:4,hand:["copper","copper","wild"],trains:5,owners:new Map()},
    context: {map:{routes:[
      {id:"SA010",a:"A",b:"B",corridorId:"AB",length:2,color:"gray",ferry:1,tunnel:false},
      {id:"SA001",a:"B",b:"A",corridorId:"AB",length:2,color:"copper",ferry:0,tunnel:true},
      {id:42,a:"A",b:"C",corridorId:"AC",length:1,color:"copper",ferry:0,tunnel:false},
    ]},rules:{colors:["copper"],routePoints:{1:4,2:9},doubleRoutesMinPlayers:4}},
  };
}
function decide(f, command) {
  const before = structuredClone(f);
  freeze(f);
  const result = decideRouteClaim(f.state, freeze(command), f.context);
  assert.deepEqual(f, before); // Object.freeze does not protect Map entries.
  return result;
}

test("claim plans use opaque IDs, injected scores and palette, independent of list order", () => {
  const command = {routeId:"SA010",color:"copper"};
  for (const reverse of [false,true]) {
    const f = fixture();
    if (reverse) f.context.map.routes.reverse();
    assert.deepEqual(decide(f, command), {ok:true,plan:{kind:"build",routeId:"SA010",payment:{color:"copper",regular:1,wild:1},length:2,points:9}});
  }
});

test("a numeric ID is an identity, never an array offset or a coerced string", () => {
  assert.equal(decide(fixture(), {routeId:42}).plan.routeId, 42);
  assert.deepEqual(decide(fixture(), {routeId:0}), {ok:false,error:{code:"ROUTE_UNAVAILABLE"}});
  assert.deepEqual(decide(fixture(), {routeId:"42"}), {ok:false,error:{code:"ROUTE_UNAVAILABLE"}});
});

test("colored tunnels return a reservation plan using their own color", () => {
  const f = fixture();
  const result = decide(f, {routeId:"SA001",color:"invalid"});
  assert.deepEqual(result, {ok:true,plan:{kind:"tunnel",routeId:"SA001",payment:{color:"copper",regular:2,wild:0},length:2,points:9}});
  result.plan.payment.regular = 0;
  assert.deepEqual(f.state.hand, ["copper","copper","wild"]);
});

test("parallel ownership obeys both the owner and the injected player threshold", () => {
  for (const playerCount of [2,3,4,5]) for (const owner of [0,1]) {
    const f = fixture();f.state.playerCount=playerCount;f.state.owners.set("SA001",owner);
    assert.equal(decide(f, {routeId:"SA010",color:"copper"}).ok, playerCount>=4 && owner!==0);
  }
  const f = fixture();f.state.owners.set("SA001",1);f.context.rules.doubleRoutesMinPlayers=5;
  assert.deepEqual(decide(f,{routeId:"SA010",color:"copper"}), {ok:false,error:{code:"ROUTE_UNAVAILABLE"}});
});

test("legacy parallel lanes use reversed endpoints without blocking adjacent corridors", () => {
  const f=fixture();f.state.playerCount=2;f.state.owners.set("SA001",1);
  for(const route of f.context.map.routes) delete route.corridorId;
  assert.deepEqual(decide(f,{routeId:"SA010",color:"copper"}), {ok:false,error:{code:"ROUTE_UNAVAILABLE"}});
  const other=fixture();other.state.playerCount=2;other.state.owners.set(42,1);
  assert.equal(decide(other,{routeId:"SA010",color:"copper"}).ok,true);
});

test("business errors are structured and keep availability, trains, color, payment precedence", () => {
  const cases = [
    [f=>{f.state.owners.set("SA010",1);f.state.trains=0;}, "ROUTE_UNAVAILABLE"],
    [f=>{f.state.trains=1;}, "INSUFFICIENT_TRAINS"],
    [()=>{}, "INVALID_PAYMENT_COLOR"],
  ];
  for(const [change,code] of cases) {
    const f=fixture();change(f);
    assert.deepEqual(decide(f,{routeId:"SA010",color:"invalid"}), {ok:false,error:{code}});
  }
  const f=fixture();f.state.hand=["copper","copper"];
  assert.deepEqual(decide(f,{routeId:"SA010",color:"copper"}), {ok:false,error:{code:"INSUFFICIENT_PAYMENT"}});
});

test("the policy trusts map/rules data for costs and ownership, not client payload fields", () => {
  const f=fixture();
  const result=decide(f,{routeId:"SA010",color:"copper",length:0,points:999,owner:0,ferry:0,tunnel:true});
  assert.equal(result.plan.length,2);assert.equal(result.plan.points,9);
  assert.equal(result.plan.payment.wild,1);assert.equal(result.plan.kind,"build");
});

test("domain modules run without ambient clock, randomness, transport or external imports", () => {
  const forbidden=()=>{throw Error("Ambient dependency in domain");};
  const math=Object.create(Math);math.random=forbidden;
  const cache={};
  function load(name) {
    if(!["payment","route-claim","tunnel","turn","random","setup","destinations"].includes(name)) return forbidden();
    if(cache[name]) return cache[name];
    const module={exports:{}};
    const source=fs.readFileSync(path.join(__dirname,"../game/domain",`${name}.js`),"utf8");
    vm.runInNewContext(source,{module,require:id=>["./payment","./random"].includes(id)?load(id.slice(2)):forbidden(),
      Date:class {constructor(){forbidden();}static now(){forbidden();}},Math:math,fetch:forbidden,setTimeout:forbidden}, {filename:name});
    return cache[name]=module.exports;
  }
  const f=fixture();
  const result=load("route-claim").decideRouteClaim(f.state,{routeId:"SA010",color:"copper"},f.context);
  assert.equal(result.ok,true);assert.equal(result.plan.points,9);
  const rules={colors:["copper"],cardMs:10,resultMs:30,initialMs:100,turnMs:200,finalTrainThreshold:2};
  const tunnel=load("tunnel"),turn=load("turn"),context={now:10,rules};
  const pending=tunnel.beginTunnel({routeId:"SA001",base:{color:"copper",regular:1,wild:0},revealed:["copper"],
    turnDeadline:100,offerDeadlines:[null]},context);
  const reveal=tunnel.advanceTunnel({tunnel:pending,turnDeadline:null},{now:30,rules});
  assert.equal(reveal.kind,"decision");
  const paid=tunnel.decideTunnel({tunnel:{...pending,...reveal.pendingChanges},hand:["copper","wild"]},{type:"pay"},{now:40,rules});
  assert.equal(paid.ok,true);
  const state={phase:"play",current:0,players:[{trains:2},{trains:4}],finalRemaining:null};
  assert.equal(turn.planTurnStart(state,context).changes.turnDeadline,210);
  assert.equal(turn.planNextTurn(state,context).finalRoundStarted,true);
  const setup=load("setup"),destinations=load("destinations"),ticketRules={initialMinimum:1,offerMinimum:1,offerCount:2,offerClock:{kind:"fixed",durationMs:100}};
  const created=setup.prepareGame({names:["A","B"],first:0},{map:{tickets:[{id:"D1"},{id:"D2"}]},random:max=>max-1,
    rules:{minPlayers:2,maxPlayers:2,maxNameLength:10,playerColors:["a","b"],trainCards:[{color:"copper",count:4}],initialHand:1,initialLongTickets:0,initialShortTickets:1,trains:5,stations:1}});
  assert.equal(created.ok,true);
  assert.equal(destinations.decideInitialChoice(created.plan,{seat:0,indexes:[0]},{rules:ticketRules}).ok,true);
  const offer=destinations.planOffer({shortDeck:[{id:"D3"}]},{now:10,rules:ticketRules}).plan.offer;
  assert.equal(destinations.decideOfferChoice({offer},{offerId:offer.id,indexes:[0]},{rules:ticketRules}).ok,true);
  assert.equal(destinations.randomSelection(offer.tickets,1,{random:()=>0})[0],0);
});
