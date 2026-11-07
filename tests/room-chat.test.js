"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {prohibited}=require('../backend/chat-moderation');
const {createRoomChat,ensure,context,view,NOTICE}=require('../backend/room-chat');
function fixture(){
 const a={seat:0,send:m=>a.out.push(structuredClone(m)),out:[]},b={seat:1,send:m=>b.out.push(structuredClone(m)),out:[]};
 const room={code:'123456',visibility:'public',members:[{name:'Ana',ws:a},{name:'Luis',ws:b}],game:null};a.room=b.room=room;ensure(room);
 let time=10000,saves=0;const rooms=new Map([[room.code,room]]),peers=new Set([a,b]);
 const chat=createRoomChat({rooms,peers,persist:()=>{saves++;return true;},blocked:()=>false,now:()=>time});
 let n=0;const command=(peer,type,data={})=>{const request={id:'command-'+(++n),chatId:room.chat.id,type,...data};chat.handle(peer,request);return request;};
 return {a,b,room,rooms,peers,chat,command,tick:()=>time+=11000,get saves(){return saves;}};
}
test('moderation catches Spanish, English, obfuscation and keeps normal game vocabulary',()=>{
 for(const value of ['idiota','i.d.i.o.t.a','i d i o t a','m13rda','mierda','fuck you','pendejo','imbécil','id\u200biota','idi\nota'])assert.equal(prohibited(value),true,value);
 for(const value of ['Buena partida 👍','te bloqueo la vía','vehículo','Concepción','Es negro y amarillo','Mi amigo es gay','La ruta más larga'])assert.equal(prohibited(value),false,value);
});
test('server canonicalizes mentions, rejects private references and forged route ids',()=>{
 const f=fixture();f.room.game={phase:'play',routes:[{id:0,a:'A',b:'B',n:3,color:'blue'}]};
 f.command(f.a,'chat_send',{parts:[{type:'player',id:f.room.members[1].chatId,label:'forged'},{type:'route',id:0,a:'secret'}]});
 const m=f.room.chat.messages[0];assert.equal(m.parts[0].label,'Luis');assert.equal(m.parts[1].a,'A');
 for(const part of [{type:'ticket',id:1},{type:'route',id:'0'},{type:'route',id:999},{type:'player',id:'not-here'}]){
  f.command(f.a,'chat_send',{parts:[part]});assert.equal(f.a.out.at(-1).code,'CHAT_REFERENCE');
 }
 assert.equal(f.room.chat.messages.length,1);
});
test('rejection publishes an anonymous notice once, never the original; retry is idempotent',()=>{
 const f=fixture(),cmd=f.command(f.a,'chat_send',{parts:[{type:'text',text:'idi'},{type:'text',text:'ota'}]});
 assert.equal(f.room.chat.messages.length,1);assert.equal(f.room.chat.messages[0].text,NOTICE);
 assert.equal(f.a.out.at(-1).code,'CHAT_LANGUAGE');assert.equal(f.b.out.at(-1).message.author,undefined);
 assert.ok(!JSON.stringify(f.room.chat).includes('idiota'));f.chat.handle(f.a,cmd);assert.equal(f.room.chat.messages.length,1);
 f.chat.handle(f.a,{...cmd,parts:[{type:'text',text:'other'}]});assert.equal(f.a.out.at(-1).code,'CHAT_CONFLICT');
});
test('mute is personal, filters snapshots and live messages/reactions, and can be undone',()=>{
 const f=fixture();f.command(f.a,'chat_send',{parts:[{type:'text',text:'hola'}]});const messageId=f.room.chat.messages[0].id;
 f.command(f.b,'chat_react',{messageId,emoji:'👍'});assert.equal(view(f.room,f.a).messages[0].reactions[0].count,1);
 f.command(f.a,'chat_mute',{target:f.room.members[1].chatId,muted:true});
 assert.deepEqual(view(f.room,f.a).messages[0].reactions,[]);
 f.command(f.b,'chat_send',{parts:[{type:'text',text:'oculto'}]});assert.equal(f.a.out.at(-1).message,null);
 assert.equal(view(f.room,f.a).messages.length,1);assert.equal(view(f.room,f.b).messages.length,2);
 f.command(f.a,'chat_mute',{target:f.room.members[1].chatId,muted:false});assert.equal(view(f.room,f.a).messages.length,2);
 f.command(f.b,'chat_react',{messageId,emoji:'🔥'});assert.equal(f.b.out.at(-1).code,'CHAT_INVALID');
});
test('compound emoji survive storage and departed muted players can be unmuted',()=>{
 const f=fixture(),id=f.room.members[1].chatId;
 f.command(f.b,'chat_send',{parts:[{type:'text',text:'Buen viaje\n👨‍👩‍👧‍👦 👩🏽‍🚒'}]});
 assert.equal(f.room.chat.messages[0].parts[0].text,'Buen viaje\n👨‍👩‍👧‍👦 👩🏽‍🚒');
 f.command(f.a,'chat_mute',{target:id,muted:true});f.room.members.pop();f.peers.delete(f.b);
 assert.equal(view(f.room,f.a).mutedPeople[0].name,'Luis');
 f.command(f.a,'chat_mute',{target:id,muted:false});assert.equal(view(f.room,f.a).messages.length,1);
});
test('reaction retry receipts are bounded while every send receipt stays idempotent',()=>{
 const f=fixture(),send=f.command(f.a,'chat_send',{parts:[{type:'text',text:'Hola'}]});
 let latest;
 for(let i=0;i<1005;i++){f.tick();latest=f.command(f.a,'chat_react',{messageId:f.room.chat.messages[0].id,emoji:i%2?'👍':'❤️'});}
 assert.equal(f.room.chat.receipts.length,1001);
 const revision=f.room.chat.revision;f.chat.handle(f.a,latest);assert.equal(f.room.chat.revision,revision);
 f.chat.handle(f.a,send);assert.equal(f.room.chat.messages.length,1);
});
test('spectators read during play and write/react only after finishing',()=>{
 const f=fixture(),s={watching:f.room,guestId:'spectator-cookie',out:[],send:m=>s.out.push(m)};f.peers.add(s);f.room.game={phase:'play',routes:[]};
 assert.equal(context(f.room,s).canWrite,false);f.command(s,'chat_send',{parts:[{type:'text',text:'hola'}]});assert.equal(s.out.at(-1).code,'CHAT_READ_ONLY');
 f.room.game.phase='finished';f.command(s,'chat_send',{parts:[{type:'text',text:'buena partida'}]});assert.equal(s.out.at(-1).ok,true);
 const reconnect={...s};assert.equal(context(f.room,s).self,context(f.room,reconnect).self);
 f.room.visibility='private';f.command(s,'chat_sync');assert.equal(s.out.at(-1).code,'CHAT_ACCESS');
});
test('spam is limited before moderation notices; paging is bounded and stale rooms reject commands',()=>{
 const f=fixture();for(let i=0;i<12;i++)f.command(f.a,'chat_send',{parts:[{type:'text',text:'idiota'}]});
 assert.equal(f.room.chat.messages.length,8);assert.equal(f.a.out.at(-1).code,'CHAT_RATE');
 f.tick();for(let i=0;i<102;i++){f.tick();f.command(f.b,'chat_send',{parts:[{type:'text',text:'hola '+i}]});}
 const page=view(f.room,f.a);assert.equal(page.messages.length,100);assert.equal(page.more,true);assert.equal(view(f.room,f.a,page.before).messages.length,10);
 f.command(f.a,'chat_send',{chatId:'old-room',parts:[{type:'text',text:'hola'}]});assert.equal(f.a.out.at(-1).code,'CHAT_STALE');
 f.rooms.clear();f.command(f.a,'chat_sync');assert.equal(f.a.out.at(-1).code,'CHAT_CLOSED');
});
