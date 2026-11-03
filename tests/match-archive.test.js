"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../backend/engine'),Replay=require('../shared/replay-state');
const {createMatchArchive,frameHash}=require('../backend/match-archive');
const {guestId,ensureGuest}=require('../backend/guest-identity');
function fixture(visibility='private'){
 const archive=createMatchArchive(),room={code:'12345678',visibility,archiveFull:true,members:[{name:'Rooms',color:'#d45748',guestId:'a'.repeat(64)},{name:'B',color:'#4c8dcc',guestId:'b'.repeat(64)}],game:Engine.newGame(['Rooms','B'])};
 const save=()=>{archive.capture(room);archive.commit(archive.prepare());};
 save();Engine.observe(room.game,event=>{room.archiveAction=event;archive.capture(room)});return {archive,room,save};
}
test('all recorded outcomes survive closure; unfinished points never become a final result',async()=>{
 const {archive,room,save}=fixture();
 for(const seat of [0,1])Engine.action(room.game,seat,{type:'choose_initial',indexes:[0,1]});
 Engine.action(room.game,0,{type:'draw_train',index:-1});save();
 const count=room.archiveSeq;save();assert.equal(room.archiveSeq,count);
 archive.capture(room,'Abandono definitivo');archive.commit(archive.prepare());
 const result=await archive.replay({guestId:'a'.repeat(64)},room.matchId);
 assert.equal(result.full,true);assert.equal(result.match.status,'abandoned');assert.ok(result.match.scores.every(s=>s.partial&&!s.winner));
 assert.deepEqual(Replay.at(result.frames,result.frames.length-1).views[1].hand,room.game.players[0].hand);
 const audit=await archive.replay({guestId:'a'.repeat(64)},room.matchId,true);
 for(const [i,frame]of audit.frames.entries()){
  const {hash,...body}=frame;assert.equal(hash,frameHash(body));assert.equal(frame.previousHash,i?audit.frames[i-1].hash:null);
 }
 const {verifyAudit}=require('../scripts/verify-match-audit');
 assert.equal(verifyAudit(audit).integrity,true);
 const tampered=structuredClone(audit);tampered.frames[0].snapshot.game.current=999;
 assert.throws(()=>verifyAudit(tampered),/cadena/);
 assert.ok(audit.frames.some(f=>f.action?.action.type==='draw_train'));
 assert.equal(Replay.at(audit.frames,0).game.phase,'initial');
});
test('private replay, public projection, active secrecy and completed point sources',async()=>{
 const {archive,room,save}=fixture('public');
 await assert.rejects(()=>archive.replay({guestId:'a'.repeat(64)},room.matchId),e=>e.status===409);
 for(const seat of [0,1])Engine.action(room.game,seat,{type:'choose_initial',indexes:[0,1]});
 Engine.finish(room.game,true);save();
 const own=await archive.replay({guestId:'a'.repeat(64)},room.matchId),outside=await archive.replay({},room.matchId);
 assert.equal(own.match.status,'completed');
 for(const s of own.match.scores){assert.equal(s.score,s.route+s.destination+s.stations+s.express);assert.ok(s.details.destinations.length);}
 for(let step=0;step<outside.frames.length;step++){
  const data=Replay.at(outside.frames,step);assert.equal(data.views.length,3);assert.deepEqual(data.views[0].hand,[]);assert.deepEqual(data.views[0].tickets,[]);assert.equal(data.views[0].initial,null);
  assert.deepEqual(outside.frames[step].action,own.frames[step].action);
  for(const r of data.views[0].result||[]){assert.ok(r.tickets.length);assert.ok(r.details.destinations.length);}
 }
 await assert.rejects(()=>archive.replay({},room.matchId,true),e=>e.status===403);
 const privateFixture=fixture('private');privateFixture.archive.capture(privateFixture.room,'Abandono');privateFixture.archive.commit(privateFixture.archive.prepare());
 await assert.rejects(()=>privateFixture.archive.replay({},privateFixture.room.matchId),e=>e.status===404);
});
test('verified account merge preserves existing histories, is idempotent, and blocks another account',async()=>{
 const {archive,room,save}=fixture();archive.capture(room,'Abandono');archive.commit(archive.prepare());
 const claim=await archive.claim('a'.repeat(64),'account-a');archive.restore({...archive.state,...claim});
 assert.equal((await archive.list({accountId:'account-a'})).length,1);
 assert.equal((await archive.list({guestId:'a'.repeat(64)})).length,0);
 assert.equal((await archive.list({accountId:'account-b'})).length,0);
 await archive.claim('a'.repeat(64),'account-a');
 assert.throws(()=>archive.claim('a'.repeat(64),'account-b'),e=>e.status===409);
 assert.equal((await archive.replay({accountId:'account-a'},room.matchId)).full,true);
});
test('closed replay reveals blind thumbnails in every perspective and frame',async()=>{
 const {archive,room,save}=fixture('public');
 for(const seat of [0,1])Engine.action(room.game,seat,{type:'choose_initial',indexes:[0,1]});
 const color=room.game.deck.at(-1);Engine.action(room.game,0,{type:'draw_train',index:-1});save();
 archive.capture(room,'Abandono');archive.commit(archive.prepare());
 const publicReplay=await archive.replay({},room.matchId),own=await archive.replay({guestId:'a'.repeat(64)},room.matchId);
 assert.ok(publicReplay.frames.flatMap(f=>f.events).some(e=>e.draw));
 for(const e of publicReplay.frames.flatMap(f=>f.events).filter(e=>e.draw))assert.deepEqual(e.draw,{index:-1,color});
 const data=Replay.at(publicReplay.frames,publicReplay.frames.length-1);
 assert.deepEqual(data.views[0].history.find(e=>e.draw).draw,{index:-1,color});
 const ownData=Replay.at(own.frames,own.frames.length-1);
 assert.deepEqual(ownData.views[1].history.find(e=>e.draw).draw,{index:-1,color});
 assert.deepEqual(ownData.views[2].history.find(e=>e.draw).draw,{index:-1,color});
});
test('guest ownership uses an unguessable cookie, not the nickname; cookie is HttpOnly',()=>{
 const headers={},req={headers:{'x-forwarded-proto':'https'}},res={getHeader:k=>headers[k],setHeader:(k,v)=>headers[k]=v};
 const id=ensureGuest(req,res),cookie=headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly; SameSite=Lax/);assert.match(cookie,/Secure/);
 req.headers.cookie=cookie.split(';')[0];assert.equal(guestId(req),id);assert.equal(ensureGuest(req,res),id);
 assert.notEqual(ensureGuest(req,res,true),id);assert.equal(guestId({headers:{cookie:'trencitos_guest=Rooms'}}),null);
});
test('history identifies the owned seat with duplicate names, applies all tie breaks and leaves unfinished ranks empty',async()=>{
 const {archive,room,save}=fixture();const identity={guestId:'b'.repeat(64)};
 let row=(await archive.list(identity))[0];assert.equal(row.ownSeat,1);assert.equal(row.rank,null);
 Engine.finish(room.game,true);save();
 const record=archive.state.matches[room.matchId];record.players.forEach(p=>p.name='Angel');
 const base={score:100,completed:2,stations:8,express:0};
 record.scores=[{seat:0,...base},{seat:1,...base}];
 row=(await archive.list(identity))[0];assert.equal(row.rank,1);assert.equal(row.ownSeat,1);
 for(const delta of [{score:101},{completed:3},{stations:12},{express:10}]){
  record.scores[0]={seat:0,...base,...delta};assert.equal((await archive.list(identity))[0].rank,2);
 }
 record.scores[0]={seat:0,...base,score:99,completed:20,stations:12,express:10};
 assert.equal((await archive.list(identity))[0].rank,1);
 record.status='abandoned';assert.equal((await archive.list(identity))[0].rank,null);
 const claim=await archive.claim(identity.guestId,'account-b');archive.restore({...archive.state,...claim});
 row=(await archive.list({accountId:'account-b'}))[0];assert.equal(row.ownSeat,1);
 assert.ok(row.players.every(p=>!('guestId' in p)&&!('accountId' in p)));
 assert.deepEqual(await archive.list(identity),[]);
});
test('orphaned active recordings close on restart, and existing rooms remain active',async()=>{
 const {archive,room}=fixture();await archive.bootstrap(new Map([[room.code,room]]));assert.equal(archive.state.matches[room.matchId].status,'active');
 await archive.bootstrap(new Map());assert.equal(archive.state.matches[room.matchId].status,'abandoned');
});
test('remote frame pages are loaded only after closed-game authorization',async()=>{
 const {archive:local,room}=fixture();local.capture(room,'Abandono');local.commit(local.prepare());
 const {frames,...record}=local.state.matches[room.matchId];let reads=0;
 const archive=createMatchArchive({remote:{readArchive:async()=>({matches:[record],claims:{}}),readFrames:async()=>{reads++;return frames;}}});
 record.visibility='private';await assert.rejects(()=>archive.replay({},room.matchId),e=>e.status===404);assert.equal(reads,0);
 record.visibility='public';await assert.rejects(()=>archive.replay({},room.matchId,true),e=>e.status===403);assert.equal(reads,0);
 record.status='active';await assert.rejects(()=>archive.replay({},room.matchId),e=>e.status===409);assert.equal(reads,0);
 record.status='abandoned';assert.equal((await archive.replay({},room.matchId)).full,true);assert.equal(reads,1);
});
test('completed archive is sealed before later disconnects and room expiry',async()=>{
 const {archive,room,save}=fixture();Engine.finish(room.game,true);save();
 const before=structuredClone(archive.state.matches[room.matchId]);
 room.members[0].autopilot=true;room.members[0].ws=null;
 archive.capture(room,'Partida abandonada: nadie se reconectó durante 60 segundos.');archive.commit(archive.prepare());
 assert.deepEqual(archive.state.matches[room.matchId],before);
 assert.equal(before.status,'completed');assert.ok(room.archiveClosedAt);
});

