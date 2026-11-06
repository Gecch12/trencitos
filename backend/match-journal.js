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
const {visible,project}=require("../game/queries/turn-history");
const actorSeat=(game,fallback)=>contexts.get(game)?.seat??fallback;
module.exports = {within,record,syncRoom,visible,project,actorSeat,enabled,silence};
