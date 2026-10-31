'use strict';
const crypto=require('node:crypto');
// Per-action randomness stays outside serialized state. Simulations can supply
// an isolated stream for all draws/recycles without patching global crypto.
const actionRandom=new WeakMap();
const randomFor=g=>actionRandom.get(g)||crypto.randomInt;
const {COLORS,PLAYER_COLORS,CITIES,ROUTES,TICKETS}=require('./data');
const SCORE={1:1,2:2,3:4,4:7,6:15,8:21};
const TURN_MS=60000, INITIAL_MS=60000, OFFER_MS=60000;
function event(g,type,seat,details={}){g.eventSerial=(g.eventSerial||0)+1;(g.events??=[]).push({id:g.eventSerial,type,seat,...details});g.events=g.events.slice(-64)}
function startTurn(g,now=Date.now()){
 g.turnSerial=(g.turnSerial||0)+1;g.turnSeat=g.current;g.turnClockPhase=g.phase==='initial'?'initial':'play';
 g.turnWaiting=!!(g.phase==='play'&&g.players[g.current].offer);
 if(g.phase==='initial')g.initialDeadline??=Number.isFinite(g.turnDeadline)?g.turnDeadline:now+INITIAL_MS;
 g.turnDeadline=g.phase==='initial'?g.initialDeadline:g.turnWaiting?null:now+TURN_MS;
 if(!g.turnWaiting&&g.phase!=='initial')event(g,'turn',g.current);
}
function ensureTiming(g,now=Date.now()){
 if(g.phase==='initial'){
  // Upgrade sequential saved games without discarding choices or granting a
  // new minute. The existing absolute deadline becomes the shared deadline.
  g.initialDeadline??=Number.isFinite(g.turnDeadline)?g.turnDeadline:now+INITIAL_MS;
  g.initialDone=g.players.filter(p=>!p.pending.length).length;
  g.current=g.first;g.turnSeat=g.first;g.turnClockPhase='initial';g.turnWaiting=false;g.turnDeadline=g.initialDeadline;
  return;
 }
 if(g.phase==='tickets'){g.offerSerial=(g.offerSerial||0)+1;g.players[g.current].offer={id:g.offerSerial,tickets:g.pending.tickets,deadline:now+OFFER_MS};g.phase='play';next(g,now)}
 if(['finished','closing'].includes(g.phase)){g.turnDeadline=null;g.turnWaiting=false;return}
 const waiting=!!(g.phase==='play'&&g.players[g.current].offer);
 if(g.turnSeat!==g.current||g.turnClockPhase!==(g.phase==='initial'?'initial':'play')||!!g.turnWaiting!==waiting||(!waiting&&!Number.isFinite(g.turnDeadline)))startTurn(g,now);
}
function shuffle(xs,random=crypto.randomInt){let a=[...xs];for(let i=a.length-1;i>0;i--){let j=random(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function fail(message){throw new Error(message)}
const same=(x,y)=>x.a===y.a&&x.b===y.b||x.a===y.b&&x.b===y.a;
function draw(g){if(!g.deck.length&&g.discard.length){g.deck=shuffle(g.discard,randomFor(g));g.discard=[]}return g.deck.pop()||null}
// House rule: each resolved event returns its whole discard batch to the deck.
// Pending tunnel reveals are deliberately NOT in discard until resolution.
function recycleDiscards(g){if(g.discard.length){g.deck=shuffle([...g.deck,...g.discard],randomFor(g));g.discard=[]}}
function combinations(n,k){if(k<0||k>n)return 0;let total=1;for(let i=1;i<=k;i++)total=total*(n-i+1)/i;return Math.round(total)}
function refill(g){
 while(g.face.length<5){const c=draw(g);if(!c)break;g.face.push(c)}
 if(g.face.length<5||g.face.filter(c=>c==='wild').length<3)return;
 g.discard.push(...g.face);g.face=[];recycleDiscards(g);
 // Sample the same distribution as redealing until a valid market, without
 // unbounded retries (a market with <3 available regular cards is impossible).
 const wild=g.deck.filter(c=>c==='wild').length,regular=g.deck.length-wild;
 const weights=[0,1,2].map(k=>combinations(wild,k)*combinations(regular,5-k));
 const total=weights.reduce((a,b)=>a+b,0);
 if(!total){while(g.face.length<5){const c=draw(g);if(!c)break;g.face.push(c)}return}
 let pick=randomFor(g)(total),neededWild=0;
 while(pick>=weights[neededWild])pick-=weights[neededWild++];
 let neededRegular=5-neededWild;
 for(let i=g.deck.length-1;i>=0&&(neededWild||neededRegular);i--){
  const isWild=g.deck[i]==='wild';
  if(isWild?neededWild:neededRegular){g.face.push(...g.deck.splice(i,1));if(isWild)neededWild--;else neededRegular--}
 }
 g.face=shuffle(g.face,randomFor(g));
}
function newGame(names,first=0,now=Date.now()){if(!Array.isArray(names)||names.length<2||names.length>5)fail('Se requieren 2–5 jugadores.');
 if(!Number.isInteger(first)||first<0||first>=names.length)fail('Primer jugador inválido.');
 let g={phase:'initial',current:first,first,initialDone:0,players:names.map((name,i)=>({name:String(name).slice(0,24),color:PLAYER_COLORS[i],hand:[],tickets:[],pending:[],trains:45,stations:3,placed:[],score:0})),routes:ROUTES.map(r=>({...r,owner:null})),deck:shuffle(COLORS.flatMap(x=>Array(12).fill(x)).concat(Array(14).fill('wild'))),discard:[],face:[],shortDeck:shuffle(TICKETS.filter(x=>!x.long)),finalRemaining:null,lastTrigger:null,drawCount:0,pending:null,logs:[],result:null};
 const long=shuffle(TICKETS.filter(x=>x.long));
 g.players.forEach(p=>{for(let j=0;j<4;j++)p.hand.push(draw(g));p.pending=[long.pop(),...g.shortDeck.splice(0,3)]});
 refill(g);startTurn(g,now);return g}
// Production starts are chosen once on the server; explicit first seats remain
// available for deterministic fixtures and rule tests.
function newRandomGame(names,now=Date.now(),random=crypto.randomInt){
 if(!Array.isArray(names)||names.length<2||names.length>5)fail('Se requieren 2–5 jugadores.');
 const g=newGame(names,random(names.length),now);
 note(g,`${g.players[g.first].name} empieza la partida (sorteo aleatorio).`,g.first);return g;
}
function historyEntries(g){return g.logs.map((text,i)=>g.history?.[i]?.text===text?g.history[i]:{id:null,text,seat:null})}
function note(g,msg,seat=null){
 const history=historyEntries(g);g.logSerial=(g.logSerial||0)+1;
 g.logs.unshift(msg);g.logs=g.logs.slice(0,25);
 g.history=[{id:g.logSerial,text:msg,seat},...history].slice(0,25);
}
function assertTurn(g,seat){if(!Number.isInteger(seat)||seat!==g.current)fail('No es tu turno.')}
function next(g,now=Date.now()){g.drawCount=0;g.pending=null;
 if(g.finalRemaining!==null){g.finalRemaining--;if(g.finalRemaining===0){finish(g);return}}
 else if(g.players[g.current].trains<=2){g.lastTrigger=g.current;g.finalRemaining=g.players.length;note(g,'¡Última ronda! Todos tienen un turno final, incluido quien la activó.')}
 g.current=(g.current+1)%g.players.length;startTurn(g,now)}
function canDrawMore(g){return Boolean(g.deck.length||g.discard.length||g.face.some((c)=>!(g.drawCount===1&&c==='wild')))}
function pay(hand,color,quantity,wildNeeded=0,wildCount){if(!Number.isInteger(quantity)||quantity<1)return null;
 if(color==='wild'){if(hand.filter(c=>c==='wild').length<quantity)return null;return {color:'wild',regular:0,wild:quantity}}
 if(!COLORS.includes(color))return null;
 const reg=hand.filter(c=>c===color).length, wild=hand.filter(c=>c==='wild').length;
 const w=wildCount===undefined?Math.max(wildNeeded,quantity-reg):wildCount;
 if(!Number.isInteger(w)||w<wildNeeded||w>quantity||w>wild||quantity-w>reg)return null;
 return {color,regular:quantity-w,wild:w};}
function spend(g,p,comp){for(let k=0;k<comp.regular;k++){const i=p.hand.indexOf(comp.color);if(i<0)throw Error('Descuadre de mano');g.discard.push(...p.hand.splice(i,1))}
 for(let k=0;k<comp.wild;k++){const i=p.hand.indexOf('wild');if(i<0)throw Error('Descuadre de comodines');g.discard.push(...p.hand.splice(i,1))}}
function block(g,r,seat){return g.routes.some(x=>x.id!==r.id&&same(x,r)&&x.owner!==null&&(x.owner===seat||g.players.length<=3))}
function action(g,seat,msg,{now=Date.now(),random=crypto.randomInt}={}){
 const previous=actionRandom.get(g);actionRandom.set(g,random);
 try{expire(g,now,random);const serial=g.turnSerial;applyAction(g,seat,msg,now);if(g.turnSerial!==serial&&g.players[seat])g.players[seat].missedTurns=0;recycleDiscards(g)}
 finally{if(previous)actionRandom.set(g,previous);else actionRandom.delete(g)}
}
function settleOffer(g,seat,indexes,finalize=true,now=Date.now()){
 const p=g.players[seat],offer=p.offer,ix=indices(indexes,offer.tickets.length,1);
 p.tickets.push(...ix.map(i=>offer.tickets[i]));g.shortDeck.push(...offer.tickets.filter((_,i)=>!ix.includes(i)));p.offer=null;
 note(g,`${p.name} conservó ${ix.length} billete(s) de destino.`,seat);
 if(finalize&&g.phase==='play'&&g.current===seat&&g.turnWaiting)startTurn(g,now);
 if(finalize&&g.phase==='closing'&&!g.players.some(p=>p.offer))finish(g);
}
function applyAction(g,seat,msg,now=Date.now()){if(!msg||typeof msg.type!=='string'||!Number.isInteger(seat)||!g.players[seat])fail('Acción incorrecta.');const p=g.players[seat];
 if(g.phase==='finished')fail('La partida terminó.');
 if(msg.type==='keep_tickets'){
  if(!p.offer||msg.offerId!==p.offer.id)fail('Esta selección de billetes ya no está pendiente.');
  settleOffer(g,seat,msg.indexes,true,now);return;
 }
 if(g.phase==='closing')fail('Esperando las últimas elecciones de billetes.');
 if(g.phase==='initial'){
  if(msg.type!=='choose_initial')fail('Selecciona primero los billetes iniciales.');
  if(!p.pending.length)fail('Ya confirmaste tus billetes iniciales.');
  const ix=indices(msg.indexes,p.pending.length,2);p.tickets.push(...ix.map(i=>p.pending[i]));p.pending=[];
  g.initialDone=g.players.filter(player=>!player.pending.length).length;
  if(g.initialDone===g.players.length){g.phase='play';g.current=g.first;note(g,'¡Partida iniciada!');startTurn(g,now)}
  return;
 }
 assertTurn(g,seat);
 if(g.turnWaiting)fail('Elige primero tus billetes pendientes. Después tendrás un turno completo.');
 if(g.phase==='tunnel'){
  if(!['pay_tunnel','decline_tunnel'].includes(msg.type))fail('Resuelve el túnel antes de continuar.');
  const t=g.pending;let base=t.base;
  if(msg.type==='pay_tunnel'){
   const extra=pay(p.hand,t.color,t.surcharge,0,msg.extraWild);
   // The payment for base and extra must be collectively affordable.
   const avail={...p,hand:[...p.hand]};
   if(!extra || !reserve(avail.hand,base) || !pay(avail.hand,t.color,t.surcharge,0,msg.extraWild))fail('No tienes suficientes cartas para pagar el túnel.');
   spend(g,p,base);spend(g,p,extra);
   const r=g.routes[t.routeId];r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];event(g,'build',seat,{routeId:r.id});note(g,`${p.name} completó el túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]}.`,seat);
  }else note(g,`${p.name} desistió del túnel.`,seat);
  g.discard.push(...t.revealed);g.phase='play';next(g,now);return;
 }
 if(g.phase!=='play')fail('Estado de partida incorrecto.');
 if(msg.type==='draw_train'){
  if(!Number.isInteger(msg.index)||msg.index < -1||msg.index>=g.face.length)fail('Carta inexistente.');
  let c=msg.index===-1?draw(g):g.face[msg.index];if(!c)fail('No hay cartas disponibles.');
  if(msg.index>=0&&c==='wild'&&g.drawCount>0)fail('No se permite tomar una locomotora visible como segunda carta.');
  if(msg.index>=0){const replacement=draw(g);if(replacement)g.face[msg.index]=replacement;else g.face.splice(msg.index,1);refill(g)}p.hand.push(c);g.drawCount++;
  // Store the accepted draw once. Views redact blind colors for every other seat.
  g.drawSerial=(g.drawSerial||0)+1;
  g.lastDraw={id:g.drawSerial,seat,index:msg.index,color:c};
  event(g,'draw',seat,{index:msg.index,color:c});
  note(g,`${p.name} robó una carta de tren.`,seat);
  if((msg.index>=0&&c==='wild')||g.drawCount===2||!canDrawMore(g))next(g,now);return;
 }
 if(g.drawCount>0)fail('Debes terminar de robar cartas.');
 if(msg.type==='claim'){
  const r=g.routes[msg.routeId];if(!r||r.owner!==null||block(g,r,seat))fail('Esta ruta ya no está disponible.');
  if(p.trains<r.n)fail('Te faltan vagones.');
  const color=msg.color==='wild'?'wild':r.color==='gray'?msg.color:r.color;
  if(![...COLORS,'wild'].includes(color))fail('Color inválido.');
  const base=pay(p.hand,color,r.n,r.ferry,msg.wildCount);
  if(!base||base.wild<r.ferry)fail('No tienes cartas para esa ruta.');
  if(!r.tunnel){spend(g,p,base);r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];event(g,'build',seat,{routeId:r.id});note(g,`${p.name} tomó ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${SCORE[r.n]}).`,seat);next(g,now);return}
  const revealed=[];for(let i=0;i<3;i++){const c=draw(g);if(c)revealed.push(c)}
  const surcharge=revealed.filter(c=>c==='wild'||(color!=='wild'&&c===color)).length;
  g.phase='tunnel';g.pending={routeId:r.id,color,base,surcharge,revealed};
  event(g,'tunnel_reveal',seat,{routeId:r.id,paymentColor:color,base:{...base},surcharge,revealed:[...revealed]});
  g.pending.revealId=g.eventSerial;
  // Keep revealed until decision. A 0-surcharge tunnel succeeds automatically.
  if(surcharge===0){spend(g,p,base);g.discard.push(...revealed);r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];g.phase='play';event(g,'build',seat,{routeId:r.id});note(g,`${p.name} tomó túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${SCORE[r.n]}).`,seat);next(g,now)}
  return;
 }
 if(msg.type==='draw_tickets'){
  if(p.offer)fail('Confirma primero tus billetes pendientes.');
  if(!g.shortDeck.length)fail('No quedan billetes de destino.');
  g.offerSerial=(g.offerSerial||0)+1;
  p.offer={id:g.offerSerial,tickets:g.shortDeck.splice(0,3),deadline:now+OFFER_MS};
  event(g,'tickets',seat);note(g,`${p.name} está eligiendo nuevos billetes.`,seat);next(g,now);return;
 }
 if(msg.type==='station'){
  if(!CITIES[msg.city]||p.stations<1||g.players.some(x=>x.placed.includes(msg.city)))fail('No puedes construir una estación ahí.');
  const cost=4-p.stations,comp=pay(p.hand,msg.color,cost,0,msg.wildCount);
  if(!comp)fail('Cartas insuficientes para la estación.');
  spend(g,p,comp);p.stations--;p.placed.push(msg.city);event(g,'build',seat,{city:msg.city});note(g,`${p.name} construyó una estación en ${CITIES[msg.city][2]}.`,seat);next(g,now);return;
 }
 if(msg.type==='pass'){
  // Passing is only permitted when no other move is possible.
  if(canDrawMore(g)||(!p.offer&&g.shortDeck.length)||possibleClaim(g,seat)||possibleStation(g,seat))fail('Todavía puedes realizar una acción.');
  next(g,now);return;
 }
 fail('Acción no reconocida.');
}
// Absolute deadlines survive refresh/reconnection. Tick once per current turn;
// a server restart never fast-forwards an entire absent game's turns.
function expire(g,now=Date.now(),random=crypto.randomInt){
 ensureTiming(g,now);let changed=false;
 for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer&&now>=offer.deadline){settleOffer(g,seat,[random(offer.tickets.length)],true,now);changed=true}}
 if(['finished','closing'].includes(g.phase)||!Number.isFinite(g.turnDeadline)||now<g.turnDeadline)return changed;
 const seat=g.current,serial=g.turnSerial;
 if(g.phase==='initial'){
  for(let i=0;i<g.players.length;i++){
   if(!g.players[i].pending.length)continue;
   const pool=g.players[i].pending.map((_,j)=>j),picked=[];
   for(let j=0;j<2;j++)picked.push(...pool.splice(random(pool.length),1));
   note(g,`${g.players[i].name}: tiempo agotado; conservó 2 billetes al azar.`,i);
   applyAction(g,i,{type:'choose_initial',indexes:picked},now);
  }
  return true;
 }
 note(g,`${g.players[seat].name}: tiempo agotado.`,seat);
 g.players[seat].missedTurns=(g.players[seat].missedTurns||0)+1;
 if(g.phase==='tunnel')applyAction(g,seat,{type:'decline_tunnel'},now);
 else{
  const remaining=2-g.drawCount;
  for(let i=0;i<remaining&&g.turnSerial===serial&&g.phase==='play';i++){
   if(!g.deck.length&&!g.discard.length)break;
   applyAction(g,seat,{type:'draw_train',index:-1},now);
  }
  if(g.turnSerial===serial&&g.phase==='play')next(g,now);
 }
 recycleDiscards(g);return true;
}
function reserve(hand,comp){for(let i=0;i<comp.regular;i++){let j=hand.indexOf(comp.color);if(j<0)return false;hand.splice(j,1)}for(let i=0;i<comp.wild;i++){let j=hand.indexOf('wild');if(j<0)return false;hand.splice(j,1)}return true}
function indices(xs,n,min){if(!Array.isArray(xs)||xs.length<min||xs.length>n||new Set(xs).size!==xs.length||xs.some(x=>!Number.isInteger(x)||x<0||x>=n))fail('Selección de billetes inválida.');return xs}
function possibleClaim(g,seat){const p=g.players[seat];return g.routes.some(r=>r.owner===null&&!block(g,r,seat)&&r.n<=p.trains&&[...COLORS,'wild'].some(c=>pay(p.hand,c,r.n,r.ferry))&&(r.color==='gray'||[r.color,'wild'].some(c=>pay(p.hand,c,r.n,r.ferry))))}
function possibleStation(g,seat){const p=g.players[seat];return p.stations>0&&Object.keys(CITIES).some(city=>!g.players.some(x=>x.placed.includes(city)))&&[...COLORS,'wild'].some(c=>pay(p.hand,c,4-p.stations))}
function connected(owned,a,b){const adj=new Map();for(let r of owned){if(!adj.has(r.a))adj.set(r.a,[]);if(!adj.has(r.b))adj.set(r.b,[]);adj.get(r.a).push(r.b);adj.get(r.b).push(r.a)}const seen=new Set([a]),stack=[a];while(stack.length){let x=stack.pop();if(x===b)return true;for(let next of adj.get(x)||[])if(!seen.has(next)){seen.add(next);stack.push(next)}}return false}
function stationAssignments(g,seat){const p=g.players[seat],own=g.routes.filter(r=>r.owner===seat);const options=p.placed.map(city=>[null,...g.routes.filter(r=>r.owner!==null&&r.owner!==seat&&(r.a===city||r.b===city))]);let best={tickets:p.tickets.map(t=>connected(own,t.a,t.b)),completed:0,score:-Infinity,assigned:[]};
 function walk(i,chosen){if(i===options.length){const all=[...own,...chosen.filter(Boolean)];const outcomes=p.tickets.map(t=>connected(all,t.a,t.b));const pts=p.tickets.reduce((v,t,j)=>v+(outcomes[j]?t.p:-t.p),0);if(pts>best.score){best={tickets:outcomes,completed:outcomes.filter(Boolean).length,score:pts,assigned:chosen.map(r=>r?r.id:null)}}return}for(const r of options[i])walk(i+1,[...chosen,r])}
 walk(0,[]);return best}
