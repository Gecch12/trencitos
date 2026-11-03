'use strict';
const I18n = require('../shared/i18n');
const GameTiming = require('../shared/game-timing');
const crypto=require('node:crypto');
const Payment=require('../game/domain/payment');
const RouteClaim=require('../game/domain/route-claim');
const Turn=require('../game/domain/turn');
const Tunnel=require('../game/domain/tunnel');
const Setup=require('../game/domain/setup');
const Destinations=require('../game/domain/destinations');
const Stations=require('../game/domain/stations');
const Network=require('../game/domain/network');
const Scoring=require('../game/domain/scoring');
const Journal=require('./match-journal');
const {createLiveScore}=require('../game/queries/live-score');
const LegacyScoring=require('../game/compat/legacy-scoring');
const TrainCards=require('../game/domain/train-cards');
const LegacyTiming=require('../game/compat/legacy-timing');
const MatchView=require('../game/queries/match-view');
const {createDestinationDetails}=require('../game/queries/destination-details');
const {projectDefinition}=require('../game/queries/match-definition');
const {historyEntries,historyEntryView}=MatchView;
const {legacyError}=require('../game/compat/legacy-errors');
const {COLORS,CITIES,ROUTES,TICKETS}=require('../shared/data');
const {maps:registeredMaps}=require('./maps');
const {createMatchContexts,validateSetupTickets}=require('./match-context');
const defaultRules=require('./rules/europe-classic-v1');
const {MATCH_SCHEMA_VERSION,restoreMatchState}=require('../game/compat/match-state');
// Legacy data/payment exports remain Europe-only for old callers and fixtures.
// Active bots resolve contextFor(game) and use the domain payment policy.
const SCORE=defaultRules.routePoints;
const TURN_MS=defaultRules.turn.turnMs,INITIAL_MS=defaultRules.turn.initialMs,OFFER_MS=defaultRules.offerMs;
const TUNNEL_CARD_MS=defaultRules.tunnel.cardMs,TUNNEL_RESULT_MS=defaultRules.tunnel.resultMs;

