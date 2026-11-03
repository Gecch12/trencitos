"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const E=require("../backend/engine"),{createMapCatalog}=require("../game/maps/catalog");
const europe=require("../shared/maps/europe-v1"),rules=require("../backend/rules/europe-classic-v1");
const {RULES_REFERENCE}=require("../backend/match-context");
const NOW=1000,random=max=>max-1,options={now:NOW+1,random};
const clone=value=>JSON.parse(JSON.stringify(value));
const reference={id:"test-map",version:"1"};
function mini(version="1") {
  return {schemaVersion:1,id:reference.id,version,
    cities:[{id:"A",name:`Alpha ${version}`},{id:"B",name:`Beta ${version}`},{id:"C",name:`Gamma ${version}`}],
    corridors:[{id:"AB",cityIds:["A","B"]},{id:"BC",cityIds:["B","C"]},{id:"AC",cityIds:["A","C"]}],
    routes:[
      {id:"rail-90",corridorId:"AB",a:"A",b:"B",length:2,color:"red",tunnel:false,ferry:0},
      {id:"rail-03",corridorId:"AB",a:"B",b:"A",length:2,color:"gray",tunnel:false,ferry:1},
      {id:"__proto__",corridorId:"BC",a:"B",b:"C",length:1,color:"gray",tunnel:true,ferry:0},
      {id:"0",corridorId:"AC",a:"A",b:"C",length:2,color:"blue",tunnel:false,ferry:0}],
    tickets:Array.from({length:20},(_,i)=>({id:`ticket-${i}`,a:"A",b:"C",points:4,kind:i<5?"long":"short"}))};
}
function runtime(...definitions){return E.createEngine({maps:createMapCatalog([europe,...definitions])});}
function ready(engine=E,count=4,refs={}) {
  const game=engine.newGame(Array.from({length:count},(_,i)=>`P${i}`),0,NOW,null,{random,...refs});
  for(let seat=0;seat<count;seat++)engine.action(game,seat,{type:"choose_initial",indexes:[0,1]},options);
  return game;
}
function give(game,seat,cards) {
  // Gather and redeal the entire physical inventory without creating cards.
  const pool=[...game.deck,...game.discard,...game.face,...game.players.flatMap(p=>p.hand)];
  game.deck=pool;game.discard=[];game.face=[];game.players.forEach(p=>{p.hand=[];});
  for(const card of cards){const i=pool.indexOf(card);assert.notEqual(i,-1);game.players[seat].hand.push(...pool.splice(i,1));}
  for(const card of ["blue","green","yellow","black","white"]){const i=pool.indexOf(card);game.face.push(...pool.splice(i,1));}
}
function reveal(game,cards) {
  for(const card of cards){const i=game.deck.indexOf(card);assert.notEqual(i,-1);game.deck.splice(i,1);}
  game.deck.push(...[...cards].reverse());
}
function inventory(game) {
  return [...game.deck,...game.discard,...game.face,...game.players.flatMap(p=>p.hand),
    ...(game.phase==="tunnel"&&game.pending.stage!=="result"?game.pending.revealed:[])].sort();
}

test("one engine resolves simultaneous Europe and two exact map versions without global selection",()=>{
  const engine=runtime(mini(),mini("2")),legacy=ready(engine),g=ready(engine,4,{mapRef:reference}),v2=ready(engine,4,{mapRef:{...reference,version:"2"}});
  assert.equal(Object.hasOwn(legacy,"mapRef"),false);assert.deepEqual(engine.contextFor(legacy).mapRef,{id:"europe",version:"1"});
  assert.deepEqual(g.rulesRef,RULES_REFERENCE);assert.equal(g.routes.length,4);
  assert.equal(g.players[0].tickets[0].id.startsWith("ticket-"),true);
  assert.equal(engine.contextFor(g).cityName("A"),"Alpha 1");assert.equal(engine.contextFor(v2).cityName("A"),"Alpha 2");
  const before=clone(legacy),mapBefore=clone(engine.contextFor(g).map);
  for(const game of [g,v2]){game.routes.reverse();give(game,0,["red","red"]);engine.action(game,0,{type:"claim",routeId:"rail-90"},options);}
  assert.match(g.logs[0],/Alpha 1 — Beta 1/);assert.match(v2.logs[0],/Alpha 2 — Beta 2/);
  assert.equal(engine.routeById(g,"rail-90").owner,0);assert.equal(g.players[0].score,2);assert.equal(g.players[0].trains,43);
  assert.deepEqual(legacy,before);assert.deepEqual(engine.contextFor(g).map,mapBefore);
  assert.throws(()=>{engine.contextFor(g).routes[0].n=99;},TypeError);
  assert.throws(()=>{engine.contextFor(g).rules.claim.routePoints[2]=99;},TypeError);
  assert.equal(engine.contextFor(g).rules,rules);
});

