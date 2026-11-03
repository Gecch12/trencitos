"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const Draw = require('../frontend/draw-intent');
const view = () => ({phase:'play',current:0,drawCount:0,turnSerial:7,revision:10,
  face:['red','red','blue','wild','green'],deckCount:20,discardCount:0,events:[]});
function next(first, overrides = {}) {
  return {...view(),revision:11,drawCount:1,events:[{id:1,type:'draw',seat:0,index:first.index,color:first.color||'orange'}],...overrides};
}
test('blind intent contains no prediction of its color and cannot exceed the available draws', () => {
  const game=view(),first=Draw.create(game,0,-1);assert.equal(first.color,null);
  assert.equal(Draw.canQueue(first,game,-1),true);
  assert.equal(Draw.canQueue(first,{...game,deckCount:1},-1),false);
  assert.equal(Draw.canQueue(Draw.create({...game,drawCount:1},0,-1),game,0),false);
  for(const changed of [{current:1},{phase:'initial'},{turnWaiting:true},{drawCount:2},{deckCount:0}])
    assert.equal(Draw.create({...game,...changed},0,-1),null);
  assert.equal(Draw.canQueue(first,game,3),false);
  assert.equal(Draw.canQueue(Draw.create(game,0,3),game,-1),false);
});
test('a queued visible card is an untouched slot, even when other slots have the same color', () => {
  const game=view(),first=Draw.create(game,0,0),queued=Draw.create(game,0,1);
  assert.equal(Draw.canQueue(first,game,0),false);assert.equal(Draw.canQueue(first,game,1),true);
  const after=next(first,{face:['black','red','blue','wild','green']});
  assert.equal(Draw.rebase(first,queued,after,1).index,1);
  assert.deepEqual(game,view(),'presentation never mutates authoritative state');
});
test('depletion rebases the same untouched slot; renewal, another revision and another turn cancel it', () => {
  const game=view(),first=Draw.create(game,0,0),queued=Draw.create(game,0,2);
  const after=next(first,{face:['red','blue','wild','green'],deckCount:0});
  assert.equal(Draw.rebase(first,queued,after,1).index,1);
  for(const overrides of [{revision:12},{turnSerial:8},{current:1},{phase:'finished'},
    {face:['red','yellow','wild','green']},
    {events:[...after.events,{id:2,type:'market_refresh',before:game.face,after:after.face}]}])
    assert.equal(Draw.rebase(first,queued,{...after,...overrides},1),null);
  assert.equal(Draw.rebase(first,queued,after,99),null);
  assert.equal(Draw.rebase(first,queued,{...after,events:[{id:1,type:'draw',seat:1,index:0}]},1),null);
});
test('hand previews contain only known colors or unknown backs, never double count a confirmed state', () => {
  const game=view(), first=Draw.create(game,0,0), queued=Draw.create(game,0,-1);
  const before=structuredClone(game);
  assert.deepEqual(Draw.pending(game,first,queued).map(i=>i.color),['red',null]);
  const after=next(first,{face:['orange','red','blue','wild','green']});
  assert.deepEqual(Draw.pending(after,first,queued),[queued],'state arrives before ACK');
  assert.deepEqual(Draw.pending(after,first,null),[]);
  for(const changed of [{revision:12},{turnSerial:8},{current:1},{turnWaiting:true},{phase:'finished'},
    {events:[...after.events,{id:2,type:'market_refresh'}]}, {events:[]}])
    assert.deepEqual(Draw.pending({...after,...changed},first,queued),[]);
  assert.deepEqual(game,before);
});

test('two visible wildcards require seeing a visible replacement before choosing again',()=>{
 const game={...view(),face:['wild','wild','red','green','blue']};
 const visible=Draw.create(game,0,2),blind=Draw.create(game,0,-1);
 assert.equal(Draw.canQueue(visible,game,3),false);
 assert.equal(Draw.canQueue(visible,game,-1),false);
 assert.equal(Draw.canQueue(blind,game,-1),true);
 const after=next(visible,{face:['wild','wild','yellow','green','blue']});
 assert.ok(Draw.create(after,0,3),'replacement settled: second choice is available');
});
