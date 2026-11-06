"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect,check}=require('../scripts/check-architecture');
test('architecture rejects transport/storage, inverted CQRS edges, dynamic imports and ambient dependencies',()=>{
 for(const [file,code] of [
  ['game/domain/rule.js',"require('../../backend/server')"],
  ['game/domain/rule.js',"require('node:fs')"],
  ['game/queries/view.js',"require('../application/player-action')"],
  ['game/application/action.js',"require('../infrastructure/checkpoint-committer')"],
  ['game/domain/rule.js','require(provider)'],
  ['game/queries/view.js','import("node:fs")'],
  ['game/domain/rule.js','Date.now()'],
  ['game/queries/view.js','fetch(url)'],
 ])assert.ok(inspect(file,code).length,`${file}: ${code}`);
 assert.deepEqual(inspect('game/queries/view.js',"// require('node:fs')\nconst x=require('../domain/network');"),[]);
 assert.deepEqual(check().errors,[]);
});
test('journal queries read frozen data and keep hidden draws and private destinations scoped',()=>{
 const {project}=require('../game/queries/turn-history');
 const game={journal:[{id:1,seat:0,turn:1,type:'draw',data:{index:-1,color:'red'}},{id:2,seat:0,turn:1,type:'tickets',data:{privateSeat:0,tickets:[{id:7}]}}]};
 const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(game);
 const own=project(game,0),rival=project(game,1),closed=project(game,-1,{revealAll:true});
 assert.equal(own[0].events[0].data.color,'red');assert.equal(rival[0].events[0].data.color,undefined);assert.equal(rival[0].events.length,1);
 assert.equal(closed[0].events[1].data.subjectSeat,0);assert.equal(closed[0].events[1].data.privateSeat,undefined);
 own[0].events[0].data.color='blue';assert.equal(game.journal[0].data.color,'red');
});