test("Europe route IDs keep their meaning after rows move; string IDs are not numeric positions",()=>{
  const g=ready(),route=g.routes.find(r=>r.a==="DIE"&&r.b==="PAR"),id=route.id;
  g.routes.reverse();give(g,0,["purple"]);
  const before=clone(g);assert.throws(()=>E.action(g,0,{type:"claim",routeId:String(id)},options),/disponible/);assert.deepEqual(g,before);
  E.action(g,0,{type:"claim",routeId:id},options);assert.equal(route.owner,0);assert.equal(g.current,1);
  const engine=runtime(mini()),small=ready(engine,4,{mapRef:reference});small.routes.reverse();give(small,0,["blue","blue"]);
  assert.throws(()=>engine.action(small,0,{type:"claim",routeId:0},options),/disponible/);
  engine.action(small,0,{type:"claim",routeId:"0"},options);assert.equal(engine.routeById(small,"0").owner,0);
});

for(const surcharge of [false,true])test(`serialized opaque-ID tunnel resolves by identity: ${surcharge?"paid surcharge":"zero surcharge"}`,()=>{
  let engine=runtime(mini()),g=ready(engine,4,{mapRef:reference});g.routes.reverse();
  give(g,0,["red","red","red"]);reveal(g,surcharge?["red","blue","green"]:["blue","green","black"]);
  const cards=inventory(g),serial=g.turnSerial;
  engine.action(g,0,{type:"claim",routeId:"__proto__",color:"red"},options);
  assert.equal(g.pending.routeId,"__proto__");assert.equal(g.pending.surcharge,surcharge?1:0);
  g=clone(g);g.routes.reverse();engine=runtime(mini()); // No cached game identity survives restoration.
  engine.expire(g,g.pending.until,random);
  if(surcharge){g=clone(g);g.routes.reverse();engine=runtime(mini());engine.action(g,0,{type:"pay_tunnel",extraWild:0},{now:g.turnDeadline-1,random});}
  assert.equal(g.pending.stage,"result");assert.equal(engine.routeById(g,"__proto__").owner,0);
  assert.equal(g.players[0].score,1);assert.equal(g.players[0].trains,44);assert.equal(g.players[0].hand.length,surcharge?1:2);
  assert.equal(g.turnSerial,serial);assert.deepEqual(inventory(g),cards);
  assert.equal(engine.view(g,0,{now:NOW+1}).sharedTunnel.routeId,"__proto__");
  g=clone(g);engine.expire(g,g.pending.until,random);assert.equal(g.current,1);assert.equal(g.turnSerial,serial+1);
  assert.equal(g.events.filter(e=>e.type==="build").length,1);assert.deepEqual(inventory(g),cards);
});

test("ferries and parallel restrictions use opaque IDs and corridors for every player count",()=>{
  const engine=runtime(mini());
  for(const count of [2,3,4,5]){
    const g=ready(engine,count,{mapRef:reference});give(g,0,["red","red"]);
    engine.action(g,0,{type:"claim",routeId:"rail-90"},options);give(g,1,["blue","wild"]);
    const before=clone(g),command={type:"claim",routeId:"rail-03",color:"blue",wildCount:1};
    if(count<4){assert.throws(()=>engine.action(g,1,command,options),/disponible/);assert.deepEqual(g,before);}
    else{assert.throws(()=>engine.action(g,1,{...command,wildCount:0},options),/cartas/);assert.deepEqual(g,before);
      engine.action(g,1,command,options);assert.equal(engine.routeById(g,"rail-03").owner,1);assert.equal(g.players[1].score,2);}
  }
});

