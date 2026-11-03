'use strict';
const I18n = require('./i18n');
const GameTiming = require('./game-timing');
const crypto=require('node:crypto');
const Payment=require('./game/domain/payment');
const RouteClaim=require('./game/domain/route-claim');
const {legacyError}=require('./game/compat/legacy-errors');
// Per-action randomness stays outside serialized state. Simulations can supply
// an isolated stream for all draws/recycles without patching global crypto.
const actionRandom=new WeakMap(), observers=new WeakMap(), expiring=new WeakSet();
function observe(g,callback){observers.set(g,callback)}
function recorded(g,seat,action,automatic=false){observers.get(g)?.({seat,action:structuredClone(action),automatic})}
const randomFor=g=>actionRandom.get(g)||crypto.randomInt;
const {COLORS,PLAYER_COLORS,CITIES,ROUTES,TICKETS}=require('./data');
const SCORE={1:1,2:2,3:4,4:7,6:15,8:21};
const CLAIM_RULES={colors:COLORS,routePoints:SCORE,doubleRoutesMinPlayers:4};
const TURN_MS=60000, INITIAL_MS=60000, OFFER_MS=60000;
const TUNNEL_CARD_MS=700, TUNNEL_RESULT_MS=3000;
const tunnelBusy = g => g.phase==='tunnel' && g.pending?.stage && g.pending.stage!=='decision';
function deadlines(g) {
 if(g.phase==='tunnel'&&g.pending?.stage)return [g.pending.stage==='decision'?g.turnDeadline:g.pending.until].filter(Number.isFinite);
 return [g.turnDeadline,...g.players.map(p=>p.offer?.deadline)].filter(Number.isFinite);
}
function event(g,type,seat,details={}){g.eventSerial=(g.eventSerial||0)+1;(g.events??=[]).push({id:g.eventSerial,type,seat,...details});g.events=g.events.slice(-64)}
function startTurn(g,now=Date.now()){
 g.turnSerial=(g.turnSerial||0)+1;g.turnSeat=g.current;g.turnClockPhase=g.phase==='initial'?'initial':'play';
 g.turnWaiting=!!(g.phase==='play'&&g.players[g.current].offer);
 if(g.phase==='initial')g.initialDeadline??=Number.isFinite(g.turnDeadline)?g.turnDeadline:now+(g.timing?.initialSeconds*1000||INITIAL_MS);
 g.turnDeadline=g.phase==='initial'?g.initialDeadline:g.turnWaiting?null:now+(g.timing?.turnSeconds*1000||TURN_MS);
 if(!g.turnWaiting&&g.phase!=='initial')event(g,'turn',g.current);
}
function ensureTiming(g,now=Date.now()){
 if(g.phase==='tunnel'&&g.pending&&!g.pending.stage){
  // Resume older payment decisions without replaying the reveal or granting time.
  g.turnDeadline=Number.isFinite(g.turnDeadline)?g.turnDeadline:now+(g.timing?.turnSeconds*1000||TURN_MS);
  Object.assign(g.pending,{stage:'decision',startedAt:now,until:null,turnRemaining:Math.max(0,g.turnDeadline-now),
   offerRemaining:g.players.map(p=>p.offer?Math.max(0,p.offer.deadline-now):null)});
 }
 if(g.phase==='tunnel'&&g.pending?.stage)return;
 if(g.phase==='initial'){
  // Upgrade sequential saved games without discarding choices or granting a
  // new minute. The existing absolute deadline becomes the shared deadline.
  g.initialDeadline??=Number.isFinite(g.turnDeadline)?g.turnDeadline:now+(g.timing?.initialSeconds*1000||INITIAL_MS);
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
function draw(g){if(!g.deck.length&&g.discard.length){g.deck=shuffle(g.discard,randomFor(g));g.discard=[]}return g.deck.pop()||null}
// House rule: each resolved event returns its whole discard batch to the deck.
// Pending tunnel reveals are deliberately NOT in discard until resolution.
function recycleDiscards(g){if(g.discard.length){g.deck=shuffle([...g.deck,...g.discard],randomFor(g));g.discard=[]}}
function combinations(n,k){if(k<0||k>n)return 0;let total=1;for(let i=1;i<=k;i++)total=total*(n-i+1)/i;return Math.round(total)}
function refill(g){
 while(g.face.length<5){const c=draw(g);if(!c)break;g.face.push(c)}
 if(g.face.length<5||g.face.filter(c=>c==='wild').length<3)return;
 const before=[...g.face];
 g.discard.push(...g.face);g.face=[];recycleDiscards(g);
 // Sample the same distribution as redealing until a valid market, without
 // unbounded retries (a market with <3 available regular cards is impossible).
 const wild=g.deck.filter(c=>c==='wild').length,regular=g.deck.length-wild;
 const weights=[0,1,2].map(k=>combinations(wild,k)*combinations(regular,5-k));
 const total=weights.reduce((a,b)=>a+b,0);
 if(!total){while(g.face.length<5){const c=draw(g);if(!c)break;g.face.push(c)}event(g,'market_refresh',null,{before,after:[...g.face]});return}
 let pick=randomFor(g)(total),neededWild=0;
 while(pick>=weights[neededWild])pick-=weights[neededWild++];
 let neededRegular=5-neededWild;
 for(let i=g.deck.length-1;i>=0&&(neededWild||neededRegular);i--){
  const isWild=g.deck[i]==='wild';
  if(isWild?neededWild:neededRegular){g.face.push(...g.deck.splice(i,1));if(isWild)neededWild--;else neededRegular--}
 }
 g.face=shuffle(g.face,randomFor(g));
 event(g,'market_refresh',null,{before,after:[...g.face]});
}
function newGame(names,first=0,now=Date.now(),timing=null){if(!Array.isArray(names)||names.length<2||names.length>5)fail('Se requieren 2–5 jugadores.');
 if(!Number.isInteger(first)||first<0||first>=names.length)fail('Primer jugador inválido.');
 let g={phase:'initial',current:first,first,initialDone:0,players:names.map((name,i)=>({name:String(name).slice(0,24),color:PLAYER_COLORS[i],hand:[],tickets:[],pending:[],trains:45,stations:3,placed:[],score:0})),routes:ROUTES.map(r=>({...r,owner:null})),deck:shuffle(COLORS.flatMap(x=>Array(12).fill(x)).concat(Array(14).fill('wild'))),discard:[],face:[],shortDeck:shuffle(TICKETS.filter(x=>!x.long)),finalRemaining:null,lastTrigger:null,drawCount:0,pending:null,logs:[],result:null};
 if(timing)g.timing=GameTiming.normalize(timing);
 const long=shuffle(TICKETS.filter(x=>x.long));
 g.players.forEach(p=>{for(let j=0;j<4;j++)p.hand.push(draw(g));p.pending=[long.pop(),...g.shortDeck.splice(0,3)]});
 refill(g);startTurn(g,now);return g}
// Production starts are chosen once on the server; explicit first seats remain
// available for deterministic fixtures and rule tests.
function newRandomGame(names,now=Date.now(),random=crypto.randomInt,timing=null){
 if(!Array.isArray(names)||names.length<2||names.length>5)fail('Se requieren 2–5 jugadores.');
 const g=newGame(names,random(names.length),now,timing);
 note(g,I18n.message`${g.players[g.first].name} empieza la partida (sorteo aleatorio).`,g.first);return g;
}
function historyEntries(g){return g.logs.map((text,i)=>g.history?.[i]?.text===text?g.history[i]:{id:null,text,seat:null})}
function historyEntryView(entry,seat){
 if(!entry.draw)return entry;
 const {color,...draw}=entry.draw;
 return {...entry,draw:{...draw,...(draw.index>=0||entry.seat===seat?{color}:{})}};
}
function note(g,msg,seat=null,details={}){
 const message=typeof msg === "object" ? msg : null; if(message) msg=I18n.format(message);
 const history=historyEntries(g);g.logSerial=(g.logSerial||0)+1;
 g.logs.unshift(msg);g.logs=g.logs.slice(0,25);
 g.history=[{id:g.logSerial,text:msg,seat,...(message?{message}:{}),...details},...history].slice(0,25);
}
function assertTurn(g,seat){if(!Number.isInteger(seat)||seat!==g.current)fail('No es tu turno.')}
function next(g,now=Date.now()){g.drawCount=0;g.pending=null;
 if(g.finalRemaining!==null){g.finalRemaining--;if(g.finalRemaining===0){finish(g);return}}
 else if(g.players[g.current].trains<=2){g.lastTrigger=g.current;g.finalRemaining=g.players.length;note(g,'¡Última ronda! Todos tienen un turno final, incluido quien la activó.')}
 g.current=(g.current+1)%g.players.length;startTurn(g,now)}
function canDrawMore(g){return Boolean(g.deck.length||g.discard.length||g.face.some((c)=>!(g.drawCount===1&&c==='wild')))}
function pay(hand,color,quantity,wildNeeded=0,wildCount){return Payment.planPayment(hand,{color,quantity,wildNeeded,wildCount},CLAIM_RULES)}
function spend(g,p,comp){for(let k=0;k<comp.regular;k++){const i=p.hand.indexOf(comp.color);if(i<0)throw Error('Descuadre de mano');g.discard.push(...p.hand.splice(i,1))}
 for(let k=0;k<comp.wild;k++){const i=p.hand.indexOf('wild');if(i<0)throw Error('Descuadre de comodines');g.discard.push(...p.hand.splice(i,1))}}
function block(g,r,seat){return g.routes.some(x=>RouteClaim.blocksParallelRoute(r,x,{owner:x.owner,seat,playerCount:g.players.length},CLAIM_RULES))}
// Temporary projection: keep persisted Europe rows/IDs and callers unchanged.
// Domain definitions contain no owners; ownership is passed separately by ID.
function decideClaim(g,seat,msg,r){
 const p=g.players[seat];
 const map={routes:g.routes.map(x=>({id:x.id,a:x.a,b:x.b,length:x.n,color:x.color,tunnel:x.tunnel,ferry:x.ferry}))};
 return RouteClaim.decideRouteClaim({seat,playerCount:g.players.length,hand:p.hand,trains:p.trains,
  owners:new Map(g.routes.map(x=>[x.id,x.owner]))},{routeId:r?.id,color:msg.color,wildCount:msg.wildCount},{map,rules:CLAIM_RULES});
}
function action(g,seat,msg,{now=Date.now(),random=crypto.randomInt}={}){
 const previous=actionRandom.get(g);actionRandom.set(g,random);
 try{expire(g,now,random);const serial=g.turnSerial;applyAction(g,seat,msg,now);if(g.turnSerial!==serial&&g.players[seat])g.players[seat].missedTurns=0;recycleDiscards(g);recorded(g,seat,msg)}
 finally{if(previous)actionRandom.set(g,previous);else actionRandom.delete(g)}
}
function settleOffer(g,seat,indexes,finalize=true,now=Date.now()){
 const p=g.players[seat],offer=p.offer,ix=indices(indexes,offer.tickets.length,1);
 p.tickets.push(...ix.map(i=>offer.tickets[i]));g.shortDeck.push(...offer.tickets.filter((_,i)=>!ix.includes(i)));p.offer=null;
 note(g,I18n.message`${p.name} conservó ${ix.length} billete(s) de destino.`,seat);
 if(finalize&&g.phase==='play'&&g.current===seat&&g.turnWaiting)startTurn(g,now);
 if(finalize&&g.phase==='closing'&&!g.players.some(p=>p.offer))finish(g);
}
function applyAction(g,seat,msg,now=Date.now()){const value=applyActionImpl(g,seat,msg,now);if(expiring.has(g))recorded(g,seat,msg,true);return value}
function applyActionImpl(g,seat,msg,now=Date.now()){if(!msg||typeof msg.type!=='string'||!Number.isInteger(seat)||!g.players[seat])fail('Acción incorrecta.');const p=g.players[seat];
 if(g.phase==='finished')fail('La partida terminó.');
 if(tunnelBusy(g)||(g.phase==='tunnel'&&g.pending?.stage&&msg.type==='keep_tickets'))fail('Espera a que termine el túnel.');
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
   const remaining=extra&&Payment.reservePayment(p.hand,base);
   if(!extra || !remaining || !pay(remaining,t.color,t.surcharge,0,msg.extraWild))fail('No tienes suficientes cartas para pagar el túnel.');
   spend(g,p,base);spend(g,p,extra);t.extra={...extra};
   const r=g.routes[t.routeId];r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];event(g,'build',seat,{routeId:r.id});note(g,I18n.message`${p.name} completó el túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]}.`,seat);
  }else note(g,I18n.message`${p.name} desistió del túnel.`,seat);
  g.discard.push(...t.revealed);
  if(t.stage){if(!expiring.has(g))p.missedTurns=0;t.stage='result';t.outcome=msg.type==='pay_tunnel'?'built':'declined';t.reason=t.outcome==='declined'&&expiring.has(g)?'timeout':null;t.resultStartedAt=now;t.until=now+TUNNEL_RESULT_MS;g.turnDeadline=null;}
  else {g.phase='play';next(g,now)}
  return;
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
  note(g,I18n.message`${p.name} robó una carta de tren.`,seat,{draw:{index:msg.index,color:c}});
  if((msg.index>=0&&c==='wild')||g.drawCount===2||!canDrawMore(g))next(g,now);return;
 }
 if(g.drawCount>0)fail('Debes terminar de robar cartas.');
 if(msg.type==='claim'){
  const r=g.routes[msg.routeId],decision=decideClaim(g,seat,msg,r);
  if(!decision.ok)throw legacyError(decision.error);
  const {payment:base,length,points,kind}=decision.plan,color=base.color;
  if(kind==='build'){spend(g,p,base);r.owner=seat;p.trains-=length;p.score+=points;event(g,'build',seat,{routeId:r.id});note(g,I18n.message`${p.name} tomó ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${points}).`,seat);next(g,now);return}
  const revealed=[];for(let i=0;i<3;i++){const c=draw(g);if(c)revealed.push(c)}
  const surcharge=revealed.filter(c=>c==='wild'||(color!=='wild'&&c===color)).length;
  g.phase='tunnel';g.pending={routeId:r.id,color,base,surcharge,revealed,stage:'reveal',startedAt:now,
   until:now+(revealed.length+1)*TUNNEL_CARD_MS,turnRemaining:Math.max(0,g.turnDeadline-now),
   offerRemaining:g.players.map(player=>player.offer?Math.max(0,player.offer.deadline-now):null)};
  g.turnDeadline=null;
  event(g,'tunnel_reveal',seat,{routeId:r.id,paymentColor:color,base:{...base},surcharge,revealed:[...revealed]});
  g.pending.revealId=g.eventSerial;
  // The room clock advances the shared reveal, including zero-surcharge tunnels.
  return;
 }
 if(msg.type==='draw_tickets'){
  if(p.offer)fail('Confirma primero tus billetes pendientes.');
  if(!g.shortDeck.length)fail('No quedan billetes de destino.');
  g.offerSerial=(g.offerSerial||0)+1;
  const duration=g.timing?Math.max(0,g.turnDeadline-now)+g.timing.ticketExtraSeconds*1000:OFFER_MS;
  p.offer={id:g.offerSerial,tickets:g.shortDeck.splice(0,3),duration,deadline:now+duration};
  event(g,'tickets',seat);note(g,I18n.message`${p.name} está eligiendo nuevos billetes.`,seat);next(g,now);return;
 }
 if(msg.type==='station'){
  if(!CITIES[msg.city]||p.stations<1||g.players.some(x=>x.placed.includes(msg.city)))fail('No puedes construir una estación ahí.');
  const cost=4-p.stations,comp=pay(p.hand,msg.color,cost,0,msg.wildCount);
  if(!comp)fail('Cartas insuficientes para la estación.');
  spend(g,p,comp);p.stations--;p.placed.push(msg.city);event(g,'build',seat,{city:msg.city});note(g,I18n.message`${p.name} construyó una estación en ${CITIES[msg.city][2]}.`,seat);next(g,now);return;
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
function expire(g,now=Date.now(),random=randomFor(g)){const previous=actionRandom.get(g);actionRandom.set(g,random);expiring.add(g);try{return expireImpl(g,now,random)}finally{expiring.delete(g);if(previous)actionRandom.set(g,previous);else actionRandom.delete(g)}}
function expireImpl(g,now=Date.now(),random=crypto.randomInt){
 ensureTiming(g,now);let changed=false;
 if(g.phase==='tunnel'&&g.pending?.stage){
  const t=g.pending,seat=g.current,p=g.players[seat];
  if(t.stage==='reveal'&&now>=t.until){
   if(t.surcharge){t.stage='decision';t.until=null;g.turnDeadline=now+t.turnRemaining;}
   else {
    const r=g.routes[t.routeId];spend(g,p,t.base);g.discard.push(...t.revealed);recycleDiscards(g);
    r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];p.missedTurns=0;event(g,'build',seat,{routeId:r.id});
    note(g,I18n.message`${p.name} tomó túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${SCORE[r.n]}).`,seat);
    t.extra={color:t.color,regular:0,wild:0};t.stage='result';t.outcome='built';t.resultStartedAt=now;t.until=now+TUNNEL_RESULT_MS;
   }
   recorded(g,seat,{type:'tunnel_revealed'},true);return true;
  }
  if(t.stage==='result'&&now>=t.until){
   for(const [i,remaining] of t.offerRemaining.entries())if(remaining!==null&&g.players[i].offer)g.players[i].offer.deadline=now+remaining;
   g.phase='play';next(g,now);recorded(g,seat,{type:'tunnel_closed'},true);return true;
  }
  if(t.stage==='decision'&&now>=g.turnDeadline){
   p.missedTurns=(p.missedTurns||0)+1;applyAction(g,seat,{type:'decline_tunnel'},now);recycleDiscards(g);return true;
  }
  // Other clocks and private choices remain frozen while the public modal owns focus.
  return false;
 }
 for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer&&now>=offer.deadline){const indexes=[random(offer.tickets.length)];settleOffer(g,seat,indexes,true,now);recorded(g,seat,{type:"keep_tickets",offerId:offer.id,indexes},true);changed=true}}
 if(['finished','closing'].includes(g.phase)||!Number.isFinite(g.turnDeadline)||now<g.turnDeadline)return changed;
 const seat=g.current,serial=g.turnSerial;
 if(g.phase==='initial'){
  for(let i=0;i<g.players.length;i++){
   if(!g.players[i].pending.length)continue;
   const pool=g.players[i].pending.map((_,j)=>j),picked=[];
   for(let j=0;j<2;j++)picked.push(...pool.splice(random(pool.length),1));
   note(g,I18n.message`${g.players[i].name}: tiempo agotado; conservó 2 billetes al azar.`,i);
   applyAction(g,i,{type:'choose_initial',indexes:picked},now);
  }
  return true;
 }
 note(g,I18n.message`${g.players[seat].name}: tiempo agotado.`,seat);
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
 uiVersion:9,timing:g.timing||null,serverNow:Date.now(),turnDeadline:g.turnDeadline,turnSerial:g.turnSerial,turnWaiting:!!g.turnWaiting,
 initialDeadline:g.initialDeadline,initialReadyCount:g.players.filter(p=>!p.pending.length).length,
 waitingDeadline:g.turnWaiting?g.players[g.current].offer?.deadline:null,
 closingDeadline:g.phase==='closing'?Math.max(...g.players.map(p=>p.offer?.deadline||0)):null,
 events:(g.events||[]).map(e=>{const {color,base,...safe}=e;return {...safe,...(e.type==='tunnel_reveal'?{base}:{}),...(e.type==='draw'&&(e.index>=0||e.seat===seat)?{color}:{})}}),
 drawEvent:drawEvent(g,seat),phase:g.phase,current:g.current,seat,
 players:g.players.map(x=>({name:x.name,color:x.color,trains:x.trains,stations:x.stations,score:x.score,placed:x.placed,handCount:x.hand.length,ticketsCount:x.tickets.length,initialReady:!x.pending.length})),
 routes:g.routes,face:g.face,deckCount:g.deck.length,discardCount:g.discard.length,ticketDeckCount:g.shortDeck.length,
 hand:p.hand,tickets:p.tickets,ticketProgress:details.progress,ticketPaths:details.paths,
 drawCount:own?g.drawCount:0,initial:g.phase==='initial'&&p.pending.length?p.pending:null,
 pending:p.offer?.tickets||null,ticketOffer:p.offer||null,
 sharedTunnel:g.phase==='tunnel'&&g.pending?.stage?{id:g.pending.revealId,seat:g.current,routeId:g.pending.routeId,paymentColor:g.pending.color,
  revealed:g.pending.revealed,surcharge:g.pending.surcharge,stage:g.pending.stage,startedAt:g.pending.startedAt,until:g.pending.until,outcome:g.pending.outcome,
  base:{...g.pending.base},...(g.pending.stage==='result'?{extra:g.pending.extra?{...g.pending.extra}:null,resultStartedAt:g.pending.resultStartedAt,reason:g.pending.reason}:{}),
  cardMs:TUNNEL_CARD_MS,turnRemaining:g.pending.turnRemaining,offerRemaining:g.pending.offerRemaining[seat]??null}:null,
 tunnel:own&&g.phase==='tunnel'?g.pending:null,finalRemaining:g.finalRemaining,logs:g.logs,history:historyEntries(g).map(entry=>historyEntryView(entry,seat)),result:g.phase==='finished'?g.result:null}}
module.exports={observe,newGame,newRandomGame,note,historyEntryView,action,view,connected,connectionPath,longest,stationAssignments,finish,pay,block,draw,refill,recycleDiscards,next,ensureTiming,expire,deadlines,tunnelBusy,TURN_MS,INITIAL_MS,OFFER_MS,TUNNEL_CARD_MS,TUNNEL_RESULT_MS,SCORE,ROUTES,TICKETS,CITIES,COLORS,possibleClaim,possibleStation};