test('capture normalizes old live results while replay preserves legacy frames and hashes',async()=>{
 const {archive,room}=fixture('public');Engine.finish(room.game,true);
 for(const row of room.game.result)delete row.details;
 archive.capture(room);archive.commit(archive.prepare());
 assert.ok(room.game.result.every(row=>row.details));
 const record=archive.state.matches[room.matchId];
 // Represent a historical recording whose stored final projections lack details.
 const final=structuredClone(room._archiveState);
 for(const row of final.game.result)delete row.details;
 for(const view of final.views)for(const row of view.result||[])delete row.details;
 const frame={seq:0,at:123,action:null,events:[],previousHash:null,snapshot:final};frame.hash=frameHash(frame);
 record.frames=[frame];record.steps=1;record.digest=frame.hash;
 const before=structuredClone(record),original=Engine.normalize;
 Engine.normalize=()=>{throw Error('Replay must not normalize historical frames');};
 try {
  for(const identity of [{guestId:'a'.repeat(64)},{}]){
   const replay=await archive.replay(identity,room.matchId);
   assert.ok(Replay.at(replay.frames,0).views[0].result.every(row=>!row.details));
  }
  const audit=await archive.replay({guestId:'a'.repeat(64)},room.matchId,true);
  assert.deepEqual(audit.frames,[frame]);assert.deepEqual(record,before);
  const {hash,...hashed}=frame;assert.equal(hash,frameHash(hashed));
 }finally{Engine.normalize=original;}
});
