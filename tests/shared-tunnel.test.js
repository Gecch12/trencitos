const test = require('node:test'), assert = require('node:assert/strict');
const E = require('../backend/engine'), {chooseBotAction, chooseReplacementAction} = require('../backend/bots');
const {shiftDeadlines} = require('../backend/multiplayer');
const {createGameClock} = require('../backend/game-clock');
function setup(surcharge = true) {
  const g = E.newGame(['A', 'B', 'C'], 0, 0);
  for(let i=0;i<3;i++) E.action(g,i,{type:'choose_initial',indexes:[0,1]},{now:0});
  g.routes = [{id:0,a:'PAR',b:'BRU',n:2,color:'red',tunnel:true,ferry:0,owner:null}];
  g.players[0].hand=['red','red','red']; g.deck=surcharge?['red','blue','green']:['blue','green','black'];g.discard=[];
  g.players[1].offer={id:9,tickets:[{id:99,a:'PAR',b:'BRU',p:4}],deadline:20000};
  E.action(g,0,{type:'claim',routeId:0,color:'red'},{now:12000});
  return g;
}
test('all actions and bots wait for the reveal; private ticket clocks resume without lost time', () => {
  const g=setup(), hand=[...g.players[0].hand];
  for(const [seat,action] of [[0,{type:'pay_tunnel',extraWild:0}],[1,{type:'draw_train',index:-1}],[1,{type:'keep_tickets',offerId:9,indexes:[0]}]])
    assert.throws(()=>E.action(g,seat,action,{now:12001}),/termine el túnel/);
  assert.equal(chooseBotAction(g,0),null);assert.equal(chooseReplacementAction(g,0),null);
  assert.deepEqual(g.players[0].hand,hand);
  E.expire(g,14800);assert.equal(g.turnDeadline,62800);assert.equal(g.pending.stage,'decision');
  assert.equal(E.expire(g,30000),false);assert.ok(g.players[1].offer);
  E.action(g,0,{type:'pay_tunnel',extraWild:0},{now:31000});
  assert.equal(g.pending.stage,'result');assert.equal(g.current,0);assert.equal(g.routes[0].owner,0);
  assert.equal(E.expire(g,31000+E.TUNNEL_RESULT_MS-1),false);E.expire(g,31000+E.TUNNEL_RESULT_MS);
  assert.equal(g.players[1].offer.deadline,39000+E.TUNNEL_RESULT_MS);assert.equal(g.turnWaiting,true);
  E.action(g,1,{type:'keep_tickets',offerId:9,indexes:[0]},{now:32000+E.TUNNEL_RESULT_MS});
  assert.equal(g.turnDeadline,92000+E.TUNNEL_RESULT_MS);
});
test('late timers still show the outcome, and the final round finishes only after it', () => {
  const g=setup(false);g.players[1].offer=null;g.finalRemaining=1;
  E.expire(g,50000);assert.equal(g.phase,'tunnel');assert.equal(g.pending.stage,'result');
  assert.equal(g.result,null);assert.equal(g.pending.until,50000+E.TUNNEL_RESULT_MS);
  E.expire(g,50000+E.TUNNEL_RESULT_MS);assert.equal(g.phase,'finished');assert.ok(g.result);
});
test('serialized/reconnected shared stages preserve time, including a full-room absence', () => {
  const g=setup(), saved=JSON.parse(JSON.stringify(g));
  shiftDeadlines(saved,6000);
  assert.equal(saved.pending.startedAt,18000);assert.equal(saved.pending.until,20800);
  assert.equal(E.expire(saved,20799),false);E.expire(saved,20800);
  assert.equal(saved.turnDeadline,68800);assert.equal(saved.pending.offerRemaining[1],8000);
  E.action(saved,0,{type:'decline_tunnel'},{now:22000});E.expire(saved,22000+E.TUNNEL_RESULT_MS);
  assert.equal(saved.players[1].offer.deadline,30000+E.TUNNEL_RESULT_MS);
});
test('room alarm follows stages instead of spinning on frozen ticket deadlines', () => {
  const g=setup(false), room={code:'TUNNEL',game:g}, rooms=new Map([[room.code,room]]);
  let now=12000, timer, calls=0;
  const clock=createGameClock({rooms,now:()=>now,setTimer:(fn,ms)=>(timer={fn,ms}),clearTimer:()=>{},
    sendRoom:()=>calls++});
  clock.sync(room);assert.equal(timer.ms,2800);
  now+=timer.ms;timer.fn();assert.equal(g.pending.stage,'result');assert.equal(timer.ms,E.TUNNEL_RESULT_MS);
  now+=timer.ms;timer.fn();assert.equal(g.current,1);assert.equal(g.players[1].offer.deadline,22800+E.TUNNEL_RESULT_MS);
  assert.equal(timer.ms,8000);assert.equal(calls,2);clock.close();
});
test('legacy saved payment decisions become shared without resetting the turn deadline', () => {
  const g=setup();delete g.pending.stage;delete g.pending.offerRemaining;g.turnDeadline=18000;
  E.ensureTiming(g,15000);
  assert.equal(g.pending.stage,'decision');assert.equal(g.turnDeadline,18000);
  assert.deepEqual(E.view(g,2).sharedTunnel.revealed,g.pending.revealed);
  E.action(g,0,{type:'decline_tunnel'},{now:16000});E.expire(g,16000+E.TUNNEL_RESULT_MS);
  assert.equal(g.players[1].offer.deadline,21000+E.TUNNEL_RESULT_MS);
});

