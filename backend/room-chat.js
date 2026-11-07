"use strict";
const crypto = require('node:crypto');
const { prohibited } = require('./chat-moderation');
const REACTIONS = Object.freeze(['👍', '❤️', '😂', '😮', '😢', '👏']);
const NOTICE = 'Un mensaje no superó el filtro de lenguaje. Mantengamos el respeto para que todos disfruten la partida.';
const MAX_TEXT = 500, MAX_MESSAGES = 1000, PAGE_SIZE = 100;
const fail = (code, message) => Object.assign(Error(message), { code });

function ensure(room) {
  room.chat ||= { id: crypto.randomUUID(), revision: 0, next: 1, messages: [], receipts: [], rates: {}, mutes: {}, visitors: {} };
  for (const member of room.members) if (!member.bot) member.chatId ||= crypto.randomUUID();
  return room.chat;
}
function author(room, peer) {
  const member = room.members[peer.seat];
  if (peer.room === room && member?.ws === peer && !member.bot)
    return { id: member.chatId, name: member.name, color: member.color, avatar:member.avatar, spectator: false };
  if (peer.watching === room && room.visibility === 'public') {
    peer.chatGuest ||= crypto.randomUUID();
    const id = crypto.createHash('sha256').update(room.chat.id + ':' + (peer.guestId || peer.chatGuest)).digest('hex').slice(0, 32);
    return { id, name: 'guest_' + id.slice(0, 6), color: null, spectator: true };
  }
  throw fail('CHAT_ACCESS', 'No tienes acceso al chat de esta sala.');
}
function people(room) {
  return [...room.members.filter(m => !m.bot).map(m => ({ id:m.chatId, name:m.name, color:m.color, avatar:m.avatar, spectator:false })),
    ...Object.values(room.chat.visitors)];
}
function writable(room, person) { return !person.spectator || room.game?.phase === 'finished'; }
function context(room, peer) {
  ensure(room);
  const self = author(room, peer), muted=room.chat.mutes[self.id] || [], roster=people(room);
  const known=new Map(roster.map(person=>[person.id,person]));
  if(muted.length)for(const message of room.chat.messages)if(message.author&&!known.has(message.author.id))known.set(message.author.id,message.author);
  return { type:'chat_context', chatId:room.chat.id, code:room.code, self:self.id,
    canWrite:writable(room,self), people:roster, muted,
    mutedPeople:muted.map(id=>known.get(id)||{id,name:id.slice(0,6)}),
    revision:room.chat.revision, reactions:REACTIONS, limit:MAX_TEXT, capacity:MAX_MESSAGES };
}
function visible(message, muted, self) {
  if (message.author && muted.includes(message.author.id)) return null;
  return { ...message, reactions:Object.entries(message.reactions || {}).filter(([id])=>!muted.includes(id))
    .reduce((all,[id,emoji])=>{const item=all.find(x=>x.emoji===emoji);if(item){item.count++;item.mine ||= id===self;}else all.push({emoji,count:1,mine:id===self});return all;},[]) };
}
function view(room, peer, before) {
  const info = context(room, peer), history = room.chat.messages.filter(m => !before || m.seq < before);
  const page = history.slice(-PAGE_SIZE);
  return { ...info, type:'chat_snapshot', messages:page.map(m=>visible(m,info.muted,info.self)).filter(Boolean),
    before:page[0]?.seq || null, more:history.length>page.length, older:!!before };
}
function validateParts(room, parts) {
  if (!Array.isArray(parts) || !parts.length || parts.length>32) throw fail('CHAT_INVALID', 'Escribe un mensaje de hasta 500 caracteres.');
  const roster = people(room);
  let length = 0;
  const result = parts.map(part => {
    if (!part || typeof part !== 'object') throw fail('CHAT_INVALID','Mensaje de chat inválido.');
    if (part.type === 'text' && typeof part.text === 'string') {
      // Keep emoji joiners (families, professions); the moderation layer still
      // removes format controls before comparing words.
      const text = part.text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\p{Cc}\p{Cf}]/gu, c => c === '\n' || c === '\u200d' ? c : c === '\t' ? ' ' : '');
      length += [...text].length;
      return { type:'text', text };
    }
    if (part.type === 'player') {
      const person = roster.find(p=>p.id===part.id);
      if (!person) throw fail('CHAT_REFERENCE','El jugador mencionado ya no está disponible.');
      length += person.name.length + 1;
      return { type:'player', id:person.id, label:person.name };
    }
    if (part.type === 'route') {
      const route = room.game?.routes.find(r=>r.id===part.id);
      if (!route) throw fail('CHAT_REFERENCE','El tramo no pertenece al mapa de esta partida.');
      length += String(route.a).length + String(route.b).length + 3;
      return { type:'route', id:route.id, a:route.a, b:route.b, color:route.color, length:route.n };
    }
    throw fail('CHAT_REFERENCE','Solo puedes mencionar jugadores y tramos públicos.');
  });
  if (length>MAX_TEXT || !result.some(p=>p.type!=='text'||p.text.trim())) throw fail('CHAT_INVALID','Escribe un mensaje de hasta 500 caracteres.');
  return result;
}
function createRoomChat({ rooms, peers, persist, blocked, now = Date.now }) {
  function audience(room) { return [...peers].filter(p=>!p.closed&&(p.room===room||p.watching===room)); }
  function publish(room, message) {
    for (const peer of audience(room)) {
      const info=context(room,peer), item=visible(message,info.muted,info.self);
      peer.send({type:'chat_event',chatId:room.chat.id,revision:room.chat.revision,message:item});
    }
  }
  function commit(room) { room.savedAt=room.updated=now(); return persist(room); }
  function handle(peer, request) {
    const room=peer.room || peer.watching;
    const reply=(code,message)=>peer.send({type:'chat_result',id:request.id,ok:false,code,message});
    try {
      if (!room || rooms.get(room.code)!==room) throw fail('CHAT_CLOSED','La sala se cerró y su chat ya no está disponible.');
      ensure(room);
      const self=author(room,peer), chat=room.chat;
      if (request.chatId!==chat.id) throw fail('CHAT_STALE','Tu sala cambió. Vuelve a abrir el chat.');
      if (request.type==='chat_sync') {
        if(request.before!==undefined && (!Number.isSafeInteger(request.before)||request.before<1))throw fail('CHAT_INVALID','Página de chat inválida.');
        peer.send(view(room,peer,request.before));return;
      }
      if (blocked(room)) throw fail('STORAGE_FAILED','El chat está pausado mientras se recupera el guardado.');
      if (typeof request.id!=='string'||!/^[-\w]{8,80}$/.test(request.id)) throw fail('CHAT_INVALID','Identificador de mensaje inválido.');
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify([request.type,request.parts,request.messageId,request.emoji,request.target,request.muted])).digest('hex');
      const prior=chat.receipts.find(r=>r.author===self.id&&r.id===request.id);
      if (prior) {
        if(prior.fingerprint!==fingerprint)throw fail('CHAT_CONFLICT','Este envío ya fue utilizado para otro mensaje.');
        peer.send({...prior.reply,id:request.id,type:'chat_result'});return;
      }
      if (request.type==='chat_mute') {
        if (typeof request.muted!=='boolean'||request.target===self.id||
          !people(room).some(p=>p.id===request.target)&&!chat.messages.some(m=>m.author?.id===request.target)&&
          !(request.muted===false&&(chat.mutes[self.id]||[]).includes(request.target)))
          throw fail('CHAT_INVALID','No puedes silenciar a ese jugador.');
        const ids=new Set(chat.mutes[self.id]||[]);
        if(request.muted)ids.add(request.target);else ids.delete(request.target);
        chat.mutes[self.id]=[...ids];
        if(!commit(room))return reply('STORAGE_FAILED','No se pudo guardar el cambio.');
        peer.send(view(room,peer));peer.send({type:'chat_result',id:request.id,ok:true});return;
      }
      if (!writable(room,self)) throw fail('CHAT_READ_ONLY','Los espectadores pueden conversar y reaccionar al terminar la partida.');
      const times=(chat.rates[self.id]||[]).filter(t=>now()-t<10000);
      if (times.length>=8) throw fail('CHAT_RATE','Espera unos segundos antes de volver a enviar.');
      chat.rates[self.id]=[...times,now()];
      let message, result={ok:true};
      if (request.type==='chat_send') {
        const parts=validateParts(room,request.parts);
        if(chat.messages.length>=MAX_MESSAGES)throw fail('CHAT_FULL','El chat alcanzó el límite de esta sala. Puedes seguir leyendo los mensajes.');
        // Adjacent text fragments must not evade the filter. Structured mentions
        // are resolved by the server and never interpreted as client markup.
        const text=parts.map(p=>p.type==='text'?p.text:' ').join('');
        const toxic=prohibited(text);
        const seq=chat.next++;
        message={id:crypto.randomUUID(),seq,at:now(),...(toxic?{system:'language',text:NOTICE}:
          {author:self,parts,reactions:{}})};
        chat.messages.push(message);
        if(toxic) result={ok:false,code:'CHAT_LANGUAGE',message:'Tu mensaje no superó el filtro. Reformúlalo para enviarlo.'};
        else if(self.spectator)chat.visitors[self.id]=self;
      } else if(request.type==='chat_react') {
        message=chat.messages.find(m=>m.id===request.messageId&&m.author);
        if(!message || (chat.mutes[self.id]||[]).includes(message.author.id)||
          (request.emoji!==null&&!REACTIONS.includes(request.emoji)))throw fail('CHAT_INVALID','Reacción no disponible.');
        if(self.spectator)chat.visitors[self.id]=self;
        if(request.emoji===null)delete message.reactions[self.id];else message.reactions[self.id]=request.emoji;
      } else throw fail('CHAT_INVALID','Acción de chat desconocida.');
      chat.revision++;
      chat.receipts.push({author:self.id,id:request.id,fingerprint,reply:result,type:request.type});
      // Send receipts live as long as their bounded conversation. Reaction
      // commands set an absolute value, so only retain a bounded retry window.
      let reactions=0;
      chat.receipts=chat.receipts.reverse().filter(receipt=>receipt.type!=='chat_react'||++reactions<=1000).reverse();
      if(!commit(room))return reply('STORAGE_FAILED','No se pudo guardar el mensaje.');
      publish(room,message);
      peer.send({type:'chat_result',id:request.id,...result});
    } catch(error) { reply(error.code||'CHAT_INVALID',error.code?error.message:'No se pudo procesar el mensaje.'); }
  }
  return {handle,context,view};
}
module.exports={createRoomChat,ensure,context,view,validateParts,REACTIONS,NOTICE,MAX_MESSAGES};
