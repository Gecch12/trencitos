"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { once } = require('node:events');
const { connect } = require('./helpers/ws-client');
const Directory = require('../room-directory');
const Engine = require('../engine');
const { serializableRoom } = require('../room-store');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-directory-'));
process.env.STATE_BACKEND='file'; process.env.STATE_FILE=path.join(dir,'rooms.json');
let app, port; const peers=[];
async function client(){const c=await connect(port);peers.push(c);return c;}
async function flush(c){c.send({type:'ping'});await c.next('pong');}
test.before(async()=>{app=require('../server');await app.ready;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');port=app.server.address().port;});
test.after(async()=>{peers.forEach(c=>c.close());await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});});

test('legacy/private/practice/abandoned/finished rooms never enter the public directory',()=>{
  const base={code:'123456',members:[{name:'A',color:'red',token:'secret',accountId:'private'}]};
  const rooms=new Map([
    ['old',{...base}],['private',{...base,visibility:'private'}],['practice',{...base,visibility:'public',practice:true}],
    ['gone',{...base,visibility:'public',emptySince:1}],['done',{...base,visibility:'public',game:{phase:'finished'}}],
    ['public',{...base,visibility:'public',maxPlayers:3}],
  ]);
  const entries=Directory.listRooms(rooms);
  assert.equal(entries.length,1);assert.equal(entries[0].maxPlayers,3);
  assert.doesNotMatch(JSON.stringify(entries),/secret|accountId|token/);
  assert.equal(serializableRoom(base).visibility,'private');
});
test('spectator projection excludes hands, destinations, hidden draws and tunnel reveals',()=>{
  const g=Engine.newGame(['A','B']);
  g.events=[{id:1,type:'draw',seat:0,index:-1,color:'red'},{id:2,type:'tunnel_reveal',seat:0,revealed:['red']}];
  g.lastDraw={id:1,seat:0,index:-1,color:'red'};
  const view=Engine.view(g,-1);
  assert.equal(view.spectator,true);assert.equal(view.seat,-1);
  for(const key of ['hand','tickets','ticketPaths','ticketProgress']) assert.deepEqual(view[key],[]);
  for(const key of ['initial','ticketOffer','pending','tunnel','result']) assert.equal(view[key],null);
  assert.equal(view.events.length,1);assert.equal(view.events[0].color,undefined);assert.equal(view.drawEvent.color,undefined);
  for(const p of view.players){assert.equal(p.hand,undefined);assert.equal(p.tickets,undefined);}
});
test('directory updates, host controls, bots, full capacity, persistence and spectator permissions',async()=>{
  const lobby=await client();lobby.send({type:'list_rooms'});await lobby.next('directory');
  const host=await client();host.send({type:'create',code:'834001',name:'Host',maxPlayers:3});
  const created=await host.next('lobby');assert.equal(created.visibility,'public');
  assert.equal((await lobby.next('directory',m=>m.rooms.some(r=>r.code==='834001'))).rooms[0].members.length,1);
  const guest=await client();guest.send({type:'join',code:'834001',name:'Guest'});await guest.next('lobby');
  guest.send({type:'add_bot'});assert.equal((await guest.next('error')).code,'HOST_ONLY');
  host.send({type:'room_settings',visibility:'private',maxPlayers:3});await host.next('lobby',m=>m.visibility==='private');
  await lobby.next('directory',m=>!m.rooms.some(r=>r.code==='834001'));
  host.send({type:'room_settings',visibility:'public',maxPlayers:3});await host.next('lobby',m=>m.visibility==='public');
  host.send({type:'add_bot'});const full=await host.next('lobby',m=>m.members.length===3);
  assert.equal(full.members[2].bot,true);assert.equal(new Set(full.members.map(m=>m.color)).size,3);
  host.send({type:'add_bot'});assert.equal((await host.next('error')).code,'ROOM_FULL');
  const overflow=await client();overflow.send({type:'join',code:'834001',name:'Overflow'});assert.equal((await overflow.next('error')).code,'ROOM_FULL');
  const saved=JSON.parse(fs.readFileSync(process.env.STATE_FILE)).find(r=>r.code==='834001');
  assert.equal(saved.members[2].bot,true);assert.equal(saved.maxPlayers,3);assert.equal(saved.visibility,'public');
  host.send({type:'start'});await host.next('state');
  await host.next('state',m=>m.game.initialReadyCount===1,7000);
  const watcher=await client();watcher.send({type:'spectate',code:'834001'});
  const observed=await watcher.next('lobby');assert.equal(observed.seat,-1);assert.equal(observed.token,undefined);
  const publicState=(await watcher.next('state')).game;assert.deepEqual(publicState.hand,[]);assert.deepEqual(publicState.tickets,[]);
  for(const message of [{type:'action',action:{type:'draw_train',index:-1}},{type:'kick',seat:0},{type:'start'},{type:'add_bot'},{type:'retry_save'}]){
    watcher.send(message);assert.equal((await watcher.next('error')).code,'SPECTATOR_READ_ONLY');
  }
  watcher.send({type:'leave'});await watcher.next('room_closed');
  assert.equal(app.rooms.get('834001').members.length,3);
  const other=await client();other.send({type:'create',code:'834002',name:'Private',visibility:'private'});await other.next('lobby');
  watcher.send({type:'spectate',code:'834002'});assert.equal((await watcher.next('error')).code,'ROOM_NOT_FOUND');
});
test('failed local save restores room settings and bot membership without stranding new peers',async()=>{
  const host=await client();host.send({type:'create',code:'834003',name:'A'});await host.next('lobby');
  const temp=process.env.STATE_FILE+'.tmp';fs.mkdirSync(temp);
  host.send({type:'add_bot'});await host.next('error',m=>m.code==='STORAGE_FAILED');
  assert.equal(app.rooms.get('834003').members.length,1);
  fs.rmdirSync(temp);host.send({type:'retry_save'});await flush(host);
  fs.mkdirSync(temp);host.send({type:'room_settings',visibility:'private',maxPlayers:2});await host.next('error',m=>m.code==='STORAGE_FAILED');
  assert.equal(app.rooms.get('834003').visibility,'public');assert.equal(app.rooms.get('834003').maxPlayers,5);
  fs.rmdirSync(temp);host.send({type:'retry_save'});await flush(host);
  host.send({type:'add_bot'});await host.next('lobby',m=>m.members.length===2);
  fs.mkdirSync(temp);host.send({type:'kick',seat:1});await flush(host);
  assert.equal(app.rooms.get('834003').members[1].bot,true);
  fs.rmdirSync(temp);host.send({type:'retry_save'});await flush(host);
  const newcomer=await client();fs.mkdirSync(temp);newcomer.send({type:'join',code:'834003',name:'Not saved'});
  await newcomer.next('room_closed');await newcomer.next('error',m=>m.code==='STORAGE_FAILED');
  assert.equal(app.rooms.get('834003').members.length,2);
  fs.rmdirSync(temp);host.send({type:'retry_save'});await flush(host);
  newcomer.send({type:'join',code:'834003',name:'Saved'});assert.equal((await newcomer.next('lobby')).seat,2);
});
test('new application URLs load directly without losing query parameters client-side',async()=>{
  for(const route of ['/rooms','/play','/more','/profile?tab=history']){
    const response=await fetch(`http://127.0.0.1:${port}${route}`);assert.equal(response.status,200);assert.match(await response.text(),/id="appSidebar"/);
  }
});
