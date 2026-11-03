'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectReplay,streamReplay}=require('../game/queries/replay-view');
const {recording}=require('./helpers/map-recording');
const legacy=require('./fixtures/replay-europe-v1.json');
for(const source of ['current','legacy'])for(const full of [false,true])for(const audit of [false,true]){
 if(audit&&!full)continue;
 test(`streaming ${source} full=${full} audit=${audit} preserves the exact replay contract`,async()=>{
  const record=source==='current'?recording().record:legacy.record,options={full,audit,includeAnalysis:true};let read=0;
  async function* frames(){for(const f of record.frames){read++;yield f;}}
  const stream=streamReplay(record,options,frames());const first=await stream.next();assert.equal(read,1,'headers require only one source frame');let json=first.value;
  for await(const chunk of stream)json+=chunk;
  assert.deepEqual(JSON.parse(json),JSON.parse(JSON.stringify(projectReplay(record,options))));assert.equal(read,record.frames.length);
 });
}
test('stream cancellation closes the source instead of loading the rest of the match',async()=>{
 const record=recording().record;let read=0,closed=false;
 async function* frames(){try{for(const f of record.frames){read++;yield f;}}finally{closed=true;}}
 const stream=streamReplay(record,{full:false},frames());await stream.next();await stream.return();assert.equal(read,1);assert.equal(closed,true);
});
test('a corrupt later frame cannot produce a valid partial replay',async()=>{
 const record=recording().record;
 async function* frames(){yield record.frames[0];throw Error('truncated page');}
 const stream=streamReplay(record,{full:false},frames());let json='';await assert.rejects(async()=>{for await(const chunk of stream)json+=chunk;},/truncated page/);assert.throws(()=>JSON.parse(json));
});
