"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const Replay=require('../shared/replay-state');
test('replay differences preserve array replacement, journal appends, deletions and owned application',()=>{
 const before={game:{hand:['red'],journal:[{id:1,events:[{type:'draw'}]}],old:true},views:[{turnHistory:[{events:[]}]}]};
 const after={game:{hand:['red','blue'],journal:[{id:1,events:[{type:'draw'}]},{id:2,events:[]}]},views:[{turnHistory:[{events:[{type:'draw'}]}]}]};
 const frozen=structuredClone(before),changes=Replay.diff(before,after);
 assert.deepEqual(changes,[{path:['game','old'],remove:true},{path:['game','hand'],value:['red','blue']},
  {path:['game','journal','1'],value:{id:2,events:[]}},{path:['views','0','turnHistory','0','events','0'],value:{type:'draw'}}]);
 const result=Replay.apply(before,changes);assert.deepEqual(result,after);assert.deepEqual(before,frozen);
 result.game.hand.push('white');assert.equal(after.game.hand.length,2);
 assert.deepEqual(Replay.diff(before,structuredClone(before)),[]);
 assert.deepEqual(Replay.apply(before,Replay.diff(before,null)),null);
});
