"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../engine'),Replay=require('../replay-state');
const {createMatchArchive,frameHash}=require('../match-archive');
const {guestId,ensureGuest}=require('../guest-identity');
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
  const data=Replay.at(outside.frames,step);assert.equal(data.views.length,1);assert.deepEqual(data.views[0].hand,[]);assert.deepEqual(data.views[0].tickets,[]);assert.equal(data.views[0].initial,null);
  assert.ok(!outside.frames[step].action);
  for(const r of data.views[0].result||[]){assert.deepEqual(r.tickets,[]);assert.deepEqual(r.details.destinations,[]);}
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
test('guest ownership uses an unguessable cookie, not the nickname; cookie is HttpOnly',()=>{
 const headers={},req={headers:{'x-forwarded-proto':'https'}},res={getHeader:k=>headers[k],setHeader:(k,v)=>headers[k]=v};
 const id=ensureGuest(req,res),cookie=headers['Set-Cookie'][0];assert.match(cookie,/HttpOnly; SameSite=Lax/);assert.match(cookie,/Secure/);
 req.headers.cookie=cookie.split(';')[0];assert.equal(guestId(req),id);assert.equal(ensureGuest(req,res),id);
 assert.notEqual(ensureGuest(req,res,true),id);assert.equal(guestId({headers:{cookie:'trencitos_guest=Rooms'}}),null);
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
 record.status='abandoned';assert.equal((await archive.replay({},room.matchId)).full,false);assert.equal(reads,1);
});
test('completed archive is sealed before later disconnects and room expiry',async()=>{
 const {archive,room,save}=fixture();Engine.finish(room.game,true);save();
 const before=structuredClone(archive.state.matches[room.matchId]);
 room.members[0].autopilot=true;room.members[0].ws=null;
 archive.capture(room,'Partida abandonada: nadie se reconectó durante 60 segundos.');archive.commit(archive.prepare());
 assert.deepEqual(archive.state.matches[room.matchId],before);
 assert.equal(before.status,'completed');assert.ok(room.archiveClosedAt);
});
