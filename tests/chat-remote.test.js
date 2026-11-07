"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fakeSupabase}=require('./helpers/fake-supabase'),{connect}=require('./helpers/ws-client');
test('chat publication waits for durable commit; failure rolls back only its room and recovery retries once',async t=>{
 const api=fakeSupabase({roomTransactions:true}),original=global.fetch,clients=[];
 Object.assign(process.env,{STATE_BACKEND:'supabase',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test_only',AUTH_ENABLED:'false'});
 global.fetch=(url,options)=>String(url).startsWith(process.env.SUPABASE_URL)?api.fetch(url,options):original(url,options);
 const app=require('../backend/server');await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.shutdown();global.fetch=original;});
 async function create(){const c=await connect(app.server.address().port);clients.push(c);c.send({type:'create'});const lobby=await c.next('lobby'),ctx=await c.next('chat_context');await c.next('storage',m=>!m.paused);return {c,ctx,room:app.rooms.get(lobby.code)};}
 const a=await create(),b=await create();
 const cmd={type:'chat_send',chatId:a.ctx.chatId,id:'durable-chat-1',parts:[{type:'text',text:'Solo después de guardar'}]};
 const release=api.holdRoom(a.room.code);a.c.send(cmd);
 b.c.send({...cmd,chatId:b.ctx.chatId,id:'durable-chat-2'});assert.equal((await b.c.next('chat_result')).ok,true);
 assert.equal(api.state.rooms.find(r=>r.code===a.room.code).chat.messages.length,0);
 api.failRoom(a.room.code);release();await a.c.next('error',m=>m.code==='STORAGE_FAILED');
 assert.equal(a.room.chat.messages.length,0);assert.equal(b.room.chat.messages.length,1);
 api.failRoom(a.room.code,false);a.c.send({type:'retry_save'});await a.c.next('storage',m=>!m.paused);await app.drain();
 a.c.send(cmd);assert.equal((await a.c.next('chat_result')).ok,true);assert.equal(a.room.chat.messages.length,1);
 api.lostResponses=2;const lost={...cmd,id:'durable-chat-3'};a.c.send(lost);await a.c.next('error',m=>m.code==='STORAGE_FAILED');
 assert.equal(a.room.chat.messages.length,1);assert.equal(api.state.rooms.find(r=>r.code===a.room.code).chat.messages.length,2);
 a.c.send({type:'retry_save'});await app.drain();
 await a.c.next('chat_context',m=>m.revision===2);a.c.send(lost);assert.equal((await a.c.next('chat_result',m=>m.id===lost.id)).ok,true);
 assert.equal(a.room.chat.messages.length,2);
});
