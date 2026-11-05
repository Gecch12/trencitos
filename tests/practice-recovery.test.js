"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {connect}=require('./helpers/ws-client');
const {loadState}=require('../backend/room-store');

for(const kind of ['legacy-practice','solo-bots']) test(kind+' survives a real server restart and restores the private pending choice and clock',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-practice-restart-')),file=path.join(directory,'rooms.json');
  const processes=[],peers=[];
  const stop=async child=>{if(child.exitCode!==null)return;const ended=once(child,'exit');child.kill('SIGTERM');await ended;};
  t.after(async()=>{peers.forEach(peer=>peer.close());for(const child of processes)await stop(child);fs.rmSync(directory,{recursive:true,force:true});});
  async function start(){
    const child=spawn(process.execPath,['-e',`const app=require('./backend/server');app.ready.then(()=>app.server.listen(0,'127.0.0.1',()=>process.send({port:app.server.address().port})));process.on('SIGTERM',async()=>{await app.shutdown();process.exit(0);});`],
      {cwd:path.resolve(__dirname,'..'),env:{...process.env,STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false',RENDER:'false'},stdio:['ignore','ignore','pipe','ipc']});
    processes.push(child);let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
    const ready=await Promise.race([once(child,'message').then(([value])=>value),once(child,'exit').then(()=>{throw Error(errors||'Server exited before ready');})]);
    return {child,port:ready.port};
  }
  const first=await start(),owner=await connect(first.port);peers.push(owner);
  owner.send({type:kind==='legacy-practice'?'create_test':'create',name:'Volver',visibility:'private'});const lobby=await owner.next('lobby');
  if(kind==='solo-bots') {owner.send({type:'add_bot'});await owner.next('lobby',m=>m.members.length===2);owner.send({type:'start'});}
  await owner.next('state');
  owner.close();await stop(first.child);
  const saved=loadState(file).rooms.find(room=>room.code===lobby.code);
  assert.equal(!!saved.practice,kind==='legacy-practice');const paused=saved.practice?saved.practicePausedAt:saved.emptySince;assert.ok(paused);assert.ok(saved.members[0].tokenHash);assert.equal(saved.members[0].token,undefined);
  const budget=saved.game.initialDeadline-paused;
  const next=await start(),intruder=await connect(next.port);peers.push(intruder);
  intruder.send({type:'join',code:lobby.code,token:'wrong'});assert.equal((await intruder.next('error')).code,'INVALID_TOKEN');
  const returning=await connect(next.port);peers.push(returning);returning.send({type:'join',code:lobby.code,token:lobby.token});
  assert.equal((await returning.next('lobby')).practice,kind==='legacy-practice');
  const restored=(await returning.next('state')).game;
  assert.deepEqual(restored.initial,saved.game.players[0].pending);assert.deepEqual(restored.hand,saved.game.players[0].hand);
  assert.equal(restored.current,saved.game.current);assert.equal(restored.phase,saved.game.phase);
  assert.ok(Math.abs((restored.initialDeadline-restored.serverNow)-budget)<100);
  returning.send({type:kind==='legacy-practice'?'leave_test':'leave'});await returning.next('room_closed');
  assert.equal(loadState(file).rooms.some(room=>room.code===lobby.code),false);
});
