'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../engine'),{createRoomBots}=require('../room-bots');
const {serializableRoom}=require('../room-store');
test('permanent bots choose, play, pause without humans and resume from a persisted room',()=>{
 const room={code:'835001',visibility:'public',maxPlayers:2,members:[{name:'Human',ws:{closed:false}},{name:'Bot',bot:true}],game:Engine.newGame(['Human','Bot']),revision:0};
 const rooms=new Map([[room.code,room]]),timers=new Set();let blocked=false,commits=0;
 const bot=createRoomBots({rooms,blocked:()=>blocked,dispatch:job=>job(),setTimer:fn=>{timers.add(fn);return fn;},clearTimer:fn=>timers.delete(fn),sendRoom:r=>{commits++;bot.sync(r);}});
 const tick=()=>{const fn=[...timers][0];assert.ok(fn,'scheduled action');timers.delete(fn);fn();};
 bot.sync(room);tick();assert.equal(room.game.players[1].pending.length,0);assert.equal(commits,1);
 Engine.action(room.game,0,{type:'choose_initial',indexes:[0,1]});room.game.current=1;
 bot.sync(room);tick();assert.equal(room.revision,2);
 room.members[0].ws=null;bot.sync(room);assert.equal(timers.size,0);
 const restored=serializableRoom(room);restored.members[0].ws={closed:false};rooms.set(room.code,restored);restored.game.current=1;
 bot.sync(restored);assert.equal(timers.size,1);
 blocked=true;bot.sync(restored);assert.equal(timers.size,0);
 blocked=false;bot.sync(restored);tick();assert.ok(restored.revision>room.revision);
 bot.close();assert.equal(timers.size,0);
});
test('pending bot destinations are resolved during closing, without taking another turn',()=>{
 const g=Engine.newGame(['Human','Bot']);for(let i=0;i<2;i++)Engine.action(g,i,{type:'choose_initial',indexes:[0,1]});
 g.current=1;Engine.action(g,1,{type:'draw_tickets'});g.phase='closing';
 const room={code:'835002',members:[{name:'Human',ws:{}},{name:'Bot',bot:true}],game:g,revision:0},rooms=new Map([[room.code,room]]);
 let run;
 const bot=createRoomBots({rooms,blocked:()=>false,dispatch:fn=>fn(),setTimer:fn=>(run=fn),clearTimer:()=>{},sendRoom:()=>{}});
 bot.sync(room);assert.ok(run);run();assert.equal(g.players[1].offer,null);assert.equal(g.phase,'finished');bot.close();
});
