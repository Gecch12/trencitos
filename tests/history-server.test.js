const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{connect}=require('./helpers/ws-client'),Engine=require('../engine');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'history-server-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(directory,'state.json'),AUTH_ENABLED:'false'});
let app,port;const peers=[];
async function boot(){delete require.cache[require.resolve('../server')];app=require('../server');await app.ready;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');port=app.server.address().port;}
const http=(route,cookie='')=>fetch(`http://127.0.0.1:${port}${route}`,{headers:{cookie}});
async function client(cookie){const c=await connect(port,{cookie});peers.push(c);return c;}
test.before(boot);test.after(async()=>{for(const c of peers)c.close();await app.shutdown();fs.rmSync(directory,{recursive:true,force:true});});
test('guest history and replay survive reload/restart, duplicate actions stay single, private audit stays private',async()=>{
 const response=await http('/rooms'),cookie=response.headers.getSetCookie()[0].split(';')[0],a=await client(cookie),b=await client('');
 a.send({type:'create',name:'Rooms',visibility:'private'});const lobby=await a.next('lobby');b.send({type:'join',code:lobby.code,name:'B'});await b.next('lobby');await a.next('lobby',m=>m.members.length===2);
 a.send({type:'start'});await a.next('state');await b.next('state');
 const r=app.rooms.get(lobby.code);const matchId=r.matchId;
 a.send({type:'action',id:'initial-choice-01',action:{type:'choose_initial',indexes:[0,1]}});await a.next('ack');
 b.send({type:'action',id:'initial-choice-02',action:{type:'choose_initial',indexes:[0,1]}});await b.next('ack');
 const current=[a,b][r.game.current],request={type:'action',id:'same-draw-0001',revision:r.revision,action:{type:'draw_train',index:-1}};
 current.send(request);await current.next('ack',m=>m.id===request.id);const seq=r.archiveSeq,hand=r.game.players[r.game.current].hand.length;
 current.send(request);await current.next('ack',m=>m.id===request.id);assert.equal(r.archiveSeq,seq);assert.equal(r.game.players[r.game.current].hand.length,hand);
 const active=await (await http('/api/history',cookie)).json();assert.equal(active.matches.length,1);assert.equal(active.matches[0].status,'active');
 assert.equal((await http('/api/history/'+matchId,cookie)).status,409);
 // Close via the same authoritative finalizer used by the last round.
 Engine.finish(r.game,true);a.send({type:'reclaim'});await a.next('state',m=>m.game.phase==='finished');
 const replay=await (await http('/api/history/'+matchId,cookie)).json();assert.equal(replay.match.status,'completed');assert.equal(replay.full,true);
 assert.equal((await http('/api/history/'+matchId)).status,404);assert.equal((await http('/api/history/'+matchId+'/audit')).status,404);
 assert.equal((await http('/api/history/'+matchId+'/audit',cookie)).status,200);
 assert.ok(!JSON.stringify(replay).includes(lobby.token));assert.ok(!JSON.stringify(replay.match).includes('guestId'));
 for(const c of peers.splice(0))c.close();await app.shutdown();await boot();
 const after=await (await http('/api/history',cookie)).json();assert.equal(after.matches[0].status,'completed');assert.equal(after.matches[0].id,matchId);
 const replayAgain=await (await http('/api/history/'+matchId,cookie)).json();assert.ok(replayAgain.frames.length>=replay.frames.length);
});
test('public live state and closed replay share privacy rules while participants retain full replay access',async()=>{
 const Replay=require('../replay-state');
 const response=await http('/rooms'),cookie=response.headers.getSetCookie()[0].split(';')[0];
 const a=await client(cookie),b=await client(''),watcher=await client('');
 a.send({type:'create',name:'Public A',visibility:'public'});const lobby=await a.next('lobby');
 b.send({type:'join',code:lobby.code,name:'Public B'});await b.next('lobby');await a.next('lobby',m=>m.members.length===2);
 a.send({type:'start'});await a.next('state');await b.next('state');
 const room=app.rooms.get(lobby.code),matchId=room.matchId;
 for(const [seat,peer] of [a,b].entries()){
  peer.send({type:'action',id:`public-initial-${seat}`,action:{type:'choose_initial',indexes:[0,1]}});
  await peer.next('ack',m=>m.id===`public-initial-${seat}`);
 }
 watcher.send({type:'spectate',code:lobby.code});const publicLobby=await watcher.next('lobby');
 assert.equal(publicLobby.seat,-1);assert.equal(publicLobby.token,undefined);
 assert.doesNotMatch(JSON.stringify(publicLobby),/guestId|accountId|tokenHash/);
 const initial=(await watcher.next('state')).game;
 for(const key of ['hand','tickets','ticketPaths','ticketProgress'])assert.deepEqual(initial[key],[]);
 assert.equal((await http('/api/history/'+matchId)).status,409);
 const current=[a,b][room.game.current];
 current.send({type:'action',id:'public-blind-draw',revision:room.revision,action:{type:'draw_train',index:-1}});
 await current.next('ack',m=>m.id==='public-blind-draw');
 const drawn=(await watcher.next('state',m=>!!m.game.drawEvent)).game;
 assert.equal(drawn.drawEvent.color,undefined);
 assert.ok(drawn.events.filter(event=>event.type==='draw'&&event.index===-1).every(event=>event.color===undefined));
 Engine.finish(room.game,true);a.send({type:'reclaim'});
 const finished=(await watcher.next('state',m=>m.game.phase==='finished')).game;
 for(const row of finished.result){
  for(const key of ['tickets','individualTickets','stationRoutes'])assert.deepEqual(row[key],[]);
  assert.deepEqual(row.details.destinations,[]);
 }
 const publicReplay=await (await http('/api/history/'+matchId)).json();assert.equal(publicReplay.full,false);
 const saved=Replay.at(publicReplay.frames,publicReplay.frames.length-1);
 assert.equal(saved.game,undefined);assert.equal(saved.views.length,1);
 const {serverNow,revision,storagePaused,...liveView}=finished;
 assert.deepEqual(saved.views[0],liveView);
 assert.ok(publicReplay.frames.every(frame=>!Object.hasOwn(frame,'action')));
 const blindDraws=publicReplay.frames.flatMap(frame=>frame.events).filter(event=>event.draw?.index===-1);
 assert.ok(blindDraws.length>0);assert.ok(blindDraws.every(event=>event.draw.color===undefined));
 const own=await (await http('/api/history/'+matchId,cookie)).json();assert.equal(own.full,true);
 const privateViews=Replay.at(own.frames,own.frames.length-1).views;
 assert.equal(privateViews.length,3);assert.ok(privateViews.slice(1).every(view=>view.hand.length>0&&view.tickets.length>0));
 assert.deepEqual(saved.views[0].result.map(row=>row.score),privateViews[1].result.map(row=>row.score));
 assert.equal((await http('/api/history/'+matchId+'/audit')).status,403);
 assert.equal((await http('/api/history/'+matchId+'/audit',cookie)).status,200);
});
