"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const Stream=require('../shared/state-stream');
const Engine=require('../backend/engine');

test('incremental authorized views reconstruct exactly without UI mutation of the base',()=>{
 const writer=Stream.writer(),reader=Stream.reader(),game=Engine.newGame(['A','B'],0,1000);
 const send=view=>{const message=JSON.parse(writer.write(view)),decoded=reader.read(message);assert.deepEqual(decoded,view);return {message,decoded};};
 const first={type:'state',definition:Engine.definition(game),game:Engine.view(game,0,{now:1000}),drawReceipts:[]};
 assert.equal(send(first).message.type,'state');
 const next=structuredClone(first);delete next.definition;next.game.serverNow=2000;next.game.hand.push('red');next.drawReceipts.push({id:'first',eventId:1});
 const result=send(next);assert.equal(result.message.type,'state_patch');assert.ok(JSON.stringify(result.message).length<JSON.stringify(next).length/4);
 result.decoded.game.hand.length=0;result.decoded.game.routes[0].owner=99;
 const third=structuredClone(next);third.game.serverNow=3000;third.game.hand.pop();delete third.game.earlyFinish;third.game.extra={a:[null,1],b:true};
 send(third);
 const spectator={type:'state',game:Engine.view(game,-1,{now:4000})};send(spectator);
 assert.deepEqual(reader.read(JSON.parse(writer.write(spectator))).game.hand,[]);
});

test('missing, duplicated, malformed and unsafe patches require a new complete snapshot',()=>{
 const writer=Stream.writer(),reader=Stream.reader(),initial={type:'state',game:{revision:1,routes:Array(100).fill({owner:null}),hand:['red']}};
 const first=JSON.parse(writer.write(initial)),second=JSON.parse(writer.write({...initial,game:{...initial.game,serverNow:5}}));
 assert.throws(()=>reader.read(second),/sequence/);reader.read(first);reader.read(second);assert.throws(()=>reader.read(second),/sequence/);
 assert.throws(()=>reader.read({...second,baseSequence:2,stateSequence:3,changes:[{path:['__proto__','leaked'],value:true}]}),/Invalid replay path/);
 assert.equal({}.leaked,undefined);
 writer.reset();assert.deepEqual(reader.read(JSON.parse(writer.write(initial))),initial);
 reader.read({type:'room_closed'});assert.throws(()=>reader.read(second),/sequence/);
});

test('legacy state, same revision clocks and explicit full reset remain compatible',()=>{
 const reader=Stream.reader(),writer=Stream.writer(),state={type:'state',game:{revision:4,padding:'x'.repeat(500),serverNow:1}};
 assert.equal(reader.read(state),state);
 reader.read(JSON.parse(writer.write(state)));
 const clock={...state,game:{...state.game,serverNow:2}};assert.deepEqual(reader.read(JSON.parse(writer.write(clock))),clock);
 writer.reset();const other={type:'state',game:{revision:0,hand:['blue']}};
 const full=JSON.parse(writer.write(other));assert.equal(full.type,'state');assert.deepEqual(reader.read(full),other);
});