function createEngine({maps=registeredMaps}={}){
const contexts=createMatchContexts(maps),contextFor=g=>contexts.forGame(g),rulesFor=g=>contextFor(g).rules;
const cityName=(g,id)=>contextFor(g).cityName(id);
const routeById=(g,id)=>g.routes.find(route=>route.id===id);
const requireRoute=(g,id)=>{const route=routeById(g,id);if(!route)throw legacyError({code:'ROUTE_UNAVAILABLE'});return route;};
const stationContext=g=>({map:contextFor(g).map,rules:rulesFor(g).stations});
const restoreState=g=>restoreMatchState(g,contextFor(g));
// Per-action randomness stays outside serialized state. Simulations can supply
// an isolated stream for all draws/recycles without patching global crypto.
const actionRandom=new WeakMap(), observers=new WeakMap(), expiring=new WeakSet();
function observe(g,callback){observers.set(g,callback)}
function recorded(g,seat,action,automatic=false){observers.get(g)?.({seat,action:structuredClone(action),automatic})}
const randomFor=g=>actionRandom.get(g)||crypto.randomInt;
const cardContext=g=>({rules:rulesFor(g).trainCards,random:randomFor(g)});
const destinationRules=g=>({...rulesFor(g).destinations,offerClock:g.timing?
 {kind:'remaining-turn',extraMs:g.timing.ticketExtraSeconds*1000}:{kind:'fixed',durationMs:rulesFor(g).offerMs}});
const turnRules=g=>({...rulesFor(g).turn,initialMs:g.timing?.initialSeconds*1000||rulesFor(g).turn.initialMs,turnMs:g.timing?.turnSeconds*1000||rulesFor(g).turn.turnMs});
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
 const plan=LegacyTiming.planTiming(g,{now,rules:turnRules(g),offerMs:rulesFor(g).offerMs});
 if(plan.pendingChanges)Object.assign(g.pending,plan.pendingChanges);
 if(plan.offer)g.players[plan.offer.seat].offer=plan.offer.value;
 Object.assign(g,plan.changes);
 if(plan.finalRoundStarted)note(g,'¡Última ronda! Todos tienen un turno final, incluido quien la activó.');
 if(plan.finish)finish(g);else if(plan.emitTurn)event(g,'turn',g.current);
}
function normalize(g,now=Date.now()){
 ensureTiming(g,now);LegacyScoring.completeResults(g,rulesFor(g).scoring);return g;
}
function fail(message){throw new Error(message)}
// Preserve legacy pile containers between draws; recycling/renewal replaces them.
function applyCardPiles(g,plan,recordRefresh=true){
 const recycledCount=g.discard.length;
 for(const key of ['deck','discard','face']){
  if(key==='face'?plan.refresh:plan.recycled)g[key]=plan.piles[key];
  else g[key].splice(0,g[key].length,...plan.piles[key]);
 }
 if(plan.recycled&&!plan.sequence)Journal.record(g,'recycled',g.phase==='initial'?null:Journal.actorSeat(g,g.current),{count:recycledCount});
 if(plan.refresh){event(g,'market_refresh',null,plan.refresh);if(recordRefresh)noteMarketRefresh(g,plan.refresh);}
}
function noteMarketRefresh(g,refresh,record=true){
 if(record)Journal.record(g,'market_refresh',g.phase==='initial'?null:Journal.actorSeat(g,g.current),refresh);
 note(g,'Mesa renovada: aparecieron 3 comodines.',null,{marketRefresh:refresh});
}
function draw(g){const plan=TrainCards.drawCard(g,cardContext(g));applyCardPiles(g,plan);return plan.card}
function recycleDiscards(g){if(g.discard.length)applyCardPiles(g,TrainCards.recycleDiscards(g,cardContext(g)))}
function refill(g){applyCardPiles(g,TrainCards.refillMarket(g,cardContext(g)))}
function newGame(names,first=0,now=Date.now(),timing=null,options={}){
 const {random=crypto.randomInt}=options,{context,references}=contexts.forSetup(options);
 if(Array.isArray(names)&&names.length>=context.rules.setup.minPlayers&&names.length<=context.rules.setup.maxPlayers)validateSetupTickets(context,names.length);
 const decision=Setup.prepareGame({names,first},{map:{tickets:context.tickets.map(t=>({...t}))},rules:context.rules.setup,random});
 if(!decision.ok)throw legacyError(decision.error);
 const g={schemaVersion:MATCH_SCHEMA_VERSION,...references,phase:'initial',current:first,first,initialDone:0,...decision.plan,routes:context.routes.map(r=>({...r,owner:null})),
 discard:[],face:[],finalRemaining:null,lastTrigger:null,drawCount:0,pending:null,logs:[],result:null,journal:[],journalSerial:0};
 Journal.record(g,'setup',null,{first,players:names.length},{system:true,at:now});
 if(timing)g.timing=GameTiming.normalize(timing);
 actionRandom.set(g,random);
 try{refill(g);startTurn(g,now);return g}finally{actionRandom.delete(g)}
}
// Production starts are chosen once on the server; explicit first seats remain
// available for deterministic fixtures and rule tests.
function newRandomGame(names,now=Date.now(),random=crypto.randomInt,timing=null,options={}){
 const {context}=contexts.forSetup(options),{minPlayers,maxPlayers}=context.rules.setup;
 if(!Array.isArray(names)||names.length<minPlayers||names.length>maxPlayers)fail('Se requieren 2–5 jugadores.');
 validateSetupTickets(context,names.length);
 // The third argument still draws only the starting seat. Optional fifth-argument
 // randomness controls the deal/market without changing that existing contract.
 const g=newGame(names,random(names.length),now,timing,options);
 note(g,I18n.message`${g.players[g.first].name} empieza la partida (sorteo aleatorio).`,g.first);return g;
}
function note(g,msg,seat=null,details={}){
 const message=typeof msg === "object" ? msg : null; if(message) msg=I18n.format(message);
 const history=historyEntries(g);g.logSerial=(g.logSerial||0)+1;
 g.logs.unshift(msg);g.logs=g.logs.slice(0,25);
 g.history=[{id:g.logSerial,text:msg,seat,...(message?{message}:{}),...details},...history].slice(0,25);
 if(seat===null&&!details.marketRefresh)Journal.record(g,'notice',null,{text:msg,...(message?{message}:{})},{system:true});
}
function assertTurn(g,seat){if(!Number.isInteger(seat)||seat!==g.current)fail('No es tu turno.')}
function next(g,now=Date.now()){
 if(Journal.enabled(g)&&g.phase==='play'&&!g.journal?.some(e=>e.turn===g.turnSerial))Journal.record(g,'no_action',g.current,{}, {turn:g.turnSerial,at:now});
 const plan=Turn.planNextTurn(g,{now,rules:turnRules(g)});Object.assign(g,plan.changes);
 if(plan.finalRoundStarted)note(g,'¡Última ronda! Todos tienen un turno final, incluido quien la activó.');
 if(plan.finish){finish(g);return}
 if(plan.emitTurn)event(g,'turn',g.current);
}
function canDrawMore(g){return TrainCards.canDrawMore(g)}
function pay(hand,color,quantity,wildNeeded=0,wildCount){return Payment.planPayment(hand,{color,quantity,wildNeeded,wildCount},defaultRules.claim)}
function spend(g,p,comp){for(let k=0;k<comp.regular;k++){const i=p.hand.indexOf(comp.color);if(i<0)throw Error('Descuadre de mano');g.discard.push(...p.hand.splice(i,1))}
 for(let k=0;k<comp.wild;k++){const i=p.hand.indexOf('wild');if(i<0)throw Error('Descuadre de comodines');g.discard.push(...p.hand.splice(i,1))}}
