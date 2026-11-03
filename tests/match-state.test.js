"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const E=require("../backend/engine"),{createMapCatalog}=require("../game/maps/catalog");
const Replay=require("../shared/replay-state"),{createMatchArchive,frameHash}=require("../backend/match-archive");
const NOW=1000,random=max=>max-1;
const json=value=>JSON.parse(JSON.stringify(value));
function legacy(g){g=json(g);for(const key of ["schemaVersion","mapRef","rulesRef"])delete g[key];return g;}
const initial=()=>E.newGame(["A","B"],0,NOW,null,{random});
function ready(){const g=initial();for(const seat of [0,1])E.action(g,seat,{type:"choose_initial",indexes:[0,1]},{now:NOW+1,random});return g;}
function tunnel(surcharge=true){
  const g=ready(),r=g.routes.find(r=>r.tunnel&&r.n===2&&r.color==="gray");
  g.players[0].hand=["red","red","red","red"];g.deck=surcharge?["red","blue","green"]:["blue","green","black"];g.discard=[];
  E.action(g,0,{type:"claim",routeId:r.id,color:"red"},{now:NOW+2,random});return g;
}
function restoreUnchanged(g){
  const before=json(g),restored=E.restoreState(g);assert.deepEqual(g,before);
  assert.equal(restored.schemaVersion,1);assert.deepEqual(restored.mapRef,{id:"europe",version:"1"});assert.deepEqual(restored.rulesRef,{id:"europe-classic",version:"1"});
  assert.deepEqual(legacy(restored),legacy(before));assert.deepEqual(E.restoreState(restored),restored);assert.notEqual(restored,g);return restored;
}

test("known legacy states migrate as detached copies without touching clocks, piles, IDs or scores",()=>{
  const states=[initial(),ready(),tunnel(),tunnel(false)];
  const decision=tunnel();E.expire(decision,decision.pending.until,random);states.push(decision);
  const oldDecision=json(decision);delete oldDecision.pending.stage;states.push(oldDecision);
  const result=tunnel(false);E.expire(result,result.pending.until,random);states.push(result);
  const offer=ready();E.action(offer,0,{type:"draw_tickets"},{now:NOW+2,random});states.push(offer);
  const oldOffer=ready();oldOffer.phase="tickets";oldOffer.pending={tickets:oldOffer.shortDeck.splice(0,3)};states.push(oldOffer);
  const finished=ready();E.finish(finished);finished.result[0].score+=7;finished.result[0].route+=7;states.push(finished);
  const oldResult=json(finished);for(const r of oldResult.result)delete r.details;states.push(oldResult);
  for(const state of states)restoreUnchanged(legacy(state));
});

test("current and transitional referenced states restore without relying on array position or object identity",()=>{
  const g=ready();g.routes.reverse();restoreUnchanged(g);
  const transitional=json(g);delete transitional.schemaVersion;restoreUnchanged(transitional);
  const restored=E.restoreState(legacy(g));restored.players[0].hand.push("red");assert.notDeepEqual(g.players[0].hand,restored.players[0].hand);
  const next=E.newRandomGame(["A","B"],NOW,()=>1,null,{random});assert.equal(next.schemaVersion,1);assert.deepEqual(next.mapRef,g.mapRef);
});

test("unknown schema versions and missing references never become legacy Europe or mutate the input",()=>{
  for(const change of [g=>{g.schemaVersion=2;},g=>{g.schemaVersion="1";},g=>{g.schemaVersion=null;},
    g=>{delete g.mapRef;},g=>{delete g.rulesRef;},g=>{delete g.mapRef;delete g.rulesRef;},
    g=>{g.mapRef.version="2";},g=>{g.rulesRef.version="2";}]){
    const g=initial();change(g);const before=json(g);
    for(const use of [()=>E.restoreState(g),()=>E.normalize(g,NOW),()=>E.view(g,0,{now:NOW}),
      ()=>E.action(g,0,{type:"choose_initial",indexes:[0,1]},{now:NOW,random})]){
      assert.throws(use);assert.deepEqual(g,before);
    }
  }
});

test("restore rejects missing, duplicated, coerced or changed routes and tickets against the exact definition",()=>{
  const changes=[g=>{g.routes.pop();},g=>{g.routes[1]={...g.routes[0]};},g=>{g.routes[0].id=String(g.routes[0].id);},
    g=>{g.routes[0].n++;},g=>{g.routes[0].a="BOG";},g=>{g.routes[0].owner=3;},
    g=>{g.players[0].pending[0].id="SA001";},g=>{g.shortDeck[0].p++;},
    g=>{g.players[1].pending[0]={...g.players[0].pending[0]};},g=>{g.players[0].placed=["BOG"];},
    g=>{g.events=[{type:"build",seat:0,routeId:"SA001"}];},g=>{g.events=[{type:"build",seat:0,city:"BOG"}];}];
  for(const change of changes)for(const old of [false,true]){
    const g=old?legacy(initial()):initial();change(g);const before=json(g);
    assert.throws(()=>E.restoreState(g),{code:"INVALID_MATCH_STATE"});assert.deepEqual(g,before);
  }
});

