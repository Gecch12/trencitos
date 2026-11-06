"use strict";
// Deterministic contract check; these timings are never production benchmarks.
const test=require('node:test'),assert=require('node:assert/strict'),{once}=require('node:events');
const {fakeSupabase}=require('./helpers/fake-supabase'),{connect}=require('./helpers/ws-client');
test('real dispatch isolates a held/failed room, its archive and recovery receipts',async t=>{
 const api=fakeSupabase({roomTransactions:true}),original=global.fetch,clients=[];
 Object.assign(process.env,{STATE_BACKEND:'supabase',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test_only'});
 global.fetch=(url,options)=>String(url).startsWith(process.env.SUPABASE_URL)?api.fetch(url,options):original(url,options);
 delete require.cache[require.resolve('../backend/server')];const app=require('../backend/server');
 await app.ready;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 t.after(async()=>{for(const c of clients)c.close();await app.shutdown();global.fetch=original;});
 async function playing(){
  const a=await connect(app.server.address().port),b=await connect(app.server.address().port);clients.push(a,b);
  a.send({type:'create',visibility:'private'});const lobby=await a.next('lobby');b.send({type:'join',code:lobby.code});await b.next('lobby');await a.next('lobby',m=>m.members.length===2);
  a.send({type:'start'});await a.next('state');await b.next('state');
  for(const c of [a,b])c.send({type:'action',action:{type:'choose_initial',indexes:[0,1]}});
  await a.next('state',m=>m.game.phase==='play');await b.next('state',m=>m.game.phase==='play');
  await app.drain();const room=app.rooms.get(lobby.code);return{room,client:[a,b][room.game.current],seat:room.game.current};
 }
 const a=await playing(),b=await playing(),beforeA=a.room.game.players[a.seat].hand.length,beforeB=b.room.game.players[b.seat].hand.length;
 const draw=(f,id)=>f.client.send({type:'action',id,revision:f.room.revision,action:{type:'draw_train',index:-1}});
 const release=api.holdRoom(a.room.code);
 draw(a,'isolation-draw-a1');draw(b,'isolation-draw-b1');
 await b.client.next('ack',m=>m.id==='isolation-draw-b1');
 assert.equal(api.state.rooms.find(r=>r.code===a.room.code).game.players[a.seat].hand.length,beforeA);
 assert.equal(api.state.rooms.find(r=>r.code===b.room.code).game.players[b.seat].hand.length,beforeB+1);
 const bArchive=structuredClone(api.state.matches[b.room.matchId]);
 api.failRoom(a.room.code);release();await a.client.next('error',m=>m.code==='STORAGE_FAILED');
 assert.equal(a.room.game.players[a.seat].hand.length,beforeA);
 assert.deepEqual(api.state.matches[b.room.matchId],bArchive);
 draw(b,'isolation-draw-b2');await b.client.next('ack',m=>m.id==='isolation-draw-b2');
 assert.equal(b.room.game.players[b.seat].hand.length,beforeB+2);
 const archived=api.state.matches[b.room.matchId];assert.equal(archived.frames.length,b.room.archiveSeq+1);
 const last=api.calls.filter(c=>c.method==='trencitos_save_rooms'&&c.body.p_changes.some(c=>c.code===b.room.code)).at(-1);
 assert.equal(last.body.p_changes.length,1);assert.ok(last.body.p_archive.every(e=>e.match.code===b.room.code));
 api.failRoom(a.room.code,false);const retryAt=Date.now();a.client.send({type:'retry_save'});
 await a.client.next('state',m=>!m.game.storagePaused&&m.game.serverNow>=retryAt);
 await app.drain();
 assert.equal(a.room.game.players[a.seat].hand.length,beforeA);
 draw(a,'isolation-draw-a1');await a.client.next('ack',m=>m.id==='isolation-draw-a1');
 assert.equal(a.room.game.players[a.seat].hand.length,beforeA+1);
 assert.equal(b.room.game.players[b.seat].hand.length,beforeB+2);
 // Both replies disappear after SQL has committed. Recovery must load that
 // committed receipt, not blindly replay the rolled-back candidate.
 api.lostResponses=2;draw(a,'isolation-draw-a2');
 await a.client.next('error',m=>m.code==='STORAGE_FAILED');
 assert.equal(a.room.game.players[a.seat].hand.length,beforeA+1);
 assert.equal(api.state.rooms.find(r=>r.code===a.room.code).game.players[a.seat].hand.length,beforeA+2);
 const recoverAt=Date.now();
 a.client.send({type:'retry_save'});
 await a.client.next('state',m=>!m.game.storagePaused&&m.game.serverNow>=recoverAt);
 const recoveredFrames=api.state.matches[a.room.matchId].frames.length;
 draw(a,'isolation-draw-a2');await a.client.next('ack',m=>m.id==='isolation-draw-a2');
 assert.equal(a.room.game.players[a.seat].hand.length,beforeA+2);
 assert.equal(api.state.matches[a.room.matchId].frames.length,recoveredFrames);
});