function awardRoute(g,seat,r,length=r.n,points=rulesFor(g).routePoints[length]){r.owner=seat;g.players[seat].trains-=length;g.players[seat].score+=points;event(g,'build',seat,{routeId:r.id})}
function block(g,r,seat){const rules=rulesFor(g).claim;return g.routes.some(x=>RouteClaim.blocksParallelRoute(r,x,{owner:x.owner,seat,playerCount:g.players.length},rules))}
// Temporary projection: keep persisted Europe rows/IDs and callers unchanged.
// Domain definitions contain no owners; ownership is passed separately by ID.
function decideClaim(g,seat,msg,r){
 const p=g.players[seat];
 const map={routes:g.routes.map(x=>({id:x.id,corridorId:x.corridorId,a:x.a,b:x.b,length:x.n,color:x.color,tunnel:x.tunnel,ferry:x.ferry}))};
 return RouteClaim.decideRouteClaim({seat,playerCount:g.players.length,hand:p.hand,trains:p.trains,
  owners:new Map(g.routes.map(x=>[x.id,x.owner]))},{routeId:r?.id,color:msg.color,wildCount:msg.wildCount},{map,rules:rulesFor(g).claim});
}
function action(g,seat,msg,{now=Date.now(),random=crypto.randomInt}={}){
 if(now<g.construction?.until)fail('Espera a que termine la construcción.');
 const previous=actionRandom.get(g);actionRandom.set(g,random);
 try{expire(g,now,random);const serial=g.turnSerial;Journal.within(g,{turn:serial,seat,now},()=>{applyAction(g,seat,msg,now);if(g.turnSerial!==serial&&g.players[seat])g.players[seat].missedTurns=0;recycleDiscards(g);recorded(g,seat,msg)});}
 finally{if(previous)actionRandom.set(g,previous);else actionRandom.delete(g)}
}
function settleOffer(g,seat,selection,finalize=true,now=Date.now()){
 const p=g.players[seat],decision=Destinations.decideOfferChoice(p,selection,{rules:rulesFor(g).destinations});
 if(!decision.ok)throw legacyError(decision.error);
 const {kept,returned}=decision.plan;const offer=p.offer;
 Journal.record(g,'tickets_kept',seat,{received:offer.tickets.length,kept:kept.length,discarded:returned.length,tickets:kept,offeredTickets:offer.tickets,discardedTickets:returned},{turn:offer.journalTurn});
 p.tickets.push(...kept);g.shortDeck.push(...returned);p.offer=null;journalMilestones(g,seat,offer.journalTurn);
 note(g,I18n.message`${p.name} conservó ${kept.length} billete(s) de destino.`,seat);
 if(finalize&&g.phase==='play'&&g.current===seat&&g.turnWaiting)startTurn(g,now);
 if(finalize&&g.phase==='closing'&&!g.players.some(p=>p.offer))finish(g);
}
function applyAction(g,seat,msg,now=Date.now()){return Journal.within(g,{turn:g.turnSerial,seat,now,automatic:expiring.has(g)},()=>{
 const value=applyActionImpl(g,seat,msg,now);if(expiring.has(g))recorded(g,seat,msg,true);return value;});}
