'use strict';
const I18n = require('./i18n');
const GameTiming = require('./game-timing');
const crypto=require('node:crypto');
const Payment=require('./game/domain/payment');
const RouteClaim=require('./game/domain/route-claim');
const Turn=require('./game/domain/turn');
const Tunnel=require('./game/domain/tunnel');
const Setup=require('./game/domain/setup');
const Destinations=require('./game/domain/destinations');
const Stations=require('./game/domain/stations');
const Network=require('./game/domain/network');
const Scoring=require('./game/domain/scoring');
const LegacyScoring=require('./game/compat/legacy-scoring');
const {shuffle}=require('./game/domain/random');
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
const TUNNEL_RULES={colors:COLORS,cardMs:TUNNEL_CARD_MS,resultMs:TUNNEL_RESULT_MS};
const SETUP_RULES={minPlayers:2,maxPlayers:5,maxNameLength:24,playerColors:PLAYER_COLORS,
 trainCards:[...COLORS.map(color=>({color,count:12})),{color:'wild',count:14}],
 initialHand:4,initialLongTickets:1,initialShortTickets:3,trains:45,stations:3};
const DESTINATION_RULES={initialMinimum:2,offerMinimum:1,offerCount:3};
const STATION_CONTEXT={map:{cities:Object.keys(CITIES).map(id=>({id}))},rules:{colors:COLORS,stationCosts:[1,2,3]}};
const SCORING_RULES={routePoints:SCORE,unusedStationPoints:4,expressPoints:10,tieBreakers:['score','completed','stations','express']};
const destinationRules=g=>({...DESTINATION_RULES,offerClock:g.timing?
 {kind:'remaining-turn',extraMs:g.timing.ticketExtraSeconds*1000}:{kind:'fixed',durationMs:OFFER_MS}});
