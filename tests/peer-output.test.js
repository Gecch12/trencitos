"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {createPeerOutput}=require('../backend/peer-output');
const {createDurableQueue}=require('../backend/durable-queue');
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
