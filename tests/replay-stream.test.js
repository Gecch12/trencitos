'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectReplay,streamReplay}=require('../game/queries/replay-view');
const {recording}=require('./helpers/map-recording');
const legacy=require('./fixtures/replay-europe-v1.json');
const Replay=require('../shared/replay-state');
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
for(const source of ['current','legacy'])test(`compact ${source} stream preserves every recorded POV and can paint after one frame`,async()=>{
 const record=source==='current'?recording().record:legacy.record,before=JSON.stringify(record);
 const expected=projectReplay(record,{full:true}),cursor=Replay.cursor();let read=0,index=0;
 async function* frames(){for(const frame of record.frames){read++;yield frame;}}
 const stream=streamReplay(record,{full:true,compact:true},frames());
 const metadata=JSON.parse((await stream.next()).value);assert.equal(metadata.type,'match');assert.equal(read,1);
 const first=JSON.parse((await stream.next()).value);assert.equal(first.type,'frame');assert.equal(read,1);
 function check(item){
   const state=cursor.push(item.frame),original=Replay.at(expected.frames,index++);
   for(let seat=0;seat<original.views.length;seat++){
     const wanted=structuredClone(original.views[seat]),actual=Replay.view(state,seat);
     if(state.shared?.turnHistory)delete wanted.history;
     assert.deepEqual(actual,wanted);
   }
   assert.deepEqual(state.definition,original.definition);assert.deepEqual(state.members,original.members);
   assert.equal(state.knowledge,undefined);
 }
 check(first);let ended=false;
 for await(const line of stream){const item=JSON.parse(line);if(item.type==='frame')check(item);else{assert.equal(item.type,'end');assert.equal(item.steps,record.frames.length);ended=true;}}
 assert.equal(ended,true);assert.equal(index,record.frames.length);assert.equal(JSON.stringify(record),before);
});
test('compact stream closes on cancellation and never seals a truncated recording',async()=>{
 const record=recording().record;let read=0,closed=false;
 async function* frames(){try{for(const frame of record.frames){read++;yield frame;}}finally{closed=true;}}
 const stream=streamReplay(record,{full:true,compact:true},frames());await stream.next();await stream.return();assert.equal(read,1);assert.equal(closed,true);
 let output='';await assert.rejects(async()=>{for await(const line of streamReplay(record,{full:true,compact:true},record.frames.slice(0,1)))output+=line;},/Incomplete replay/);
 assert.ok(!output.includes('"type":"end"'));
});
test('cursor seeks backward, forward and across checkpoints without changing stored frames',()=>{
 const frames=recording().record.frames,before=JSON.stringify(frames),cursor=Replay.cursor(frames);
 for(const step of [0,1,frames.length-1,1,0,frames.length-1])assert.deepEqual(cursor.at(step),Replay.at(frames,step));
 assert.equal(JSON.stringify(frames),before);
 assert.throws(()=>cursor.at(-1),/Invalid replay step/);
});
