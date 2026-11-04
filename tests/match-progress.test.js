"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../backend/engine'),J=require('../backend/match-journal'),UI=require('../frontend/game-ui');
const {createMatchArchive}=require('../backend/match-archive'),Replay=require('../shared/replay-state');
function game(){const g=E.newGame(['Ana','Luis'],0,0);for(let seat=0;seat<2;seat++)E.action(g,seat,{type:'choose_initial',indexes:[0,1]},{now:0});return g;}
const turns=(g,seat=0)=>E.view(g,seat,{now:0}).turnHistory.filter(row=>row.turn!==null);
const act=(g,type,rest={},now=1)=>E.action(g,g.current,{type,...rest},{now});
function smallBoard(g){g.routes=[{id:0,a:'PAR',b:'BRU',n:2,color:'red',tunnel:false,ferry:0,owner:null},{id:1,a:'BRU',b:'ESS',n:2,color:'blue',tunnel:false,ferry:0,owner:null},{id:2,a:'PAR',b:'FRA',n:3,color:'green',tunnel:false,ferry:0,owner:null}];g.players.forEach(p=>{p.tickets=[];p.placed=[];});}

test('two draws stay in one durable turn; blind cards are filtered per seat and after reconnect',()=>{
 const g=game();act(g,'draw_train',{index:-1});act(g,'draw_train',{index:-1});
 const own=turns(g),rival=turns(g,1),publicRows=turns(g,-1);assert.equal(own.length,1);
 assert.equal(own[0].events.filter(e=>e.type==='draw').length,2);
 for(const rows of [rival,publicRows])assert.ok(rows[0].events.filter(e=>e.type==='draw').every(e=>!('color'in e.data)));
 assert.deepEqual(turns(JSON.parse(JSON.stringify(g))),own);
 const baseline=g.journal.length;
 for(let i=0;i<60;i++)act(g,'draw_train',{index:-1});
 assert.equal(g.logs.length,25);assert.ok(g.journal.length>baseline+50);assert.equal(turns(g).length,31);
 assert.deepEqual(turns(g)[0],own[0]);
});
test('public market cards and renewal belong to the causal turn in original order',()=>{
 const g=game(),before=g.logSerial;g.face=['red','wild','wild','blue','green'];g.deck=['black','white','purple','orange','yellow','blue','wild'];g.discard=[];
 act(g,'draw_train',{index:0});act(g,'draw_train',{index:-1});
 const row=turns(g,-1)[0];assert.equal(turns(g,-1).length,1);
 assert.equal(row.events.find(e=>e.type==='draw').data.color,'red');
 assert.equal(row.events.filter(e=>e.type==='market_refresh').length,1);
 assert.ok(row.events.findIndex(e=>e.type==='draw')<row.events.findIndex(e=>e.type==='market_refresh'));
 assert.ok(!E.view(g,-1).turnHistory.some(r=>r.turn===null&&r.events.some(e=>e.type==='notice'&&e.data.text.includes('Mesa renovada'))));
 assert.equal(g.history.filter(e=>e.id>before&&e.marketRefresh).length,1);
 const refresh=row.events.find(e=>e.type==='market_refresh').data;assert.equal(refresh.before.filter(c=>c==='wild').length,3);assert.equal(refresh.after.length,5);
});
for(const kind of ['zero','paid','declined','timeout'])test(`tunnel ${kind} has one row, exact cards, surcharge, payment and outcome`,()=>{
 const g=game();smallBoard(g);g.routes[0].tunnel=true;g.players[0].hand=['red','red','red','wild'];g.deck=kind==='zero'?['blue','green','black']:['blue','green','red'];g.discard=[];
 act(g,'claim',{routeId:0,color:'red',wildCount:0});const reveal=[...g.pending.revealed];E.expire(g,g.pending.until);
 if(kind!=='zero'){
   if(kind==='timeout')E.expire(g,g.turnDeadline);
   else act(g,kind==='paid'?'pay_tunnel':'decline_tunnel',{extraWild:0},4000);
 }
 const row=turns(g,-1)[0],start=row.events.find(e=>e.type==='tunnel').data,end=row.events.find(e=>e.type==='tunnel_result').data;
 assert.equal(turns(g,-1).length,1);assert.deepEqual(start.revealed,reveal);assert.equal(start.surcharge,kind==='zero'?0:1);
 assert.equal(end.outcome,['zero','paid'].includes(kind)?'built':'declined');
 if(end.outcome==='built'){assert.equal(end.extra.regular,kind==='zero'?0:1);assert.equal(end.points,2);}
 if(kind==='timeout')assert.equal(end.reason,'timeout');
 assert.equal(g.players[0].hand.length,end.outcome==='declined'?4:kind==='zero'?2:1);
});
test('destination confirmations, including timeout, attach to their original turn after other players act',()=>{
 for(const automatic of [false,true]){
  const g=game();act(g,'draw_tickets');const offer={...g.players[0].offer};act(g,'draw_train',{index:-1});act(g,'draw_train',{index:-1});
  if(automatic)E.expire(g,offer.deadline);else E.action(g,0,{type:'keep_tickets',offerId:offer.id,indexes:[0,1]},{now:2});
  const row=turns(g,0).find(r=>r.turn===offer.journalTurn);const event=row.events.find(e=>e.type==='tickets_kept');
  assert.equal(event.data.received,3);assert.equal(event.data.kept,automatic?1:2);assert.equal(event.data.discarded,automatic?2:1);
  assert.equal(event.actor,automatic?'timer':'player');
  const other=turns(g,1).find(r=>r.id===row.id).events.find(e=>e.type==='tickets_kept');assert.equal(other.data.tickets,undefined);
 }
});
test('initial choices record public counts and keep cards and identities private',()=>{
 const g=game();const own=E.view(g,0),pub=E.view(g,-1);
 const entry=own.turnHistory.find(r=>r.seat===0).events[0];assert.equal(entry.type,'initial');assert.equal(entry.data.kept,2);assert.equal(entry.data.discarded,2);assert.equal(entry.data.hand.length,4);
 assert.ok(pub.turnHistory.flatMap(r=>r.events).every(e=>!e.data.hand&&!e.data.tickets));
 const history=require('../frontend/turn-history'),context={players:g.players,city:id=>id};
 assert.deepEqual(history.content(own.turnHistory.find(r=>r.seat===0),context).find(p=>p.cards).cards,entry.data.hand);
 assert.deepEqual(history.content(pub.turnHistory.find(r=>r.seat===0),context).find(p=>p.cards).cards,Array(4).fill('back'));
 for(const seat of [-2,2,1.5,'0',undefined])assert.throws(()=>E.view(g,seat),RangeError);
});
test('connection, control and room pause are independent, deduplicated and historical',()=>{
 const g=game(),room={game:g,members:[{ws:{},name:'Ana'},{ws:{},name:'Luis'}]};J.syncRoom(room,1);
 room.members[0].ws=null;room.members[0].autopilot=true;J.syncRoom(room,2);
 assert.deepEqual(g.journal.slice(-2).map(e=>e.type),['disconnected','bot_control']);
 const count=g.journal.length;J.syncRoom(room,3);assert.equal(g.journal.length,count);
 act(g,'draw_train',{index:-1});act(g,'draw_train',{index:-1});assert.ok(turns(g)[0].events.filter(e=>e.type==='draw').every(e=>e.actor==='replacement'));
 room.members[1].ws=null;room.emptySince=4;J.syncRoom(room,4);assert.equal(g.journal.at(-1).type,'paused');
 room.members[0].ws={};room.members[0].autopilot=false;room.emptySince=null;J.syncRoom(room,5);
 assert.deepEqual(g.journal.slice(-3).map(e=>e.type),['connected','human_control','resumed']);
 assert.equal(g.journal.at(-3).actor,'player');
 assert.ok(turns(g)[0].events.filter(e=>e.type==='draw').every(e=>e.actor==='replacement'));
});
test('live points are private, bonus moves and ties; final score is never double-counted',()=>{
 const g=game();smallBoard(g);g.players[0].tickets=[{id:900,a:'PAR',b:'BRU',p:7},{id:901,a:'ESS',b:'FRA',p:9}];g.players[0].hand=['red','red'];g.players[1].hand=['blue','blue','green','green','green'];
 assert.ok(E.view(g,-1).scoreProgress.players.every(p=>p.bonus===0));
 act(g,'claim',{routeId:0,color:'red'});
 let own=E.view(g,0).scoreProgress;assert.equal(own.own.score,19);assert.equal(own.own.projected,22);assert.equal(g.players[0].score,2);
 const rival=E.view(g,1).scoreProgress;assert.equal(rival.players[0].visible,12);assert.equal(rival.players[0].completedPoints,undefined);assert.equal(E.view(g,-1).scoreProgress.own,null);
 assert.ok(turns(g,0).flatMap(r=>r.events).some(e=>e.type==='destinations'));assert.ok(turns(g,1).flatMap(r=>r.events).every(e=>e.type!=='destinations'));
 act(g,'claim',{routeId:1,color:'blue'});assert.deepEqual(E.view(g,-1).scoreProgress.players.map(p=>p.bonus),[10,10]);
 act(g,'draw_train',{index:-1});act(g,'draw_train',{index:-1});act(g,'claim',{routeId:2,color:'green'});
 assert.deepEqual(E.view(g,-1).scoreProgress.players.map(p=>p.bonus),[0,10]);
 own=E.view(g,0).scoreProgress;assert.equal(own.own.score,9);E.finish(g);assert.equal(g.result.find(r=>r.seat===0).score,own.own.projected);
});
test('H includes unfinished own tracks but gold contains only completed paths, including station borrowing',()=>{
 const view={seat:0,tickets:[{id:1,a:'PAR',b:'ESS'}],ticketProgress:[{id:1,completed:false}],ticketPaths:[],routes:[{id:1,owner:0},{id:2,owner:0},{id:3,owner:1}]};
 let selection=UI.destinationSpotlightSelection(view,null,true);assert.deepEqual(selection.routes,[1,2]);assert.deepEqual(selection.completedRoutes,[]);
 view.ticketProgress[0].completed=true;view.ticketPaths=[{id:1,routes:[1,3],stationRoutes:[3],stations:[{seat:0,city:'PAR'}]}];
 selection=UI.destinationSpotlightSelection(view,null,true);assert.deepEqual(selection.completedRoutes,[1,3]);assert.deepEqual(selection.routes,[1,3,2]);assert.deepEqual(selection.stationRoutes,[3]);
});
test('closed archives expose pending/completed turn facts in every perspective',async()=>{
 const g=game(),room={code:'TEST01',game:g,visibility:'public',members:[{name:'Ana',guestId:'a',ws:{}},{name:'Luis',guestId:'b',ws:{}}],archiveFull:true};
 const archive=createMatchArchive();archive.capture(room);E.observe(g,()=>archive.capture(room));
 act(g,'draw_train',{index:-1});act(g,'draw_train',{index:-1});E.finish(g);archive.capture(room);archive.commit(archive.prepare());
 const pub=await archive.replay({},room.matchId),own=await archive.replay({guestId:'a'},room.matchId);
 const publicState=Replay.at(pub.frames,pub.frames.length-1),privateState=Replay.at(own.frames,own.frames.length-1);
 assert.ok(publicState.views[0].turnHistory.flatMap(r=>r.events).filter(e=>e.type==='draw').every(e=>e.data.color));
 assert.ok(privateState.views[1].turnHistory.flatMap(r=>r.events).filter(e=>e.type==='draw').every(e=>e.data.color));
 const first=Replay.at(own.frames,1).views[1].turnHistory.find(r=>r.turn!==null);assert.equal(first.events.filter(e=>e.type==='draw').length,1);
});
test('history presentation separates leadership changes without rewriting saved turns or advancing replay events',()=>{
 const history=require('../frontend/turn-history'),g=game();smallBoard(g);
 g.players[0].hand=['red','red'];g.players[1].hand=['blue','blue'];
 act(g,'claim',{routeId:0,color:'red'});
 const first=E.view(g,0).turnHistory,saved=JSON.stringify(first),rows=history.displayRows(first);
 const milestone=rows.find(r=>r.kind==='longest'),index=rows.indexOf(milestone);
 assert.equal(milestone.seat,null);assert.equal(milestone.turn,null);
 assert.ok(rows[index-1].events.some(e=>e.type==='build'));
 assert.ok(rows.filter(r=>r.kind!=='longest').every(r=>r.events.every(e=>e.type!=='longest')));
 assert.equal(JSON.stringify(first),saved);
 const context={players:g.players,city:id=>id};
 assert.match(history.content(milestone,context).map(p=>p.text).join(' '),/Ana lidera el camino más largo · \+10 provisional/);
 act(g,'claim',{routeId:1,color:'blue'});
 const later=history.displayRows(E.view(g,0).turnHistory).filter(r=>r.kind==='longest');
 assert.equal(later.length,2);assert.equal(later[0].id,milestone.id);assert.deepEqual(later[0].events,milestone.events);
 assert.match(history.content(later[1],context).map(p=>p.text).join(' '),/Ana y Luis empatan.*cada uno/);
 assert.equal(history.displayRows(first).filter(r=>r.kind==='longest').length,1);
});
test('compact draw history hides blind colors even for the owner and retains meaningful actor labels',()=>{
 const history=require('../frontend/turn-history'),g=game();
 g.face[0]='red';act(g,'draw_train',{index:0});act(g,'draw_train',{index:-1});
 const row=turns(g)[0],saved=JSON.stringify(row),context={players:g.players,city:id=>id};
 assert.ok(row.events.filter(e=>e.type==='draw').every(e=>e.data.color));
 for(const actor of ['bot','replacement','timer']){
  const input={...row,events:row.events.map(e=>({...e,actor}))};
  const parts=history.content(input,context);
  assert.deepEqual(parts.filter(p=>p.className==='history-drawn-cards').flatMap(p=>p.cards),['red','back']);
  assert.equal(parts.find(p=>p.cards).text,'Robó');
  assert.ok(parts.every(p=>!/^T\d+$/.test(p.text)&&!['Bot','Mesa','Mazo'].includes(p.text)));
  if(actor==='replacement')assert.ok(parts.some(p=>p.text==='Bot de reemplazo'));
  if(actor==='timer')assert.ok(parts.some(p=>p.text==='Automático por tiempo'));
 }
 assert.equal(JSON.stringify(row),saved);
});
test('legacy games retain available text, mark partial, and rejected commands add no turn',()=>{
 const g=game();delete g.journal;delete g.journalSerial;delete g.journalRoom;const before=JSON.stringify(g);
 assert.throws(()=>act(g,'claim',{routeId:-1,color:'red'}));assert.equal(JSON.stringify(g),before);
 act(g,'draw_train',{index:-1});assert.equal(E.view(g,0).historyPartial,true);assert.ok(E.view(g,0).turnHistory.some(r=>r.events.some(e=>e.type==='legacy')));
});

