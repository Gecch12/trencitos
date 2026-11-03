"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createDestinationDetails } = require('../game/queries/destination-details');
const Scoring = require('../game/domain/scoring'), Legacy = require('../game/compat/legacy-scoring');
const Engine = require('../backend/engine');
function fixture() {
  return { routes: [{id:'ab',a:'a',b:'b',n:2,owner:0},{id:'bc',a:'b',b:'c',n:2,owner:1}],
    players: [0,1].map(seat=>({name:String(seat),score:0,stations:3,placed:[],hand:[],
      tickets:[{id:seat,a:'a',b:'c',p:4}]})) };
}
function expected(game,seat) {
  const {map,owners}=Legacy.projectBoard(game);
  return Scoring.destinationDetails({...Legacy.projectPlayer(game.players[seat]),seat,owners},{map});
}
test('draws and clock changes reuse connectivity; routes, stations and ticket values invalidate it',()=>{
  let calculations=0;
  const query=createDestinationDetails({calculate:(...args)=>{calculations++;return Scoring.destinationDetails(...args);}});
  const game=fixture(), saved=structuredClone(game);
  for(let i=0;i<10;i++) { game.players[0].hand.push('red');game.turnSerial=i;assert.deepEqual(query(game,0),expected(game,0)); }
  assert.equal(calculations,1);
  query(game,1);assert.equal(calculations,2);
  game.players[0].placed=['b'];assert.equal(query(game,0).progress[0].viaStation,true);assert.equal(calculations,3);
  game.routes[1].owner=null;assert.equal(query(game,0).progress[0].completed,false);assert.equal(calculations,4);
  game.routes[1].owner=0;assert.equal(query(game,0).progress[0].completed,true);assert.equal(calculations,5);
  for(const mutate of [()=>game.players[0].tickets[0].b='b',()=>game.players[0].tickets[0].p=10,
    ()=>game.routes[0].id=7,()=>game.routes[0].a='x',()=>game.routes.reverse()]) {
    const before=calculations;mutate();assert.deepEqual(query(game,0),expected(game,0));assert.equal(calculations,before+1);
  }
  Object.assign(game,saved);assert.deepEqual(query(game,0),expected(game,0),'rollback recalculates the restored content');
});
test('cache isolates matches and seats, including typed IDs',()=>{
  const query=createDestinationDetails(), first=fixture(), second=fixture();
  second.routes[1].owner=0;
  for(const game of [first,second])for(const seat of [0,1])assert.deepEqual(query(game,seat),expected(game,seat));
  first.routes[0].id=1;query(first,0);first.routes[0].id='1';
  assert.deepEqual(query(first,0),expected(first,0));
});
test('authorized views detach cached private ticket results and accept frozen matches',()=>{
  const game=Engine.newGame(['A','B'],0,0,null,{random:()=>0});
  for(const seat of [0,1])Engine.action(game,seat,{type:'choose_initial',indexes:[0,1]},{now:0});
  const before=structuredClone(game), first=Engine.view(game,0,{now:0});
  first.ticketProgress[0].completed=!first.ticketProgress[0].completed;first.ticketPaths[0].routes.push('foreign');
  const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}};frozen(game);
  const after=Engine.view(game,0,{now:0});
  assert.deepEqual(after.ticketProgress,expected(game,0).progress);
  assert.deepEqual(after.ticketPaths,expected(game,0).paths);
  assert.deepEqual(Engine.view(game,-1,{now:0}).ticketProgress,[]);
  assert.deepEqual(game,before);
});
