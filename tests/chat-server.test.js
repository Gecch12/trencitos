"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {connect}=require('./helpers/ws-client'),{loadState}=require('../backend/room-store'),Engine=require('../backend/engine');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-chat-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(dir,'state.json'),AUTH_ENABLED:'false'});
let app=require('../backend/server'),port;const clients=[];
test.before(async()=>{await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));port=app.server.address().port;});
test.after(async()=>{await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});});
async function client(){const c=await connect(port);clients.push(c);return c;}
async function send(c,ctx,id,text){c.send({type:'chat_send',chatId:ctx.chatId,id,parts:[{type:'text',text}]});return c.next('chat_result',m=>m.id===id);}
test('live chat survives reconnect, stays outside replay and is deleted with its room',async()=>{
 const a=await client(),b=await client();a.send({type:'create',visibility:'public'});const la=await a.next('lobby'),ca=await a.next('chat_context');
 b.send({type:'join',code:la.code});const lb=await b.next('lobby'),cb=await b.next('chat_context');
 assert.equal(ca.chatId,cb.chatId);assert.notEqual(ca.self,cb.self);
 assert.equal((await send(a,ca,'chat-first-1','Hola desde la sala 👋')).ok,true);await b.next('chat_event');
 a.send({type:'start'});await a.next('state');await b.next('state');
 for(const c of [a,b])c.send({type:'action',action:{type:'choose_initial',indexes:[0,1]}});
 await a.next('state',m=>m.game.phase==='play');await b.next('state',m=>m.game.phase==='play');
 const room=app.rooms.get(la.code),revision=room.revision,archiveBefore=loadState(process.env.STATE_FILE).archive;
 assert.equal((await send(a,ca,'chat-in-game-2','Mensaje durante el juego')).ok,true);
 assert.equal(room.revision,revision);assert.deepEqual(loadState(process.env.STATE_FILE).archive,archiveBefore);
 assert.ok(!JSON.stringify(archiveBefore).includes('Hola desde la sala'));
 const reconnect=await client();reconnect.send({type:'join',code:la.code,token:la.token});await reconnect.next('lobby');const cc=await reconnect.next('chat_context');
 assert.equal(cc.self,ca.self);reconnect.send({type:'chat_sync',chatId:cc.chatId});let snapshot=await reconnect.next('chat_snapshot');assert.equal(snapshot.messages.length,2);
 assert.equal((await send(reconnect,cc,'chat-in-game-2','Mensaje durante el juego')).ok,true);assert.equal(room.chat.messages.length,2);
 const saved=loadState(process.env.STATE_FILE).rooms.find(r=>r.code===la.code);assert.equal(saved.chat.messages.length,2);assert.equal(saved.members[0].chatId,ca.self);
 const spectator=await client();spectator.send({type:'spectate',code:la.code});await spectator.next('state');const cs=await spectator.next('chat_context');
 assert.equal((await send(spectator,cs,'chat-spectate-3','hola')).code,'CHAT_READ_ONLY');
 Engine.finish(room.game);assert.equal((await send(spectator,cs,'chat-spectate-4','Buena partida')).ok,true);
 assert.equal((await send(b,cb,'chat-toxic-5','idiota')).code,'CHAT_LANGUAGE');
 snapshot=loadState(process.env.STATE_FILE).rooms.find(r=>r.code===la.code).chat;
 assert.ok(!JSON.stringify(snapshot).includes('idiota'));assert.equal(snapshot.messages.at(-1).system,'language');
 // Trigger actual lifecycle removal, not an individual leaving notification.
 room.members.forEach(m=>{m.ws=null;m.disconnectedAt=Date.now()-130000;});room.emptySince=Date.now()-130000;
 const closer=await client();closer.send({type:'join',code:la.code,token:lb.token});await closer.next('error',m=>m.code==='ROOM_NOT_FOUND');
 const closed=await spectator.next('room_closed');assert.equal(closed.deleted,true);assert.equal(app.rooms.has(la.code),false);
 assert.equal(loadState(process.env.STATE_FILE).rooms.some(r=>r.code===la.code),false);
 assert.ok(!fs.readFileSync(process.env.STATE_FILE+'.bak','utf8').includes('Mensaje durante el juego'));
 assert.ok(!JSON.stringify(loadState(process.env.STATE_FILE).archive).includes('Mensaje durante el juego'));
});
test('server restart restores conversation, author identity, mute and request deduplication',async()=>{
 const a=await client(),b=await client();a.send({type:'create',visibility:'public'});const la=await a.next('lobby'),ca=await a.next('chat_context');
 b.send({type:'join',code:la.code});const lb=await b.next('lobby'),cb=await b.next('chat_context');
 await send(b,cb,'restart-message-1','Hasta después del reinicio');
 a.send({type:'chat_mute',chatId:ca.chatId,id:'restart-mute-1',target:cb.self,muted:true});await a.next('chat_result',m=>m.id==='restart-mute-1');
 await app.shutdown();delete require.cache[require.resolve('../backend/server')];app=require('../backend/server');
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));port=app.server.address().port;
 const restored=await client();restored.send({type:'join',code:la.code,token:la.token});await restored.next('lobby');const info=await restored.next('chat_context');
 assert.equal(info.chatId,ca.chatId);assert.equal(info.self,ca.self);assert.deepEqual(info.muted,[cb.self]);
 restored.send({type:'chat_sync',chatId:info.chatId});assert.equal((await restored.next('chat_snapshot')).messages.length,0);
 restored.send({type:'chat_mute',chatId:info.chatId,id:'restart-unmute-1',target:cb.self,muted:false});
 const snapshot=await restored.next('chat_snapshot');assert.equal(snapshot.messages[0].parts[0].text,'Hasta después del reinicio');
 const other=await client();other.send({type:'join',code:la.code,token:lb.token});
 await other.next('lobby');const otherInfo=await other.next('chat_context');await send(other,otherInfo,'restart-message-1','Hasta después del reinicio');
 assert.equal(app.rooms.get(la.code).chat.messages.length,1);
});
