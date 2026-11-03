"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../backend/engine'),{createBotPlanner}=require('../backend/bot-planner'),{createBotRunner}=require('../backend/bot-runner');
const {createLegacyAutomaticPlay}=require('../game/compat/legacy-automatic-play');
test('worker proposals remain legal for opaque-map bots while the main event loop stays available',async()=>{
 const planner=createBotPlanner(),g=E.newGame(['A','B','C','D'],0,0,null,{mapRef:{id:'south-america',version:'3.3-beta'}}),before=JSON.stringify(g);let ticks=0;const timer=setInterval(()=>ticks++,1);
 try{const rows=await planner.plan(g,[0,1,2,3]);assert.ok(ticks>0);assert.equal(JSON.stringify(g),before);for(const [seat,action] of rows)E.action(g,seat,action,{now:1});assert.equal(g.phase,'play');}
 finally{clearInterval(timer);await planner.close();}
});
test('an async plan is discarded after an intervening action or loss of control, with one plan per room',async()=>{
 for(const stale of ['game','connection','shutdown']){
  const room={game:E.newGame(['A','B'],0,0),members:[{name:'A'},{name:'B',bot:true}]};let release,plans=0,staged=0,eligible=true,active=true;
  const planner={plan:()=>{plans++;return new Promise(resolve=>{release=resolve;});}},automaticPlay=createLegacyAutomaticPlay({stageRoom:()=>staged++});
  const run=createBotRunner({planner,automaticPlay,dispatch:fn=>fn(),engine:E,stageRoom:()=>staged++,schedule:()=>{},active:()=>active});
  const pending=run(room,'playPermanentBots',()=>eligible);await run(room,'playPermanentBots',()=>eligible);assert.equal(plans,1);
  if(stale==='game')E.action(room.game,0,{type:'choose_initial',indexes:[0,1]},{now:1});else if(stale==='connection')eligible=false;else active=false;
  release([[1,{type:'choose_initial',indexes:[0,1]}]]);await pending;assert.equal(staged,0);assert.equal(room.game.players[1].pending.length,4);
 }
});
test('a current worker proposal goes through the normal revision and staging boundary',async()=>{
 const room={game:E.newGame(['A','B'],0,0),members:[{name:'A'},{name:'B',bot:true}],revision:0};let staged=0;
 const automaticPlay=createLegacyAutomaticPlay({stageRoom:()=>staged++}),run=createBotRunner({planner:{plan:async()=>[[1,{type:'choose_initial',indexes:[0,1]}]]},automaticPlay,dispatch:fn=>fn(),engine:E,stageRoom:()=>staged++,schedule:()=>{}});
 await run(room,'playPermanentBots',()=>true);assert.equal(staged,1);assert.equal(room.revision,1);assert.equal(room.game.players[1].pending.length,0);
});
