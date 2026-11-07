"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createPeerOutput}=require('../backend/peer-output');
const {createDurableQueue}=require('../backend/durable-queue');
const Stream=require('../shared/state-stream');
function fixture(){const writes=[],jobs=[];let live=true;const output=createPeerOutput({write:b=>writes.push(b.toString()),frame:(op,s)=>Buffer.from(s+'\n'),live:()=>live,schedule:fn=>jobs.push(fn)});return {output,writes,flush:()=>jobs.splice(0).forEach(fn=>fn()),close:()=>{live=false;}};}
test('one socket write carries consecutive ordered WebSocket frames',()=>{
 const f=fixture();for(const type of ['lobby','storage','state','ack'])f.output.send(JSON.stringify({type}));
 assert.equal(f.writes.length,0);f.flush();assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].trim().split('\n').map(s=>JSON.parse(s).type),['lobby','storage','state','ack']);
});
test('compact clients skip unchanged metadata and definitions, legacy clients keep full messages',()=>{
 for(const compact of [true,false]){const f=fixture(),lobby={type:'lobby',members:['A']},definition={mapRef:{id:'south-america',version:'3.3-beta'}},state={type:'state',definition,game:{revision:1}};
  f.output.send(JSON.stringify(lobby),compact);f.output.send(JSON.stringify(state),compact);f.flush();
  f.output.send(JSON.stringify(lobby),compact);f.output.send(JSON.stringify({...state,game:{revision:2}}),compact);f.flush();
  const sent=f.writes[1].trim().split('\n').map(JSON.parse);assert.equal(sent.length,compact?1:2);assert.equal(!!sent.at(-1).definition,!compact);
  f.output.send(JSON.stringify({...state,definition:{...definition,mapRef:{id:'europe',version:'1'}}}),compact);f.flush();assert.ok(JSON.parse(f.writes[2]).definition);
 }
});
test('failed persistence neither sends nor advances the metadata cache',async()=>{
 const f=fixture();let fail=true;const q=createDurableQueue({capture:()=>null,restore:()=>{},onFailure:()=>{},commit:async()=>{if(fail)throw Error('down');}}),message=JSON.stringify({type:'state',definition:{mapRef:{id:'europe',version:'1'}},game:{revision:1}});
 const run=()=>q.run(()=>{q.dirty();q.defer(()=>f.output.send(message,true));});await run();f.flush();assert.deepEqual(f.writes,[]);fail=false;await run();f.flush();assert.ok(JSON.parse(f.writes[0]).definition);
});
test('closing a peer drops a pending batch',()=>{const f=fixture();f.output.send('{"type":"ack"}');f.close();f.flush();assert.deepEqual(f.writes,[]);});
test('returning to the same room sends chat context again after an exit',()=>{
 const f=fixture(),context=JSON.stringify({type:'chat_context',chatId:'one',revision:0}),lobby=JSON.stringify({type:'lobby',code:'one',seat:0});
 f.output.send(context,2);f.output.send(context,2);f.flush();assert.equal(JSON.parse(f.writes[0]).type,'chat_context');
 f.output.send(lobby,2);f.flush();
 f.output.send(JSON.stringify({type:'room_closed'}),2);f.output.send(lobby,2);f.output.send(context,2);f.flush();
 assert.deepEqual(JSON.parse(f.writes[2]).messages.map(m=>m.type),['room_closed','lobby','chat_context']);
});

test('version two envelopes state and ack in one frame while preserving ordered legacy negotiation',()=>{
 const f=fixture();f.output.send(JSON.stringify({type:'directory'}),0);for(const type of ['lobby','storage','state','ack'])f.output.send(JSON.stringify({type}),2);
 f.flush();const frames=f.writes[0].trim().split('\n').map(JSON.parse);assert.equal(frames.length,2);assert.equal(frames[0].type,'directory');assert.equal(frames[1].type,'batch');assert.deepEqual(frames[1].messages.map(m=>m.type),['lobby','storage','state','ack']);
 f.output.send(JSON.stringify({type:'state'}),2);f.output.send(JSON.stringify({type:'ack'}),2);f.flush();assert.deepEqual(JSON.parse(f.writes[1]).messages.map(m=>m.type),['state','ack']);
});

test('state patches are opt-in, scoped to the seat and reset after storage recovery',()=>{
 const f=fixture(),reader=Stream.reader(),game={revision:5,hand:['red'],routes:Array(100).fill({owner:null})};
 const send=(message,patches=true)=>{f.output.send(JSON.stringify(message),2,patches);f.flush();return JSON.parse(f.writes.at(-1));};
 send({type:'lobby',code:'A',seat:0});const full=send({type:'state',game});reader.read(full);assert.equal(full.type,'state');
 const next={type:'state',game:{...game,hand:['red','green']}};const patch=send(next);assert.equal(patch.type,'state_patch');assert.deepEqual(reader.read(patch),next);
 send({type:'lobby',code:'B',seat:1});const other=send({type:'state',game:{...game,revision:0,hand:['blue']}});assert.equal(other.type,'state');assert.deepEqual(reader.read(other).game.hand,['blue']);
 send({type:'storage',paused:true});assert.equal(send(next).type,'state');
 send({type:'storage',paused:false});assert.equal(send(next).type,'state');
 assert.equal(send(next,false).stateSequence,undefined);assert.equal(send(next).type,'state');
});

test('failed commits never advance the delta base, confirmed retries reconstruct once',async()=>{
 const f=fixture(),reader=Stream.reader(),state={type:'state',game:{revision:0,hand:[],padding:'x'.repeat(1000)}};
 f.output.send(JSON.stringify(state),2,true);f.flush();reader.read(JSON.parse(f.writes[0]));
 let fail=true;const q=createDurableQueue({capture:()=>null,restore:()=>{},onFailure:()=>{},commit:async()=>{if(fail)throw Error('down');}});
 const next={...state,game:{...state.game,revision:1,hand:['red']}};
 const run=()=>q.run(()=>{q.dirty();q.defer(()=>f.output.send(JSON.stringify(next),2,true));});
 await run();f.flush();assert.equal(f.writes.length,1);fail=false;await run();f.flush();
 const patch=JSON.parse(f.writes[1]);assert.equal(patch.baseSequence,1);assert.deepEqual(reader.read(patch),next);
});
