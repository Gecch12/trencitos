"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../backend/engine');
const {createPlayerActionHandler}=require('../game/application/player-action');
const {fingerprintAction}=require('../game/infrastructure/command-fingerprint');
function fixture(){
 const game=E.newGame(['A','B'],0,1000);game.phase='play';game.players.forEach(p=>{p.pending=[];p.tickets=[];});
 E.ensureTiming(game,1000);
 game.face=['red','blue','green','white','yellow'];game.deck=['orange','black','purple','blue'];game.discard=[];
 const room={game,revision:10,members:[{},{}],practice:false},context={now:1000};
 const submit=createPlayerActionHandler({engine:E,stageRoom:()=>true,storagePaused:()=>false,now:()=>context.now,random:()=>0,fingerprintAction});
 const first={commandId:'first-draw-001',expectedRevision:10,chainDraws:true,action:{type:'draw_train',index:-1}};
 const second={commandId:'second-draw-001',expectedRevision:10,after:first.commandId,action:{type:'draw_train',index:-1}};
 return {room,context,submit,first,second};
}
test('dependent blind draws execute in order at the original revision and retry without consuming cards',()=>{
 const f=fixture(),before=f.room.game.players[0].hand.length;
 const a=f.submit(f.room,0,f.first),b=f.submit(f.room,0,f.second);
 assert.equal(a.status,'accepted');assert.equal(b.status,'accepted');assert.notEqual(a.drawEventId,b.drawEventId);
 assert.equal(f.room.revision,12);assert.equal(f.room.game.players[0].hand.length,before+2);
 assert.equal(f.room.game.current,1);
 const saved=JSON.parse(JSON.stringify(f.room));
 for(const command of [f.first,f.second])assert.equal(f.submit(saved,0,command).status,'duplicate');
 assert.deepEqual(saved,JSON.parse(JSON.stringify(f.room)));
 assert.equal(f.submit(saved,0,{...f.second,after:'another-draw-001'}).error.code,'COMMAND_ID_CONFLICT');
 assert.equal(f.submit(saved,0,{...f.second,after:undefined}).error.code,'COMMAND_ID_CONFLICT');
});
test('a dependency belongs to its seat and must refer to an accepted first draw',()=>{
 const f=fixture(),before=structuredClone(f.room.game);
 assert.equal(f.submit(f.room,0,f.second).error.code,'DRAW_DEPENDENCY_CHANGED');
 assert.deepEqual(f.room.game,before);
 f.submit(f.room,0,f.first);
 assert.equal(f.submit(f.room,1,f.second).error.code,'DRAW_DEPENDENCY_CHANGED');
 for(const after of [null,4,{},f.second.commandId,'short'])
  assert.equal(f.submit(f.room,0,{...f.second,after}).error.code,'DRAW_DEPENDENCY_CHANGED');
 for(const change of [{commandId:undefined},{action:{type:'pass'}},{expectedRevision:11}])
  assert.equal(f.submit(f.room,0,{...f.second,...change}).error.code,'DRAW_DEPENDENCY_CHANGED');
});
test('failed/stale parents, intervening revisions and expired turns cannot authorize a second draw',()=>{
 for(const kind of ['stale','revision','turn','deadline','refresh']){
  const f=fixture();
  if(kind==='stale')f.first.expectedRevision=9;
  f.submit(f.room,0,f.first);
  if(kind==='revision')f.room.revision++;
  if(kind==='turn')f.room.game.turnSerial++;
  if(kind==='deadline')f.context.now=f.room.game.turnDeadline;
  if(kind==='refresh')f.room.game.events.push({id:f.room.game.eventSerial+1,type:'market_refresh'});
  assert.equal(f.submit(f.room,0,f.second).error.code,'DRAW_DEPENDENCY_CHANGED',kind);
  assert.ok(!f.room.members[0].actionIds?.includes(f.second.commandId));
 }
});
test('visible dependencies retain original slot identity, including depletion, and reject renewed slots',()=>{
 const f=fixture();f.room.game.deck=[];
 f.first.action.index=0;f.second.action.index=2;
 assert.equal(f.submit(f.room,0,f.first).status,'accepted');
 assert.equal(f.submit(f.room,0,f.second).status,'accepted');
 assert.deepEqual(f.room.game.players[0].hand.slice(-2),['red','green']);
 assert.equal(f.room.game.events.find(e=>e.type==='draw'&&e.color==='green').index,1);
 const g=fixture();g.first.action.index=0;g.second.action.index=0;g.submit(g.room,0,g.first);
 assert.equal(g.submit(g.room,0,g.second).error.code,'DRAW_DEPENDENCY_CHANGED');
 const h=fixture();h.room.game.face=['wild','wild','red','blue','green'];h.room.game.deck.push('wild');
 h.first.action.index=2;h.second.action.index=3;h.submit(h.room,0,h.first);
 assert.ok(h.room.game.events.some(e=>e.type==='market_refresh'));
 assert.equal(h.submit(h.room,0,h.second).error.code,'DRAW_DEPENDENCY_CHANGED');
});
test('visible locomotives and third draws cannot be smuggled through the dependency',()=>{
 const f=fixture();f.room.game.face[0]='wild';f.submit(f.room,0,f.first);
 assert.equal(f.submit(f.room,0,{...f.second,action:{type:'draw_train',index:0}}).error.code,'DRAW_DEPENDENCY_CHANGED');
 assert.equal(f.submit(f.room,0,f.second).status,'accepted');
 assert.equal(f.submit(f.room,0,{...f.second,commandId:'third-draw-001',after:f.second.commandId}).error.code,'DRAW_DEPENDENCY_CHANGED');
 const g=fixture();g.room.game.face[0]='wild';g.first.action.index=0;g.submit(g.room,0,g.first);
 assert.equal(g.submit(g.room,0,g.second).error.code,'DRAW_DEPENDENCY_CHANGED');
});
