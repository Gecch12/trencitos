"use strict";

// Append-only application facts. A turn can receive a later destination choice; grouping is
// a read projection and never rewrites an earlier recorded replay frame.
const contexts = new WeakMap(), simulations=new WeakSet();
const enabled=game=>!simulations.has(game);
const silence=game=>simulations.add(game);
function within(game, context, run) {
  const prior = contexts.get(game); contexts.set(game, context);
  try { return run(); } finally { if (prior) contexts.set(game, prior); else contexts.delete(game); }
}
function record(game, type, seat = null, data = {}, options = {}) {
  if (!enabled(game)) return;
  if (!game.journal) {
    game.journal = (game.history || game.logs?.map(text => ({text})) || []).slice().reverse()
      .map((entry, i) => ({id:i+1,type:'legacy',seat:entry.seat??null,at:null,turn:null,data:structuredClone(entry)}));
    game.journalSerial = game.journal.length;
    game.journalPartial = true;
  }
  const context = contexts.get(game) || {};
  const turn = options.system ? null : options.turn ?? context.turn ?? null;
  const actor = options.actor || (context.automatic ? 'timer' : game.journalRoom?.members?.[seat]?.actor || 'player');
  // Private milestones must not create gaps in public sequence numbers.
  const privateIds=game.journalPrivateSerial ||= [];
  const id=data.privateSeat!==undefined?`private:${data.privateSeat}:${privateIds[data.privateSeat]=(privateIds[data.privateSeat]||0)+1}`:(game.journalSerial=(game.journalSerial||0)+1);
  const entry = {id,at:options.at??context.now??Date.now(),type,seat,turn,actor,data:structuredClone(data)};
  game.journal.push(entry); return entry;
}
function syncRoom(room, now = Date.now()) {
  const game = room.game; if (!game || room.archiveClosedAt) return;
  const next = {members:room.members.map(m=>({connected:!!m.bot||!!(m.ws&&!m.ws.closed),
    actor:m.bot?'bot':m.autopilot?'replacement':'player'})),empty:room.emptySince!=null};
  const prior = game.journalRoom;
  if (prior) next.members.forEach((member, seat)=>{
    const old = prior.members[seat]; if (!old) return;
    // These are independent: a voluntary departure both disconnects and hands
    // control over. Recording one must not mask the other.
    if (member.connected!==old.connected) record(game,member.connected?'connected':'disconnected',seat,{}, {system:true,at:now,actor:'player'});
    if (member.actor!==old.actor) record(game,member.actor==='replacement'?'bot_control':'human_control',seat,{}, {system:true,at:now,actor:member.actor});
  });
  if (prior && prior.empty!==next.empty) record(game,next.empty?'paused':'resumed',null,{}, {system:true,at:now});
  game.journalRoom = next;
}
function visible(entry, seat, { revealAll = false } = {}) {
  if (!revealAll && entry.data.privateSeat !== undefined && entry.data.privateSeat !== seat) return null;
  const result = structuredClone(entry), data = result.data;
  if (revealAll && data.privateSeat !== undefined) data.subjectSeat = data.privateSeat;
  delete data.privateSeat;
  if (!revealAll && entry.seat!==seat) {
    delete data.tickets; delete data.hand; delete data.offeredTickets; delete data.discardedTickets;
    if (entry.type==='draw' && data.index<0) delete data.color;
    if (entry.type==='legacy' && data.draw?.index<0) delete data.draw.color;
  }
  return result;
}
function project(game, seat, options) {
  if (!game.journal) return null;
  const rows = new Map();let turnNumber=0;
  for (const entry of game.journal) {
    const event = visible(entry,seat,options); if (!event) continue;
    const key = entry.turn!==null ? `turn:${entry.turn}:${entry.seat??'system'}` :
      entry.type==='initial' ? `initial:${entry.seat}` : `event:${entry.id}`;
    let row = rows.get(key);
    if (!row) { row={id:key,at:entry.at,turn:entry.turn,number:entry.turn!==null?++turnNumber:null,seat:entry.seat,events:[]};rows.set(key,row); }
    row.events.push(event);
  }
  return [...rows.values()];
}
const actorSeat=(game,fallback)=>contexts.get(game)?.seat??fallback;
module.exports = {within,record,syncRoom,visible,project,actorSeat,enabled,silence};