test('journal growth uses additive replay changes instead of copying all previous turns',()=>{
 const before={game:{journal:Array.from({length:100},(_,id)=>({id,type:'draw',data:{color:'red'}}))},views:[{turnHistory:[{id:'t1',events:[{id:1}]}]}]};
 const after=structuredClone(before);after.game.journal.push({id:100,type:'draw',data:{color:'blue'}});after.views[0].turnHistory[0].events.push({id:2});after.views[0].turnHistory.push({id:'t2',events:[{id:3}]});
 const diff=Replay.diff(before,after);assert.deepEqual(Replay.apply(before,diff),after);assert.ok(JSON.stringify(diff).length<400);assert.equal(before.game.journal.length,100);
});


test('private milestones leave no public or other-player sequence gaps',()=>{
 const g=game();const before=g.journalSerial;
 J.record(g,'destinations',0,{privateSeat:0,completed:[100],pending:[]});
 J.record(g,'destinations',1,{privateSeat:1,completed:[101],pending:[]});
 J.record(g,'destinations',0,{privateSeat:0,completed:[102],pending:[]});
 J.record(g,'notice',null,{text:'Public'});
 assert.equal(g.journalSerial,before+1);
 const mine=E.view(g,0).turnHistory.flatMap(r=>r.events).filter(e=>e.type==='destinations');
 assert.deepEqual(mine.map(e=>e.id),['private:0:1','private:0:2']);
 assert.ok(E.view(g,-1).turnHistory.flatMap(r=>r.events).every(e=>e.type!=='destinations'));
});
test('zero-length networks have no live leader while projection preserves the existing final-score rule',()=>{
 const g=game();const view=E.view(g,0).scoreProgress;assert.equal(view.own.bonus,0);E.finish(g);
 assert.equal(view.own.projected,g.result.find(r=>r.seat===0).score);
});