function applyActionImpl(g,seat,msg,now=Date.now()){if(!msg||typeof msg.type!=='string'||!Number.isInteger(seat)||!g.players[seat])fail('Acción incorrecta.');const p=g.players[seat];
 if(g.phase==='finished')fail('La partida terminó.');
 if(tunnelBusy(g)||(g.phase==='tunnel'&&g.pending?.stage&&msg.type==='keep_tickets'))fail('Espera a que termine el túnel.');
 if(msg.type==='keep_tickets'){
  settleOffer(g,seat,{offerId:msg.offerId,indexes:msg.indexes},true,now);return;
 }
 if(g.phase==='closing')fail('Esperando las últimas elecciones de billetes.');
 if(g.phase==='initial'){
  if(msg.type!=='choose_initial')fail('Selecciona primero los billetes iniciales.');
  const decision=Destinations.decideInitialChoice(g,{seat,indexes:msg.indexes},{rules:rulesFor(g).destinations});
  if(!decision.ok)throw legacyError(decision.error);
  Journal.record(g,'initial',seat,{received:p.pending.length,kept:decision.plan.kept.length,discarded:p.pending.length-decision.plan.kept.length,tickets:decision.plan.kept,offeredTickets:p.pending,discardedTickets:p.pending.filter(t=>!decision.plan.kept.some(k=>k.id===t.id)),hand:p.hand,handCount:p.hand.length},{system:true});
  p.tickets.push(...decision.plan.kept);p.pending=[];g.initialDone=decision.plan.initialDone;
  if(decision.plan.startPlay){g.phase='play';g.current=g.first;note(g,'¡Partida iniciada!');startTurn(g,now)}
  return;
 }
 assertTurn(g,seat);
 if(g.turnWaiting)fail('Elige primero tus billetes pendientes. Después tendrás un turno completo.');
 if(g.phase==='tunnel'){
  const t=g.pending,decision=Tunnel.decideTunnel({tunnel:t,hand:p.hand},
   {type:msg.type==='pay_tunnel'?'pay':msg.type==='decline_tunnel'?'decline':null,wildCount:msg.extraWild,timeout:expiring.has(g)},
   {now,rules:rulesFor(g).tunnel});
  if(!decision.ok)throw legacyError(decision.error);
  const plan=decision.plan;
  if(plan.build){
   const r=requireRoute(g,t.routeId);
   for(const payment of plan.payments)spend(g,p,payment);
   awardRoute(g,seat,r);note(g,I18n.message`${p.name} completó el túnel ${cityName(g,r.a)} — ${cityName(g,r.b)}.`,seat);
  }else note(g,I18n.message`${p.name} desistió del túnel.`,seat);
  g.discard.push(...t.revealed);
  Journal.record(g,'tunnel_result',seat,{routeId:t.routeId,outcome:plan.build?'built':'declined',reason:plan.pendingChanges.reason,extra:plan.pendingChanges.extra||null,points:plan.build?rulesFor(g).routePoints[requireRoute(g,t.routeId).n]:0});
  if(plan.build)journalMilestones(g,seat);
  if(!expiring.has(g))p.missedTurns=0;Object.assign(t,plan.pendingChanges);g.turnDeadline=null;
  return;
 }
 if(g.phase!=='play')fail('Estado de partida incorrecto.');
 if(msg.type==='draw_train'){
  const decision=TrainCards.decideTrainDraw(g,{index:msg.index},cardContext(g));
  if(!decision.ok)throw legacyError(decision.error);
  const plan=decision.plan,c=plan.card;applyCardPiles(g,plan,false);p.hand.push(c);g.drawCount=plan.drawCount;
  // Store the accepted draw once. Views redact blind colors for every other seat.
  g.drawSerial=(g.drawSerial||0)+1;
  g.lastDraw={id:g.drawSerial,seat,index:msg.index,color:c};
  event(g,'draw',seat,{index:msg.index,color:c});
  for(const fact of plan.sequence)Journal.record(g,fact.type,seat,{...fact.data,drawNumber:plan.drawCount,endsTurn:plan.endTurn});
  if(!g.deck.length&&!g.discard.length)Journal.record(g,'deck_empty',seat);
  note(g,I18n.message`${p.name} robó una carta de tren.`,seat,{draw:{index:msg.index,color:c}});
  if(plan.refresh)noteMarketRefresh(g,plan.refresh,false);
  if(plan.endTurn)next(g,now);return;
 }
 if(g.drawCount>0)fail('Debes terminar de robar cartas.');
 if(msg.type==='claim'){
  const r=routeById(g,msg.routeId),decision=decideClaim(g,seat,msg,r);
  if(!decision.ok)throw legacyError(decision.error);
  const {payment:base,length,points,kind}=decision.plan,color=base.color;
  if(kind==='build'){spend(g,p,base);awardRoute(g,seat,r,length,points);Journal.record(g,'build',seat,{routeId:r.id,a:r.a,b:r.b,points,payment:base});journalMilestones(g,seat);note(g,I18n.message`${p.name} tomó ${cityName(g,r.a)} — ${cityName(g,r.b)} (+${points}).`,seat);next(g,now);return}
  const revealed=[];for(let i=0;i<3;i++){const c=draw(g);if(c)revealed.push(c)}
  g.phase='tunnel';g.pending=Tunnel.beginTunnel({routeId:r.id,base,revealed,turnDeadline:g.turnDeadline,
   offerDeadlines:g.players.map(player=>player.offer?player.offer.deadline:null)},{now,rules:rulesFor(g).tunnel});
  g.turnDeadline=null;
  event(g,'tunnel_reveal',seat,{routeId:r.id,paymentColor:color,base:{...base},surcharge:g.pending.surcharge,revealed:[...revealed]});
  g.pending.revealId=g.eventSerial;
  Journal.record(g,'tunnel',seat,{routeId:r.id,a:r.a,b:r.b,base,revealed,surcharge:g.pending.surcharge});
  // The room clock advances the shared reveal, including zero-surcharge tunnels.
  return;
 }
 if(msg.type==='draw_tickets'){
  const decision=Destinations.planOffer({offer:p.offer,shortDeck:g.shortDeck,offerSerial:g.offerSerial,turnDeadline:g.turnDeadline},{now,rules:destinationRules(g)});
  if(!decision.ok)throw legacyError(decision.error);
  p.offer={...decision.plan.offer,journalTurn:g.turnSerial};g.offerSerial=p.offer.id;
  Journal.record(g,'tickets_offer',seat,{received:p.offer.tickets.length,tickets:p.offer.tickets});g.shortDeck.splice(0,decision.plan.takeCount);
  event(g,'tickets',seat);note(g,I18n.message`${p.name} está eligiendo nuevos billetes.`,seat);next(g,now);return;
 }
 if(msg.type==='station'){
  const decision=Stations.decideStation(stationState(g,seat),{cityId:msg.city,color:msg.color,wildCount:msg.wildCount},stationContext(g));
  if(!decision.ok)throw legacyError(decision.error);
  const {cityId,payment}=decision.plan;
  spend(g,p,payment);p.stations--;p.placed.push(cityId);
  Journal.record(g,'station',seat,{city:cityId,payment});journalMilestones(g,seat);event(g,'build',seat,{city:cityId});note(g,I18n.message`${p.name} construyó una estación en ${cityName(g,cityId)}.`,seat);next(g,now);return;
 }
 if(msg.type==='pass'){
  // Passing is only permitted when no other move is possible.
  if(canDrawMore(g)||(!p.offer&&g.shortDeck.length)||possibleClaim(g,seat)||possibleStation(g,seat))fail('Todavía puedes realizar una acción.');
  Journal.record(g,'pass',seat);next(g,now);return;
 }
 fail('Acción no reconocida.');
}
// Absolute deadlines survive refresh/reconnection. Tick once per current turn;
// a server restart never fast-forwards an entire absent game's turns.
function expire(g,now=Date.now(),random=randomFor(g)){const previous=actionRandom.get(g);actionRandom.set(g,random);expiring.add(g);try{return Journal.within(g,{turn:g.turnSerial,seat:g.current,now,automatic:true},()=>expireImpl(g,now,random))}finally{expiring.delete(g);if(previous)actionRandom.set(g,previous);else actionRandom.delete(g)}}
function expireImpl(g,now=Date.now(),random=crypto.randomInt){
 if(now<g.construction?.until)return false;
 normalize(g,now);let changed=false;
 if(g.phase==='tunnel'&&g.pending?.stage){
  const t=g.pending,seat=g.current,p=g.players[seat],plan=Tunnel.advanceTunnel({tunnel:t,turnDeadline:g.turnDeadline},{now,rules:rulesFor(g).tunnel});
  if(plan.kind==='decision'||plan.kind==='build'){
   if(plan.kind==='decision'){Object.assign(t,plan.pendingChanges);g.turnDeadline=plan.turnDeadline;}
   else {
    const r=requireRoute(g,t.routeId);for(const payment of plan.payments)spend(g,p,payment);g.discard.push(...t.revealed);recycleDiscards(g);
    p.missedTurns=0;awardRoute(g,seat,r);
    note(g,I18n.message`${p.name} tomó túnel ${cityName(g,r.a)} — ${cityName(g,r.b)} (+${rulesFor(g).routePoints[r.n]}).`,seat);
    Object.assign(t,plan.pendingChanges);
    Journal.record(g,'tunnel_result',seat,{routeId:t.routeId,outcome:'built',extra:t.extra,points:rulesFor(g).routePoints[r.n]},{actor:g.journalRoom?.members?.[seat]?.actor||'player'});journalMilestones(g,seat);
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
 for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer&&now>=offer.deadline){const indexes=Destinations.randomSelection(offer.tickets,rulesFor(g).destinations.offerMinimum,{random});settleOffer(g,seat,{offerId:offer.id,indexes},true,now);recorded(g,seat,{type:"keep_tickets",offerId:offer.id,indexes},true);changed=true}}
 if(['finished','closing'].includes(g.phase)||!Number.isFinite(g.turnDeadline)||now<g.turnDeadline)return changed;
 const seat=g.current,serial=g.turnSerial;
 if(g.phase==='initial'){
  for(let i=0;i<g.players.length;i++){
   if(!g.players[i].pending.length)continue;
   const picked=Destinations.randomSelection(g.players[i].pending,rulesFor(g).destinations.initialMinimum,{random});
   note(g,I18n.message`${g.players[i].name}: tiempo agotado; conservó 2 billetes al azar.`,i);
   applyAction(g,i,{type:'choose_initial',indexes:picked},now);
  }
  return true;
 }
 Journal.record(g,'timeout',seat);
 note(g,I18n.message`${g.players[seat].name}: tiempo agotado.`,seat);
 g.players[seat].missedTurns=(g.players[seat].missedTurns||0)+1;
 if(g.phase==='tunnel')applyAction(g,seat,{type:'decline_tunnel'},now);
 else{
  const remaining=rulesFor(g).trainCards.drawsPerTurn-g.drawCount;
  for(let i=0;i<remaining&&g.turnSerial===serial&&g.phase==='play';i++){
   if(!g.deck.length&&!g.discard.length)break;
   applyAction(g,seat,{type:'draw_train',index:-1},now);
  }
  if(g.turnSerial===serial&&g.phase==='play')next(g,now);
 }
 recycleDiscards(g);return true;
}
function possibleClaim(g,seat){
 const p=g.players[seat],rules=rulesFor(g).claim;
 return g.routes.some(r=>r.owner===null&&!block(g,r,seat)&&r.n<=p.trains&&
  (r.color==='gray'?[...rules.colors,'wild']:[r.color,'wild']).some(color=>
   Payment.planPayment(p.hand,{color,quantity:r.n,wildNeeded:r.ferry},rules)));
}
function stationState(g,seat){return {hand:g.players[seat].hand,remainingStations:g.players[seat].stations,occupiedCities:new Set(g.players.flatMap(p=>p.placed))}}
function possibleStation(g,seat){return Stations.canBuildStation(stationState(g,seat),stationContext(g))}
const connected=Network.connected,connectionPath=Network.connectionPath;
function stationAssignments(g,seat){const {map,owners}=LegacyScoring.projectBoard(g);return Stations.assignStations({...LegacyScoring.projectPlayer(g.players[seat]),seat,owners},{map})}
function longestTrail(g,seat){return Network.longestTrail(g.routes.filter(r=>r.owner===seat).map(r=>({id:r.id,a:r.a,b:r.b,length:r.n})))}
function longest(g,seat){return longestTrail(g,seat).length}
function finish(g,force=false,{random=randomFor(g)}={}){
 contextFor(g);
 if(force)for(let seat=0;seat<g.players.length;seat++){const offer=g.players[seat].offer;if(offer)settleOffer(g,seat,{offerId:offer.id,indexes:Destinations.randomSelection(offer.tickets,rulesFor(g).destinations.offerMinimum,{random})},false)}
 g.turnDeadline=null;g.turnWaiting=false;
 if(g.players.some(p=>p.offer)){g.phase='closing';return}
 g.phase='finished';const {map,owners}=LegacyScoring.projectBoard(g),state={owners,players:g.players.map(LegacyScoring.projectPlayer)};
 g.result=Scoring.scoreMatch(state,{map,rules:rulesFor(g).scoring}).map(result=>LegacyScoring.legacyResult(result,g.players[result.seat]));
 note(g,'Partida finalizada. ¡Resultados calculados!')}
const destinationDetails=createDestinationDetails(),liveScore=createLiveScore();
function journalMilestones(g,actorSeat,turn) {
 if(!Journal.enabled(g))return;
 const progress=g.players.map((_,seat)=>destinationDetails(g,seat).progress.filter(t=>t.completed).map(t=>t.id));
 const old=g.journalProgress||g.players.map(()=>[]);
 progress.forEach((ids,seat)=>{
  const added=ids.filter(id=>!old[seat]?.includes(id)),removed=(old[seat]||[]).filter(id=>!ids.includes(id));
  if(added.length||removed.length)Journal.record(g,'destinations',actorSeat,{privateSeat:seat,completed:added,pending:removed},{turn});
 });
 g.journalProgress=progress;
 const leaders=liveScore(g,-1,rulesFor(g).scoring,destinationDetails).players.flatMap((p,i)=>p.bonus?[i]:[]);
 if(JSON.stringify(leaders)!==JSON.stringify(g.journalLeaders||[]))Journal.record(g,'longest',actorSeat,{leaders,points:rulesFor(g).scoring.expressPoints},{turn});
 g.journalLeaders=leaders;
}
function view(g,seat,{now=Date.now()}={}){
 if(!Number.isInteger(seat)||seat < -1||seat>=g.players.length)throw new RangeError('Puesto inválido.');
 const context=contextFor(g);
 return MatchView.projectMatch(g,seat,{now,tunnelCardMs:context.rules.tunnel.cardMs,destinationDetails,
  scoreProgress:liveScore(g,seat,context.rules.scoring,destinationDetails),
  turnHistory:Journal.project(g,seat),
  references:{mapRef:context.mapRef,rulesRef:context.rulesRef}});
}
const definition=g=>projectDefinition(contextFor(g));
return {contextFor,definition,restoreState,routeById,observe,newGame,newRandomGame,note,historyEntryView,action,view,connected,connectionPath,longest,stationAssignments,finish,pay,block,draw,refill,recycleDiscards,next,ensureTiming,normalize,expire,deadlines,tunnelBusy,TURN_MS,INITIAL_MS,OFFER_MS,TUNNEL_CARD_MS,TUNNEL_RESULT_MS,SCORE,ROUTES,TICKETS,CITIES,COLORS,possibleClaim,possibleStation};
}
module.exports={...createEngine(),createEngine};