function longestTrail(g,seat){const e=g.routes.filter(r=>r.owner===seat),adj={};e.forEach((r,i)=>{(adj[r.a]??=[]).push(i);(adj[r.b]??=[]).push(i)});let best={length:0,routes:[],cities:[]};
 const routes=[],cities=[];
 function walk(node,used,len){cities.push(node);if(len>best.length)best={length:len,routes:[...routes],cities:[...cities]};for(let id of adj[node]||[]){let mask=1n<<BigInt(id);if(!(used&mask)){let r=e[id];routes.push(r.id);walk(r.a===node?r.b:r.a,used|mask,len+r.n);routes.pop()}}cities.pop()}
 for(let x of Object.keys(adj))walk(x,0n,0);return best}
function longest(g,seat){return longestTrail(g,seat).length}
function finish(g,force=false){
 if(force)for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer)settleOffer(g,seat,[crypto.randomInt(offer.tickets.length)],false)}
 g.turnDeadline=null;g.turnWaiting=false;
 if(g.players.some(p=>p.offer)){g.phase='closing';return}
 g.phase='finished';const trails=g.players.map((_,i)=>longestTrail(g,i)),lengths=trails.map(t=>t.length),max=Math.max(...lengths);
 g.result=g.players.map((p,i)=>{let v=stationAssignments(g,i);let express=lengths[i]===max?10:0;return {seat:i,name:p.name,route:p.score,destination:v.score,completed:v.completed,stations:p.stations*4,express,longest:lengths[i],stationRoutes:v.assigned,individualTickets:v.tickets,tickets:p.tickets,score:p.score+v.score+p.stations*4+express}});
 g.result.sort((a,b)=>b.score-a.score||b.completed-a.completed||b.stations-a.stations||b.express-a.express);
 addScoreDetails(g,trails);
 let win=g.result[0];g.result.forEach(x=>{x.winner=x.score===win.score&&x.completed===win.completed&&x.stations===win.stations&&x.express===win.express});note(g,'Partida finalizada. ¡Resultados calculados!')}
