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
