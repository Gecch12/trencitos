"use strict";
// Pure authorized journal projection; no recording, clocks or runtime context.
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
module.exports={visible,project};