function connectionPath(routes,a,b){
 const queue=[a],previous=new Map([[a,null]]);
 for(const city of queue){if(city===b)break;for(const r of routes){const next=r.a===city?r.b:r.b===city?r.a:null;if(next&&!previous.has(next)){previous.set(next,{city,id:r.id});queue.push(next)}}}
 if(!previous.has(b))return [];
 const path=[];for(let city=b;city!==a;){const step=previous.get(city);path.unshift(step.id);city=step.city}return path;
}
function destinationDetails(g,seat,assignment=stationAssignments(g,seat)){const p=g.players[seat],own=g.routes.filter(r=>r.owner===seat),borrowed=assignment.assigned.filter(id=>id!==null),all=[...own,...borrowed.map(id=>g.routes[id])];return {
 progress:p.tickets.map((t,i)=>({id:t.id,completed:assignment.tickets[i],viaStation:assignment.tickets[i]&&!connected(own,t.a,t.b)})),
 paths:p.tickets.map((t,i)=>{const routes=assignment.tickets[i]?connectionPath(connected(own,t.a,t.b)?own:all,t.a,t.b):[];return {id:t.id,routes,stationRoutes:routes.filter(id=>borrowed.includes(id)),stations:p.placed.flatMap((city,j)=>assignment.assigned[j]!==null&&routes.includes(assignment.assigned[j])?[{city,routeId:assignment.assigned[j],seat}]:[])}})
}}
function addScoreDetails(g,trails=g.players.map((_,i)=>longestTrail(g,i))){
 const maximum=Math.max(...g.result.map(r=>r.longest));
 for(const result of g.result){
  if(result.details)continue;
  const seat=result.seat,p=g.players[seat],assignment={tickets:result.individualTickets,assigned:result.stationRoutes};
  const paths=destinationDetails(g,seat,assignment).paths;
  const routes=g.routes.filter(r=>r.owner===seat).map(r=>({id:r.id,a:r.a,b:r.b,length:r.n,points:SCORE[r.n]}));
  result.details={routes,routeAdjustment:result.route-routes.reduce((sum,r)=>sum+r.points,0),
   destinations:result.tickets.map((t,i)=>({...t,completed:result.individualTickets[i],points:result.individualTickets[i]?t.p:-t.p,...paths[i]})),
   stations:{unused:result.stations/4,points:result.stations,placed:p.placed.map((city,i)=>({city,routeId:result.stationRoutes[i]??null,seat}))},
   express:{...trails[seat],maximum,tiedSeats:g.result.filter(r=>r.longest===maximum).map(r=>r.seat),points:result.express},
   totals:{routes:result.route,destinations:result.destination,stations:result.stations,express:result.express,total:result.score}};
 }
}
function drawEvent(g,seat){const e=g.lastDraw;if(!e)return null;return {id:e.id,seat:e.seat,index:e.index,...(e.index>=0||e.seat===seat?{color:e.color}:{})}}
function view(g,seat){const spectator=seat===-1,p=spectator?{hand:[],tickets:[],pending:[],offer:null}:g.players[seat],own=seat===g.current,details=spectator?{progress:[],paths:[]}:destinationDetails(g,seat);if(g.phase==='finished'&&g.result.some(r=>!r.details))addScoreDetails(g);return {
 spectator,
 uiVersion:5,serverNow:Date.now(),turnDeadline:g.turnDeadline,turnSerial:g.turnSerial,turnWaiting:!!g.turnWaiting,
 initialDeadline:g.initialDeadline,initialReadyCount:g.players.filter(p=>!p.pending.length).length,
 waitingDeadline:g.turnWaiting?g.players[g.current].offer?.deadline:null,
 closingDeadline:g.phase==='closing'?Math.max(...g.players.map(p=>p.offer?.deadline||0)):null,
 events:(g.events||[]).filter(e=>e.type!=='tunnel_reveal'||e.seat===seat).map(e=>{const {color,...safe}=e;return {...safe,...(e.type==='draw'&&(e.index>=0||e.seat===seat)?{color}:{})}}),
 drawEvent:drawEvent(g,seat),phase:g.phase,current:g.current,seat,
 players:g.players.map(x=>({name:x.name,color:x.color,trains:x.trains,stations:x.stations,score:x.score,placed:x.placed,handCount:x.hand.length,ticketsCount:x.tickets.length,initialReady:!x.pending.length})),
 routes:g.routes,face:g.face,deckCount:g.deck.length,discardCount:g.discard.length,ticketDeckCount:g.shortDeck.length,
 hand:p.hand,tickets:p.tickets,ticketProgress:details.progress,ticketPaths:details.paths,
 drawCount:own?g.drawCount:0,initial:g.phase==='initial'&&p.pending.length?p.pending:null,
 pending:p.offer?.tickets||null,ticketOffer:p.offer||null,
 tunnel:own&&g.phase==='tunnel'?g.pending:null,finalRemaining:g.finalRemaining,logs:g.logs,history:historyEntries(g),result:g.phase==='finished'?g.result:null}}
module.exports={newGame,newRandomGame,note,action,view,connected,connectionPath,longest,stationAssignments,finish,pay,block,draw,refill,recycleDiscards,next,ensureTiming,expire,TURN_MS,INITIAL_MS,OFFER_MS,SCORE,ROUTES,TICKETS,CITIES,COLORS,possibleClaim,possibleStation};