test("pending tunnels, offers, station assignments and result paths validate their saved identities",()=>{
  const t=tunnel();t.pending.routeId="missing";assert.throws(()=>E.restoreState(t),{code:"INVALID_MATCH_STATE"});
  const o=ready();E.action(o,0,{type:"draw_tickets"},{now:NOW+2,random});o.players[0].offer.tickets[0].id="missing";
  assert.throws(()=>E.restoreState(o),{code:"INVALID_MATCH_STATE"});
  const f=ready();E.finish(f);
  for(const change of [g=>{g.result[0].stationRoutes=["missing"];},g=>{g.result[0].tickets[0].id="missing";},
    g=>{g.result[0].details.destinations[0].routes=["missing"];},g=>{g.result[0].details.destinations[0].stationRoutes=["missing"];},
    g=>{g.result[0].details.stations.placed=[{city:"PAR",routeId:"missing"}];},
    g=>{g.result[0].details.express.routes=["missing"];},g=>{g.result[0].details.express.cities=["missing"];},
    g=>{g.result[0].details.routes=[{id:0,a:"BAD",b:"LON",length:4}];}]){
    const g=json(f);change(g);assert.throws(()=>E.restoreState(g),{code:"INVALID_MATCH_STATE"});
  }
});

test("opaque map identities survive validated restoration in a new engine with the same catalog",()=>{
  const map={schemaVersion:1,id:"small",version:"1",cities:[{id:"A",name:"Alpha"},{id:"B",name:"Beta"}],
    corridors:[{id:"AB",cityIds:["A","B"]}],routes:[{id:"SA001",corridorId:"AB",a:"A",b:"B",length:2,color:"red",tunnel:false,ferry:0}],
    tickets:Array.from({length:8},(_,i)=>({id:`T${i}`,a:"A",b:"B",points:2,kind:i<2?"long":"short"}))};
  const make=()=>E.createEngine({maps:createMapCatalog([map])});
  const engine=make(),g=engine.newGame(["A","B"],0,NOW,null,{mapRef:{id:"small",version:"1"},random});
  const restored=make().restoreState(json(g));assert.deepEqual(restored,g);assert.equal(restored.routes[0].id,"SA001");
  const unmarked=legacy(g);assert.throws(()=>E.restoreState(unmarked),{code:"INVALID_MATCH_STATE"});
});

test("migration appends new audit state while old replay frames and public views stay byte-for-byte unchanged",async()=>{
  const room={code:"12345678",visibility:"public",archiveFull:true,members:[{name:"A",guestId:"guest-a"},{name:"B",guestId:"guest-b"}],game:legacy(ready())};
  const archive=createMatchArchive();archive.capture(room);archive.commit(archive.prepare());
  const old=JSON.stringify(archive.state.matches[room.matchId].frames),oldViews=json(room._archiveState.views);
  room.game=E.restoreState(room.game);archive.capture(room);archive.commit(archive.prepare());
  const record=archive.state.matches[room.matchId];assert.equal(JSON.stringify(record.frames.slice(0,1)),old);
  assert.deepEqual(room._archiveState.views,oldViews);assert.equal(record.schemaVersion,1);assert.equal(record.frames.length,2);
  assert.equal(Replay.at(record.frames,0).game.schemaVersion,undefined);assert.equal(Replay.at(record.frames,1).game.schemaVersion,1);
  for(const frame of record.frames){const {hash,...body}=frame;assert.equal(frameHash(body),hash);}
  archive.capture(room,"closed");archive.commit(archive.prepare());
  const before=JSON.stringify(archive.state),restore=E.restoreState;E.restoreState=()=>{throw Error("Replay must not migrate");};
  try{
    const audit=await archive.replay({guestId:"guest-a"},room.matchId,true);assert.equal(JSON.stringify(audit.frames.slice(0,1)),old);
    const publicReplay=await archive.replay({},room.matchId);assert.equal(Replay.at(publicReplay.frames,0).views[0].schemaVersion,undefined);
    assert.equal(JSON.stringify(archive.state),before);
  }finally{E.restoreState=restore;}
});