for (const extraWild of [0, 1]) test(`public tunnel receipt records exact base and extra, extraWild=${extraWild}`, () => {
  const g=setup();g.players[0].hand.push('wild','blue');
  const original=[...g.players[0].hand];
  for(const seat of [-1,1,2]) {
    const v=E.view(g,seat);assert.deepEqual(v.sharedTunnel.base,{color:'red',regular:2,wild:0});
    assert.equal(v.sharedTunnel.extra,undefined);assert.equal(v.tunnel,null);
    assert.deepEqual(v.hand,seat===-1?[]:g.players[seat].hand);
    assert.ok(v.players.every(p=>!('hand' in p)));
    assert.deepEqual(v.events.find(e=>e.type==='tunnel_reveal').base,g.pending.base);
  }
  E.expire(g,g.pending.until);E.action(g,0,{type:'pay_tunnel',extraWild},{now:18000});
  assert.equal(g.players[0].hand.length,original.length-3);
  for(const seat of [-1,0,1,2]) {
    const receipt=E.view(g,seat).sharedTunnel;
    assert.deepEqual(receipt.extra,{color:'red',regular:1-extraWild,wild:extraWild});
    assert.equal(receipt.outcome,'built');assert.equal(receipt.resultStartedAt,18000);
    assert.equal(receipt.until,18000+E.TUNNEL_RESULT_MS);
  }
  const saved=JSON.parse(JSON.stringify(g));shiftDeadlines(saved,6000);
  assert.equal(saved.pending.resultStartedAt,24000);assert.equal(saved.pending.until,24000+E.TUNNEL_RESULT_MS);
  assert.deepEqual(E.view(saved,-1).sharedTunnel.extra,g.pending.extra);
});
for(const timeout of [false,true]) test(`declining returns the reservation without charging, timeout=${timeout}`,()=>{
  const g=setup(),hand=[...g.players[0].hand],trains=g.players[0].trains;
  E.expire(g,g.pending.until);
  if(timeout)E.expire(g,g.turnDeadline);else E.action(g,0,{type:'decline_tunnel'},{now:20000});
  const receipt=E.view(g,-1).sharedTunnel;
  assert.equal(receipt.outcome,'declined');assert.equal(receipt.reason,timeout?'timeout':null);
  assert.equal(receipt.extra,null);assert.deepEqual(g.players[0].hand,hand);
  assert.equal(g.players[0].trains,trains);assert.equal(g.routes[0].owner,null);assert.equal(g.players[0].score,0);
  const until=g.pending.until;assert.equal(E.expire(g,until-1),false);E.expire(g,until);assert.equal(g.current,1);
});
test('zero-surcharge receipt has an explicit zero extra and never charges twice',()=>{
  const g=setup(false);E.expire(g,g.pending.until);
  assert.deepEqual(E.view(g,-1).sharedTunnel.extra,{color:'red',regular:0,wild:0});
  const hand=[...g.players[0].hand];assert.equal(hand.length,1);
  E.expire(g,g.pending.until);assert.deepEqual(g.players[0].hand,hand);
});

test('automatic supplement reserves the base before selecting and spending locomotives',()=>{
  const g=setup();g.players[0].hand=['red','red','wild'];
  E.expire(g,g.pending.until);
  E.action(g,0,{type:'pay_tunnel'},{now:18000});
  assert.deepEqual(g.players[0].hand,[]);assert.equal(g.routes[0].owner,0);
  assert.deepEqual(g.pending.extra,{color:'red',regular:0,wild:1});
  assert.equal(g.players[0].trains,43);assert.equal(g.players[0].score,2);
  assert.equal(g.events.filter(e=>e.type==='build').length,1);
});

test('a rejected supplement preserves the whole game and a following decline advances once',()=>{
  const g=setup();g.players[0].hand=['red','red','wild'];E.expire(g,g.pending.until);
  const before=structuredClone(g), records=[];E.observe(g,entry=>records.push(entry));
  assert.throws(()=>E.action(g,0,{type:'pay_tunnel',extraWild:0},{now:18000}),/suficientes cartas/);
  assert.deepEqual(g,before);assert.deepEqual(records,[]);
  E.action(g,0,{type:'decline_tunnel'},{now:19000});const serial=g.turnSerial,until=g.pending.until;
  assert.equal(E.expire(g,until),true);assert.equal(E.expire(g,until),false);
  assert.equal(g.turnSerial,serial+1);assert.equal(g.current,1);
  assert.deepEqual(records.map(r=>[r.action.type,r.automatic]),[['decline_tunnel',false],['tunnel_closed',true]]);
  assert.deepEqual(g.players[0].hand,before.players[0].hand);
});
