"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../backend/engine'), Timing = require('../shared/game-timing');
const {shiftDeadlines} = require('../backend/multiplayer');
const {listRooms} = require('../backend/room-directory');
const {serializableRoom} = require('../backend/room-store');
function start(timing) {
  const g=E.newGame(['A','B'],0,1000,timing);
  E.action(g,0,{type:'choose_initial',indexes:[0,1]},{now:2000});
  E.action(g,1,{type:'choose_initial',indexes:[0,1]},{now:3000});
  return g;
}
test('all supported initial and turn clocks start with the configured duration',()=>{
  for(const initialSeconds of [30,60,90])for(const turnSeconds of [30,60,90]) {
    const timing={turnSeconds,initialSeconds,ticketExtraSeconds:30};
    const g=E.newGame(['A','B'],0,1000,timing);
    assert.equal(g.initialDeadline,1000+initialSeconds*1000);
    assert.equal(E.expire(g,g.initialDeadline-1),false);
    E.expire(g,g.initialDeadline,()=>0);
    assert.equal(g.phase,'play');
    assert.equal(g.turnDeadline,1000+(initialSeconds+turnSeconds)*1000);
    assert.deepEqual(E.view(g,0).timing,timing);
  }
});
test('new tickets receive remaining turn time plus the chosen extra while the next player starts',()=>{
  for(const ticketExtraSeconds of [15,30])for(const turnSeconds of [30,60,90]) {
    const g=start({turnSeconds,ticketExtraSeconds,initialSeconds:60});
    const oldDeadline=g.turnDeadline, at=oldDeadline-20000;
    E.action(g,0,{type:'draw_tickets'},{now:at});
    assert.equal(g.players[0].offer.deadline,oldDeadline+ticketExtraSeconds*1000);
    assert.equal(g.players[0].offer.duration,20000+ticketExtraSeconds*1000);
    assert.equal(g.current,1);assert.equal(g.turnDeadline,at+turnSeconds*1000);
    const restored=JSON.parse(JSON.stringify(g));
    E.ensureTiming(restored,at+1000);
    assert.equal(restored.players[0].offer.deadline,g.players[0].offer.deadline);
    assert.equal(restored.turnDeadline,g.turnDeadline);
    assert.equal(E.view(restored,0).ticketOffer.duration,20000+ticketExtraSeconds*1000);
  }
});
test('returning to a pending offer waits, then starts the full configured turn',()=>{
  const g=start({turnSeconds:90,ticketExtraSeconds:30,initialSeconds:30});
  E.action(g,0,{type:'draw_tickets'},{now:4000});
  E.action(g,1,{type:'draw_tickets'},{now:5000});
  assert.equal(g.current,0);assert.equal(g.turnWaiting,true);assert.equal(g.turnDeadline,null);
  E.action(g,0,{type:'keep_tickets',indexes:[0],offerId:g.players[0].offer.id},{now:6000});
  assert.equal(g.turnWaiting,false);assert.equal(g.turnDeadline,96000);
});
test('reconnecting paused rooms shifts deadlines without changing countdown durations',()=>{
  const g=start({turnSeconds:30,ticketExtraSeconds:15,initialSeconds:90});
  E.action(g,0,{type:'draw_tickets'},{now:4000});
  const offer={...g.players[0].offer}, deadline=g.turnDeadline;
  shiftDeadlines(g,7000);
  assert.equal(g.turnDeadline,deadline+7000);
  assert.equal(g.players[0].offer.deadline,offer.deadline+7000);
  assert.equal(g.players[0].offer.duration,offer.duration);
});
test('legacy started games retain their existing 60 second ticket rule',()=>{
  const g=start(null);E.action(g,0,{type:'draw_tickets'},{now:5000});
  assert.equal(g.players[0].offer.deadline,65000);assert.equal(g.timing,undefined);
});
test('settings are persisted and directory advertises the actual game timer',()=>{
  const timing={turnSeconds:90,ticketExtraSeconds:15,initialSeconds:30};
  const room={code:'123456',visibility:'public',members:[{name:'A'},{name:'B'}],timing,game:start(timing)};
  assert.deepEqual(serializableRoom(room).timing,timing);
  room.timing={...timing,turnSeconds:30};
  assert.equal(listRooms(new Map([['room',room]]))[0].turnSeconds,90);
  for(const value of [null,{},[],{...timing,turnSeconds:45},{...timing,ticketExtraSeconds:60},{...timing,initialSeconds:'30'}])assert.equal(Timing.valid(value),false);
});