test('turn numbering excludes setup and waiting periods and records an automatic turn without action',()=>{
 const g=game();E.next(g,1);act(g,'draw_train',{index:-1});act(g,'draw_train',{index:-1});
 assert.deepEqual(turns(g).map(r=>r.number),[1,2]);assert.equal(turns(g)[0].events[0].type,'no_action');
});

test('optimized longest trail matches exhaustive search on weighted branching, parallel and cyclic networks',()=>{
 const {longestTrail}=require('../game/domain/network');
 function exhaustive(routes){let best=0;function walk(city,used,length){best=Math.max(best,length);routes.forEach((r,i)=>{if(!used.has(i)&&(r.a===city||r.b===city)){used.add(i);walk(r.a===city?r.b:r.a,used,length+r.length);used.delete(i);}});}for(const city of new Set(routes.flatMap(r=>[r.a,r.b])))walk(city,new Set(),0);return best;}
 let seed=17;const rng=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let example=0;example<80;example++){
  const routes=Array.from({length:1+rng(9)},(_,id)=>{const a=rng(5);return {id,a,b:(a+1+rng(4))%5,length:1+rng(4)};});
  const trail=longestTrail(routes);assert.equal(trail.length,exhaustive(routes));assert.equal(new Set(trail.routes).size,trail.routes.length);
  trail.routes.forEach((id,i)=>{const r=routes[id];assert.ok(r.a===trail.cities[i]&&r.b===trail.cities[i+1]||r.b===trail.cities[i]&&r.a===trail.cities[i+1]);});
 }
 const dense=[];for(let a=0;a<7;a++)for(let b=a+1;b<7;b++)dense.push({id:dense.length,a,b,length:1});dense.push({id:99,a:7,b:6,length:2});
 const start=performance.now();assert.equal(longestTrail(dense).length,23);assert.ok(performance.now()-start<1000,'dense Euler network must finish promptly');
 const {botMap}=require('./helpers/bot-map'),weighted=botMap().routes;
 const weightedStart=performance.now();assert.equal(longestTrail(weighted).length,weighted.reduce((n,r)=>n+r.length,0)-3);
 assert.ok(performance.now()-weightedStart<1000,'dense network with eight odd vertices must finish promptly');
});

test('public longest path identifies exact owned lanes, including ties, without exposing tickets or mutable cache',()=>{
 const g=game();smallBoard(g);g.routes[0].owner=0;g.routes[1].owner=0;g.routes[2].owner=1;
 for(const seat of [0,1,-1]){
  const scores=E.view(g,seat).scoreProgress.players;
  assert.deepEqual(new Set(scores[0].longestRoutes),new Set([0,1]));
  for(const [index,score] of scores.entries()){
   assert.equal(score.longestRoutes.reduce((n,id)=>n+g.routes.find(r=>r.id===id).n,0),score.longest);
   assert.ok(score.longestRoutes.every(id=>g.routes.find(r=>r.id===id).owner===index));
   assert.equal(score.tickets,undefined);
  }
 }
 E.view(g,0).scoreProgress.players[0].longestRoutes.length=0;
 assert.equal(E.view(g,-1).scoreProgress.players[0].longestRoutes.length,2);
 g.routes[1].owner=1;
 assert.deepEqual(E.view(g,0).scoreProgress.players[0].longestRoutes,[0]);
});