test("stations, borrowed paths, final scores and private queries use the match's own cities and tickets",()=>{
  const engine=runtime(mini()),g=ready(engine,4,{mapRef:reference});give(g,0,["red"]);
  engine.routeById(g,"rail-90").owner=0;g.players[0].score=2;
  engine.routeById(g,"__proto__").owner=1;g.players[1].score=1;
  g.players[0].tickets=[{id:"ticket-7",a:"A",b:"C",p:4,long:false}];
  const before=clone(g);assert.throws(()=>engine.action(g,0,{type:"station",city:"PAR",color:"red"},options));assert.deepEqual(g,before);
  assert.equal(engine.possibleStation(g,0),true);
  engine.action(g,0,{type:"station",city:"B",color:"red"},options);assert.match(g.logs[0],/Beta 1/);
  const view=engine.view(g,0,{now:NOW+1});assert.deepEqual(view.ticketPaths,[{id:"ticket-7",routes:["rail-90","__proto__"],
    stationRoutes:["__proto__"],stations:[{city:"B",routeId:"__proto__",seat:0}]}]);
  assert.equal(engine.view(g,1,{now:NOW+1}).tickets.some(t=>t.id==="ticket-7"),false);
  const unchanged=clone(g);view.routes[0].owner=99;assert.deepEqual(g,unchanged);
  engine.finish(g);const result=g.result.find(r=>r.seat===0);
  assert.equal(result.completed,1);assert.equal(result.score,2+4+8+10);assert.equal(result.longest,2);
  const stored=clone(g);engine.normalize(stored,NOW+2);assert.deepEqual(stored.result,g.result);
});

test("unknown or incomplete references reject commands, queries and closure before changing a game",()=>{
  const engine=runtime(mini());
  for(const change of [g=>{g.mapRef.version="missing";},g=>{g.rulesRef.version="missing";},g=>{g.rulesRef=null;},
    g=>{delete g.rulesRef;},g=>{delete g.mapRef;},g=>{g.mapRef={id:"test-map"};}]){
    const g=ready(engine,4,{mapRef:reference});change(g);const before=clone(g);
    for(const use of [()=>engine.action(g,0,{type:"draw_train",index:-1},options),()=>engine.normalize(g,NOW+1),
      ()=>engine.view(g,-1,{now:NOW+1}),()=>engine.finish(g,true)]){
      assert.throws(use);assert.deepEqual(g,before);
    }
  }
  const unregistered=ready(engine,4,{mapRef:reference}),before=clone(unregistered);
  assert.throws(()=>E.normalize(unregistered,NOW+1),{code:"UNKNOWN_MAP_VERSION"});assert.deepEqual(unregistered,before);
});

test("unusable definitions and insufficient destinations fail before consuming setup randomness",()=>{
  const short=mini();short.tickets=short.tickets.slice(0,5);
  const unsupported=mini();unsupported.routes[0].length=5;
  for(const map of [short,unsupported]){
    const engine=runtime(map);let draws=0;const draw=()=>{draws++;return 0;};
    assert.throws(()=>engine.newGame(["A","B"],0,NOW,null,{mapRef:reference,random:draw}));
    assert.throws(()=>engine.newRandomGame(["A","B"],NOW,draw,null,{mapRef:reference,random:draw}));assert.equal(draws,0);
  }
});

test("explicit Europe references preserve its legacy route/ticket representation and cloned lookup",()=>{
  const g=ready(E,4,{mapRef:{id:"europe",version:"1"}}),saved=clone(g);
  assert.equal(typeof saved.routes[0].id,"number");assert.equal(typeof saved.players[0].tickets[0].id,"number");
  assert.deepEqual(E.contextFor(saved).mapRef,{id:"europe",version:"1"});assert.deepEqual(E.contextFor(saved).rulesRef,RULES_REFERENCE);
});
