'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../backend/engine'),J=require('../backend/match-journal'),History=require('../frontend/turn-history');
const {createMatchArchive}=require('../backend/match-archive'),Replay=require('../shared/replay-state');
function game(){
  const g=E.newGame(['Ana','Luis'],0,0,null,{random:n=>n-1});
  for(const seat of [0,1])E.action(g,seat,{type:'choose_initial',indexes:[0,1]},{now:0,random:n=>n-1});
  return g;
}
const act=(g,index)=>E.action(g,0,{type:'draw_train',index},{now:1,random:n=>n-1});
for(const after of [false,true])test(`renewal ${after?'after the last draw':'between draws'} retains causal order and its section`,()=>{
  const g=game(),serial=g.turnSerial;
  if(after){g.deck=['blue','red'];act(g,-1);}
  g.face=['wild','wild','red','blue','green'];g.deck=['orange','yellow','purple','white','wild'];g.discard=[];
  act(g,2);
  if(!after)act(g,-1);
  const row=J.project(g,0).find(row=>row.turn===serial),types=row.events.map(e=>e.type);
  assert.deepEqual(types,after?['draw','draw','market_refill','recycled','market_refresh']:['draw','market_refill','recycled','market_refresh','draw']);
  const refill=row.events.find(e=>e.type==='market_refill');assert.equal(refill.data.color,'wild');
  assert.equal(refill.data.endsTurn,after);
  const saved=JSON.stringify(row),journal=JSON.stringify(g.journal);
  const visible=History.displayRows([row]);assert.equal(visible.length,1);
  assert.deepEqual(visible[0].events.map(e=>e.type),after?['draw','draw','market_refresh']:['draw','market_refresh','draw']);
  for(const revealAll of [false,true]){
    const parts=History.content(row,{players:g.players,city:id=>id,revealAll});
    assert.ok(parts.every(p=>!['El mazo repuso','Descarte barajado en el mazo'].includes(p.text)));
  }
  const hidden={...row,events:row.events.filter(e=>['market_refill','recycled'].includes(e.type))};
  assert.deepEqual(History.displayRows([hidden]),[]);
  assert.deepEqual(History.content(hidden,{players:g.players,city:id=>id}),[]);
  const parts=History.content(visible[0],{players:g.players,city:id=>id,revealAll:true});
  const refresh=parts.findIndex(p=>p.className==='history-market-refresh');
  assert.equal(parts[refresh].phase,after?'after':'during');
  const drawn=parts.filter(p=>p.className==='history-drawn-cards').flatMap(p=>p.cards);
  assert.deepEqual(drawn,row.events.filter(e=>e.type==='draw').map(e=>e.data.color));
  if(!after)assert.ok(refresh<parts.findLastIndex(p=>p.className==='history-drawn-cards'));
  assert.equal(JSON.stringify(row),saved);assert.equal(JSON.stringify(g.journal),journal);
});
test('recycling remains recorded before or between draws without splitting visible cards',()=>{
 for(const between of [false,true]){
  const g=game();g.deck=between?['blue']:[];g.discard=between?['orange']:['blue','orange'];act(g,-1);act(g,-1);
  const row=J.project(g,0).find(row=>row.events.some(e=>e.type==='draw'));
  assert.equal(row.events[between?1:0].type,'recycled');
  const draws=History.content(row,{players:g.players,city:id=>id}).filter(p=>p.className==='history-drawn-cards');
  assert.equal(draws.length,1);assert.deepEqual(draws[0].cards,['back','back']);
 }
});
test('offered and discarded tickets remain private live and become visible in all replay POVs',async()=>{
  const g=game(),initial=g.journal.find(e=>e.type==='initial');
  assert.equal(initial.data.offeredTickets.length,4);assert.equal(initial.data.discardedTickets.length,2);
  for(const seat of [-1,1]){
    const entry=J.project(g,seat).flatMap(r=>r.events).find(e=>e.id===initial.id);
    for(const field of ['hand','tickets','offeredTickets','discardedTickets'])assert.equal(entry.data[field],undefined);
  }
  E.action(g,0,{type:'draw_tickets'},{now:1});const offered=[...g.players[0].offer.tickets];
  E.action(g,0,{type:'keep_tickets',offerId:g.players[0].offer.id,indexes:[0]},{now:2});
  const archive=createMatchArchive(),room={code:'QA',visibility:'public',archiveFull:true,members:g.players.map(p=>({name:p.name})),game:g};
  archive.capture(room,'Abandono');archive.commit(archive.prepare());
  const replay=await archive.replay({},room.matchId),state=Replay.at(replay.frames,0);
  for(const view of state.views){
    const entries=view.turnHistory.flatMap(row=>row.events),kept=entries.find(e=>e.type==='tickets_kept');
    assert.deepEqual(kept.data.offeredTickets,offered);assert.deepEqual(kept.data.discardedTickets,offered.slice(1));
    assert.equal(entries.find(e=>e.id===initial.id).data.hand.length,4);
    const parts=History.content(view.turnHistory.find(row=>row.events.includes(kept)),{players:view.players,city:id=>id,revealAll:true});
    const tickets=parts.flatMap(part=>part.tickets||[]);
    assert.equal(tickets.length,offered.length,'each offered destination appears only once after the choice');
    assert.deepEqual(tickets.map(ticket=>ticket.status),['kept','discarded','discarded']);
    assert.ok(parts.every(part=>!part.text?.includes('Descartados:')));
  }
});