const turnRules=g=>({initialMs:g.timing?.initialSeconds*1000||INITIAL_MS,turnMs:g.timing?.turnSeconds*1000||TURN_MS,finalTrainThreshold:2});
const tunnelBusy = g => g.phase==='tunnel' && g.pending?.stage && g.pending.stage!=='decision';
function deadlines(g) {
 if(g.phase==='tunnel'&&g.pending?.stage)return [g.pending.stage==='decision'?g.turnDeadline:g.pending.until].filter(Number.isFinite);
 return [g.turnDeadline,...g.players.map(p=>p.offer?.deadline)].filter(Number.isFinite);
}
function event(g,type,seat,details={}){g.eventSerial=(g.eventSerial||0)+1;(g.events??=[]).push({id:g.eventSerial,type,seat,...details});g.events=g.events.slice(-64)}
function startTurn(g,now=Date.now()){
 const plan=Turn.planTurnStart(g,{now,rules:turnRules(g)});Object.assign(g,plan.changes);
 if(plan.emitTurn)event(g,'turn',g.current);
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
function newGame(names,first=0,now=Date.now(),timing=null,{random=crypto.randomInt}={}){
 const decision=Setup.prepareGame({names,first},{map:{tickets:TICKETS},rules:SETUP_RULES,random});
 if(!decision.ok)throw legacyError(decision.error);
 const g={phase:'initial',current:first,first,initialDone:0,...decision.plan,routes:ROUTES.map(r=>({...r,owner:null})),
 discard:[],face:[],finalRemaining:null,lastTrigger:null,drawCount:0,pending:null,logs:[],result:null};
 if(timing)g.timing=GameTiming.normalize(timing);
 actionRandom.set(g,random);
 try{refill(g);startTurn(g,now);return g}finally{actionRandom.delete(g)}
}
// Production starts are chosen once on the server; explicit first seats remain
// available for deterministic fixtures and rule tests.
function newRandomGame(names,now=Date.now(),random=crypto.randomInt,timing=null,options){
 if(!Array.isArray(names)||names.length<2||names.length>5)fail('Se requieren 2–5 jugadores.');
 // The third argument still draws only the starting seat. Optional fifth-argument
 // randomness controls the deal/market without changing that existing contract.
 const g=newGame(names,random(names.length),now,timing,options);
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
function next(g,now=Date.now()){
 const plan=Turn.planNextTurn(g,{now,rules:turnRules(g)});Object.assign(g,plan.changes);
 if(plan.finalRoundStarted)note(g,'¡Última ronda! Todos tienen un turno final, incluido quien la activó.');
 if(plan.finish){finish(g);return}
 if(plan.emitTurn)event(g,'turn',g.current);
}
function canDrawMore(g){return Boolean(g.deck.length||g.discard.length||g.face.some((c)=>!(g.drawCount===1&&c==='wild')))}
function pay(hand,color,quantity,wildNeeded=0,wildCount){return Payment.planPayment(hand,{color,quantity,wildNeeded,wildCount},CLAIM_RULES)}
function spend(g,p,comp){for(let k=0;k<comp.regular;k++){const i=p.hand.indexOf(comp.color);if(i<0)throw Error('Descuadre de mano');g.discard.push(...p.hand.splice(i,1))}
 for(let k=0;k<comp.wild;k++){const i=p.hand.indexOf('wild');if(i<0)throw Error('Descuadre de comodines');g.discard.push(...p.hand.splice(i,1))}}
function awardRoute(g,seat,r,length=r.n,points=SCORE[length]){r.owner=seat;g.players[seat].trains-=length;g.players[seat].score+=points;event(g,'build',seat,{routeId:r.id})}
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
function settleOffer(g,seat,selection,finalize=true,now=Date.now()){
 const p=g.players[seat],decision=Destinations.decideOfferChoice(p,selection,{rules:DESTINATION_RULES});
 if(!decision.ok)throw legacyError(decision.error);
 const {kept,returned}=decision.plan;p.tickets.push(...kept);g.shortDeck.push(...returned);p.offer=null;
 note(g,I18n.message`${p.name} conservó ${kept.length} billete(s) de destino.`,seat);
 if(finalize&&g.phase==='play'&&g.current===seat&&g.turnWaiting)startTurn(g,now);
 if(finalize&&g.phase==='closing'&&!g.players.some(p=>p.offer))finish(g);
}
function applyAction(g,seat,msg,now=Date.now()){const value=applyActionImpl(g,seat,msg,now);if(expiring.has(g))recorded(g,seat,msg,true);return value}
function applyActionImpl(g,seat,msg,now=Date.now()){if(!msg||typeof msg.type!=='string'||!Number.isInteger(seat)||!g.players[seat])fail('Acción incorrecta.');const p=g.players[seat];
 if(g.phase==='finished')fail('La partida terminó.');
 if(tunnelBusy(g)||(g.phase==='tunnel'&&g.pending?.stage&&msg.type==='keep_tickets'))fail('Espera a que termine el túnel.');
 if(msg.type==='keep_tickets'){
  settleOffer(g,seat,{offerId:msg.offerId,indexes:msg.indexes},true,now);return;
 }
 if(g.phase==='closing')fail('Esperando las últimas elecciones de billetes.');
 if(g.phase==='initial'){
  if(msg.type!=='choose_initial')fail('Selecciona primero los billetes iniciales.');
  const decision=Destinations.decideInitialChoice(g,{seat,indexes:msg.indexes},{rules:DESTINATION_RULES});
  if(!decision.ok)throw legacyError(decision.error);
  p.tickets.push(...decision.plan.kept);p.pending=[];g.initialDone=decision.plan.initialDone;
  if(decision.plan.startPlay){g.phase='play';g.current=g.first;note(g,'¡Partida iniciada!');startTurn(g,now)}
  return;
 }
 assertTurn(g,seat);
 if(g.turnWaiting)fail('Elige primero tus billetes pendientes. Después tendrás un turno completo.');
 if(g.phase==='tunnel'){
  const t=g.pending,decision=Tunnel.decideTunnel({tunnel:t,hand:p.hand},
   {type:msg.type==='pay_tunnel'?'pay':msg.type==='decline_tunnel'?'decline':null,wildCount:msg.extraWild,timeout:expiring.has(g)},
   {now,rules:TUNNEL_RULES});
  if(!decision.ok)throw legacyError(decision.error);
  const plan=decision.plan;
  if(plan.build){
   for(const payment of plan.payments)spend(g,p,payment);
   const r=g.routes[t.routeId];awardRoute(g,seat,r);note(g,I18n.message`${p.name} completó el túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]}.`,seat);
  }else note(g,I18n.message`${p.name} desistió del túnel.`,seat);
  g.discard.push(...t.revealed);
  if(!expiring.has(g))p.missedTurns=0;Object.assign(t,plan.pendingChanges);g.turnDeadline=null;
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
  if(kind==='build'){spend(g,p,base);awardRoute(g,seat,r,length,points);note(g,I18n.message`${p.name} tomó ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${points}).`,seat);next(g,now);return}
  const revealed=[];for(let i=0;i<3;i++){const c=draw(g);if(c)revealed.push(c)}
  g.phase='tunnel';g.pending=Tunnel.beginTunnel({routeId:r.id,base,revealed,turnDeadline:g.turnDeadline,
   offerDeadlines:g.players.map(player=>player.offer?player.offer.deadline:null)},{now,rules:TUNNEL_RULES});
  g.turnDeadline=null;
  event(g,'tunnel_reveal',seat,{routeId:r.id,paymentColor:color,base:{...base},surcharge:g.pending.surcharge,revealed:[...revealed]});
  g.pending.revealId=g.eventSerial;
  // The room clock advances the shared reveal, including zero-surcharge tunnels.
  return;
 }
 if(msg.type==='draw_tickets'){
  const decision=Destinations.planOffer({offer:p.offer,shortDeck:g.shortDeck,offerSerial:g.offerSerial,turnDeadline:g.turnDeadline},{now,rules:destinationRules(g)});
  if(!decision.ok)throw legacyError(decision.error);
  p.offer=decision.plan.offer;g.offerSerial=p.offer.id;g.shortDeck.splice(0,decision.plan.takeCount);
  event(g,'tickets',seat);note(g,I18n.message`${p.name} está eligiendo nuevos billetes.`,seat);next(g,now);return;
 }
 if(msg.type==='station'){
  const decision=Stations.decideStation(stationState(g,seat),{cityId:msg.city,color:msg.color,wildCount:msg.wildCount},STATION_CONTEXT);
  if(!decision.ok)throw legacyError(decision.error);
  const {cityId,payment}=decision.plan;
  spend(g,p,payment);p.stations--;p.placed.push(cityId);event(g,'build',seat,{city:cityId});note(g,I18n.message`${p.name} construyó una estación en ${CITIES[cityId][2]}.`,seat);next(g,now);return;
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
  const t=g.pending,seat=g.current,p=g.players[seat],plan=Tunnel.advanceTunnel({tunnel:t,turnDeadline:g.turnDeadline},{now,rules:TUNNEL_RULES});
  if(plan.kind==='decision'||plan.kind==='build'){
   if(plan.kind==='decision'){Object.assign(t,plan.pendingChanges);g.turnDeadline=plan.turnDeadline;}
   else {
    const r=g.routes[t.routeId];for(const payment of plan.payments)spend(g,p,payment);g.discard.push(...t.revealed);recycleDiscards(g);
    p.missedTurns=0;awardRoute(g,seat,r);
    note(g,I18n.message`${p.name} tomó túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${SCORE[r.n]}).`,seat);
    Object.assign(t,plan.pendingChanges);
   }
   recorded(g,seat,{type:'tunnel_revealed'},true);return true;
  }
  if(plan.kind==='close'){
   for(const [i,deadline] of plan.offerDeadlines.entries())if(deadline!==null&&g.players[i].offer)g.players[i].offer.deadline=deadline;
   g.phase='play';next(g,now);recorded(g,seat,{type:'tunnel_closed'},true);return true;
  }
  if(plan.kind==='timeout'){
   p.missedTurns=(p.missedTurns||0)+1;applyAction(g,seat,{type:'decline_tunnel'},now);recycleDiscards(g);return true;
  }
  // Other clocks and private choices remain frozen while the public modal owns focus.
  return false;
 }
 for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer&&now>=offer.deadline){const indexes=Destinations.randomSelection(offer.tickets,DESTINATION_RULES.offerMinimum,{random});settleOffer(g,seat,{offerId:offer.id,indexes},true,now);recorded(g,seat,{type:"keep_tickets",offerId:offer.id,indexes},true);changed=true}}
 if(['finished','closing'].includes(g.phase)||!Number.isFinite(g.turnDeadline)||now<g.turnDeadline)return changed;
 const seat=g.current,serial=g.turnSerial;
 if(g.phase==='initial'){
  for(let i=0;i<g.players.length;i++){
   if(!g.players[i].pending.length)continue;
   const picked=Destinations.randomSelection(g.players[i].pending,DESTINATION_RULES.initialMinimum,{random});
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
function possibleClaim(g,seat){const p=g.players[seat];return g.routes.some(r=>r.owner===null&&!block(g,r,seat)&&r.n<=p.trains&&[...COLORS,'wild'].some(c=>pay(p.hand,c,r.n,r.ferry))&&(r.color==='gray'||[r.color,'wild'].some(c=>pay(p.hand,c,r.n,r.ferry))))}
function stationState(g,seat){return {hand:g.players[seat].hand,remainingStations:g.players[seat].stations,occupiedCities:new Set(g.players.flatMap(p=>p.placed))}}
function possibleStation(g,seat){return Stations.canBuildStation(stationState(g,seat),STATION_CONTEXT)}
const connected=Network.connected,connectionPath=Network.connectionPath;
function stationAssignments(g,seat){const {map,owners}=LegacyScoring.projectBoard(g);return Stations.assignStations({...LegacyScoring.projectPlayer(g.players[seat]),seat,owners},{map})}
function longestTrail(g,seat){return Network.longestTrail(g.routes.filter(r=>r.owner===seat).map(r=>({id:r.id,a:r.a,b:r.b,length:r.n})))}
function longest(g,seat){return longestTrail(g,seat).length}
function finish(g,force=false,{random=randomFor(g)}={}){
 if(force)for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer)settleOffer(g,seat,{offerId:offer.id,indexes:Destinations.randomSelection(offer.tickets,DESTINATION_RULES.offerMinimum,{random})},false)}
 g.turnDeadline=null;g.turnWaiting=false;
 if(g.players.some(p=>p.offer)){g.phase='closing';return}
 g.phase='finished';const {map,owners}=LegacyScoring.projectBoard(g),state={owners,players:g.players.map(LegacyScoring.projectPlayer)};
 g.result=Scoring.scoreMatch(state,{map,rules:SCORING_RULES}).map(result=>LegacyScoring.legacyResult(result,g.players[result.seat]));
 note(g,'Partida finalizada. ¡Resultados calculados!')}
function destinationDetails(g,seat,assignment){const {map,owners}=LegacyScoring.projectBoard(g);return Scoring.destinationDetails({...LegacyScoring.projectPlayer(g.players[seat]),seat,owners},{map},assignment)}
function addScoreDetails(g){
 const {map,owners}=LegacyScoring.projectBoard(g),state={owners,players:g.players.map(LegacyScoring.projectPlayer)};
 const trails=g.players.map((_,seat)=>Network.longestTrail(map.routes.filter(r=>owners.get(r.id)===seat)));
 for(const result of g.result){
  if(result.details)continue;
  const details=Scoring.resultDetails(state,LegacyScoring.projectResult(result),g.result,{map,rules:SCORING_RULES,trails});
  result.details=LegacyScoring.legacyDetails(details,result.tickets);
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
