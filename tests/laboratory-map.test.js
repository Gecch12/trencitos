"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const E=require("../backend/engine"),Bots=require("../backend/bots"),Presentation=require("../frontend/match-presentation");
const {maps,validateMapForRules}=require("../backend/maps"),Options=require("../shared/map-options");
const {selectMap,roomMapReference}=require("../backend/room-map"),{random}=require("./helpers/bot-match");
const reference={id:"laboratory",version:"1"};

test("selectable maps have compatible definitions, full layouts and sufficient initial tickets for five",()=>{
  assert.deepEqual(maps.list(),Options.options.map(Options.reference));
  for(const option of Options.options){
    const mapRef=Options.reference(option),g=E.newGame(["A","B","C","D","E"],0,0,null,{mapRef});
    validateMapForRules(maps.get(mapRef),E.contextFor(g).rules);
    const context=Presentation.create().resolve(E.view(g,0),E.definition(g));
    assert.equal(context.network.length,g.routes.length);
    for(const r of g.routes){const cells=context.geometryFor(r.id).cells;assert.equal(cells.length,r.n);assert.ok(cells.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)));}
    assert.ok(g.players.every(p=>p.pending.length===4));
  }
});
test("room map references preserve legacy defaults and reject unknown, partial and inconsistent selections",()=>{
  assert.deepEqual(roomMapReference({}),{id:"europe",version:"1"});
  assert.deepEqual(roomMapReference({game:{mapRef:reference}}),reference);
  assert.throws(()=>roomMapReference({mapRef:reference,game:{mapRef:{id:"europe",version:"1"}}}),{code:"INVALID_ROOM_MAP"});
  for(const ref of [null,{},"laboratory",{id:"laboratory"},{...reference,version:"2"},{...reference,extra:true}])assert.throws(()=>selectMap(ref));
});
test("Laboratory and Europe finish interleaved bot games for two through five players after restoration",()=>{
  const sessions=[2,3,4,5].map((count,i)=>({rng:random(100+i),g:E.newGame(Array.from({length:count},(_,i)=>`Bot ${i}`),0,0,null,{mapRef:reference,random:random(200+i)})}));
  sessions.push({rng:random(99),g:E.newGame(["Europe A","Europe B"],0,0,null,{random:random(299)})});
  let now=0;
  for(let step=0;step<1800&&sessions.some(s=>s.g.phase!=="finished");step++)for(const session of sessions){
    const {g,rng}=session;if(g.phase==="finished")continue;
    if(E.tunnelBusy(g)){now=Math.max(now,g.pending.until);E.expire(g,now,rng);}
    else{
      const offered=g.phase==="tunnel"?-1:g.players.findIndex(p=>p.offer);
      const seat=g.phase==="initial"?g.players.findIndex(p=>p.pending.length):offered>=0?offered:g.current;
      const action=Bots.chooseBotAction(g,seat,rng,{search:false});
      if(action)E.action(g,seat,action,{now:++now,random:rng});else E.next(g,++now);
    }
    const cards=[...g.deck,...g.discard,...g.face,...g.players.flatMap(p=>p.hand),...(g.phase==="tunnel"&&g.pending.stage!=="result"?g.pending.revealed:[])];
    assert.equal(cards.length,110);
    if(step===25)session.g=E.restoreState(JSON.parse(JSON.stringify(g)));
  }
  for(const {g} of sessions){assert.equal(g.phase,"finished",JSON.stringify({map:g.mapRef,count:g.players.length,trains:g.players.map(p=>p.trains)}));assert.equal(g.finalRemaining,0);assert.ok(g.routes.some(r=>r.owner!==null));assert.deepEqual(E.restoreState(g),g);}
});
