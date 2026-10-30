'use strict';
const crypto=require('node:crypto');
const {COLORS,PLAYER_COLORS,CITIES,ROUTES,TICKETS}=require('./data');
const SCORE={1:1,2:2,3:4,4:7,6:15,8:21};
function shuffle(xs){let a=[...xs];for(let i=a.length-1;i>0;i--){let j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function fail(message){throw new Error(message)}
const same=(x,y)=>x.a===y.a&&x.b===y.b||x.a===y.b&&x.b===y.a;
function draw(g){if(!g.deck.length&&g.discard.length){g.deck=shuffle(g.discard);g.discard=[]}return g.deck.pop()||null}
function refill(g){let guard=0;while(g.face.length<5){const c=draw(g);if(!c)break;g.face.push(c)}while(g.face.length===5&&g.face.filter(c=>c==='wild').length>=3&&guard++<20){g.discard.push(...g.face);g.face=[];while(g.face.length<5){let c=draw(g);if(!c)break;g.face.push(c)}}}
function newGame(names,first=0){if(!Array.isArray(names)||names.length<2||names.length>5)fail('Se requieren 2–5 jugadores.');
 if(!Number.isInteger(first)||first<0||first>=names.length)fail('Primer jugador inválido.');
 let g={phase:'initial',current:first,first,initialDone:0,players:names.map((name,i)=>({name:String(name).slice(0,24),color:PLAYER_COLORS[i],hand:[],tickets:[],pending:[],trains:45,stations:3,placed:[],score:0})),routes:ROUTES.map(r=>({...r,owner:null})),deck:shuffle(COLORS.flatMap(x=>Array(12).fill(x)).concat(Array(14).fill('wild'))),discard:[],face:[],shortDeck:shuffle(TICKETS.filter(x=>!x.long)),finalRemaining:null,lastTrigger:null,drawCount:0,pending:null,logs:[],result:null};
 const long=shuffle(TICKETS.filter(x=>x.long));
 g.players.forEach(p=>{for(let j=0;j<4;j++)p.hand.push(draw(g));p.pending=[long.pop(),...g.shortDeck.splice(0,3)]});
 refill(g);return g}
function note(g,msg){g.logs.unshift(msg);g.logs=g.logs.slice(0,25)}
function assertTurn(g,seat){if(!Number.isInteger(seat)||seat!==g.current)fail('No es tu turno.')}
function next(g){g.drawCount=0;g.pending=null;
 if(g.finalRemaining!==null){g.finalRemaining--;if(g.finalRemaining===0){finish(g);return}}
 else if(g.players[g.current].trains<=2){g.lastTrigger=g.current;g.finalRemaining=g.players.length;note(g,'¡Última ronda! Todos tienen un turno final, incluido quien la activó.')}
 g.current=(g.current+1)%g.players.length}
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
function action(g,seat,msg){if(!msg||typeof msg.type!=='string')fail('Acción incorrecta.');assertTurn(g,seat);const p=g.players[seat];
 if(g.phase==='initial'){
  if(msg.type!=='choose_initial')fail('Selecciona primero los billetes iniciales.');
  const ix=indices(msg.indexes,p.pending.length,2);p.tickets.push(...ix.map(i=>p.pending[i]));p.pending=[];
  g.initialDone++;if(g.initialDone===g.players.length){g.phase='play';g.current=g.first;note(g,'¡Partida iniciada!')}else g.current=(seat+1)%g.players.length;
  return;
 }
 if(g.phase==='finished')fail('La partida terminó.');
 if(g.phase==='tickets'){
  if(msg.type!=='keep_tickets')fail('Debes elegir tus billetes.');
  const ix=indices(msg.indexes,g.pending.tickets.length,1);p.tickets.push(...ix.map(i=>g.pending.tickets[i]));
  const rejected=g.pending.tickets.filter((_,i)=>!ix.includes(i));g.shortDeck.push(...rejected);
  g.phase='play';next(g);return;
 }
 if(g.phase==='tunnel'){
  if(!['pay_tunnel','decline_tunnel'].includes(msg.type))fail('Resuelve el túnel antes de continuar.');
  const t=g.pending;let base=t.base;
  if(msg.type==='pay_tunnel'){
   const extra=pay(p.hand,t.color,t.surcharge,0,msg.extraWild);
   // The payment for base and extra must be collectively affordable.
   const avail={...p,hand:[...p.hand]};
   if(!extra || !reserve(avail.hand,base) || !pay(avail.hand,t.color,t.surcharge,0,msg.extraWild))fail('No tienes suficientes cartas para pagar el túnel.');
   spend(g,p,base);spend(g,p,extra);
   const r=g.routes[t.routeId];r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];note(g,`${p.name} completó el túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]}.`);
  }else note(g,`${p.name} desistió del túnel.`);
  g.discard.push(...t.revealed);g.phase='play';next(g);return;
 }
 if(g.phase!=='play')fail('Estado de partida incorrecto.');
 if(msg.type==='draw_train'){
  if(!Number.isInteger(msg.index)||msg.index < -1||msg.index>=g.face.length)fail('Carta inexistente.');
  let c=msg.index===-1?draw(g):g.face[msg.index];if(!c)fail('No hay cartas disponibles.');
  if(msg.index>=0&&c==='wild'&&g.drawCount>0)fail('No se permite tomar una locomotora visible como segunda carta.');
  if(msg.index>=0){g.face.splice(msg.index,1);refill(g)}p.hand.push(c);g.drawCount++;
  note(g,`${p.name} robó una carta de tren.`);
  if((msg.index>=0&&c==='wild')||g.drawCount===2||!canDrawMore(g))next(g);return;
 }
 if(g.drawCount>0)fail('Debes terminar de robar cartas.');
 if(msg.type==='claim'){
  const r=g.routes[msg.routeId];if(!r||r.owner!==null||block(g,r,seat))fail('Esta ruta ya no está disponible.');
  if(p.trains<r.n)fail('Te faltan vagones.');
  const color=msg.color==='wild'?'wild':r.color==='gray'?msg.color:r.color;
  if(![...COLORS,'wild'].includes(color))fail('Color inválido.');
  const base=pay(p.hand,color,r.n,r.ferry,msg.wildCount);
  if(!base||base.wild<r.ferry)fail('No tienes cartas para esa ruta.');
  if(!r.tunnel){spend(g,p,base);r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];note(g,`${p.name} tomó ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${SCORE[r.n]}).`);next(g);return}
  const revealed=[];for(let i=0;i<3;i++){const c=draw(g);if(c)revealed.push(c)}
  const surcharge=revealed.filter(c=>c==='wild'||(color!=='wild'&&c===color)).length;
  g.phase='tunnel';g.pending={routeId:r.id,color,base,surcharge,revealed};
  // Keep revealed until decision. A 0-surcharge tunnel succeeds automatically.
  if(surcharge===0){spend(g,p,base);g.discard.push(...revealed);r.owner=seat;p.trains-=r.n;p.score+=SCORE[r.n];g.phase='play';note(g,`${p.name} tomó túnel ${CITIES[r.a][2]} — ${CITIES[r.b][2]} (+${SCORE[r.n]}).`);next(g)}
  return;
 }
 if(msg.type==='draw_tickets'){
  if(!g.shortDeck.length)fail('No quedan billetes de destino.');
  const tickets=g.shortDeck.splice(0,3);g.phase='tickets';g.pending={tickets};return;
 }
 if(msg.type==='station'){
  if(!CITIES[msg.city]||p.stations<1||g.players.some(x=>x.placed.includes(msg.city)))fail('No puedes construir una estación ahí.');
  const cost=4-p.stations,comp=pay(p.hand,msg.color,cost,0,msg.wildCount);
  if(!comp)fail('Cartas insuficientes para la estación.');
  spend(g,p,comp);p.stations--;p.placed.push(msg.city);note(g,`${p.name} construyó una estación en ${CITIES[msg.city][2]}.`);next(g);return;
 }
 if(msg.type==='pass'){
  // Passing is only permitted when no other move is possible.
  if(canDrawMore(g)||g.shortDeck.length||possibleClaim(g,seat)||possibleStation(g,seat))fail('Todavía puedes realizar una acción.');
  next(g);return;
 }
 fail('Acción no reconocida.');
}
function reserve(hand,comp){for(let i=0;i<comp.regular;i++){let j=hand.indexOf(comp.color);if(j<0)return false;hand.splice(j,1)}for(let i=0;i<comp.wild;i++){let j=hand.indexOf('wild');if(j<0)return false;hand.splice(j,1)}return true}
function indices(xs,n,min){if(!Array.isArray(xs)||xs.length<min||xs.length>n||new Set(xs).size!==xs.length||xs.some(x=>!Number.isInteger(x)||x<0||x>=n))fail('Selección de billetes inválida.');return xs}
function possibleClaim(g,seat){const p=g.players[seat];return g.routes.some(r=>r.owner===null&&!block(g,r,seat)&&r.n<=p.trains&&[...COLORS,'wild'].some(c=>pay(p.hand,c,r.n,r.ferry))&&(r.color==='gray'||[r.color,'wild'].some(c=>pay(p.hand,c,r.n,r.ferry))))}
function possibleStation(g,seat){const p=g.players[seat];return p.stations>0&&Object.keys(CITIES).some(city=>!g.players.some(x=>x.placed.includes(city)))&&[...COLORS,'wild'].some(c=>pay(p.hand,c,4-p.stations))}
function connected(owned,a,b){const adj=new Map();for(let r of owned){if(!adj.has(r.a))adj.set(r.a,[]);if(!adj.has(r.b))adj.set(r.b,[]);adj.get(r.a).push(r.b);adj.get(r.b).push(r.a)}const seen=new Set([a]),stack=[a];while(stack.length){let x=stack.pop();if(x===b)return true;for(let next of adj.get(x)||[])if(!seen.has(next)){seen.add(next);stack.push(next)}}return false}
function stationAssignments(g,seat){const p=g.players[seat],own=g.routes.filter(r=>r.owner===seat);const options=p.placed.map(city=>[null,...g.routes.filter(r=>r.owner!==null&&r.owner!==seat&&(r.a===city||r.b===city))]);let best={tickets:p.tickets.map(t=>connected(own,t.a,t.b)),completed:0,score:-Infinity,assigned:[]};
 function walk(i,chosen){if(i===options.length){const all=[...own,...chosen.filter(Boolean)];const outcomes=p.tickets.map(t=>connected(all,t.a,t.b));const pts=p.tickets.reduce((v,t,j)=>v+(outcomes[j]?t.p:-t.p),0);if(pts>best.score){best={tickets:outcomes,completed:outcomes.filter(Boolean).length,score:pts,assigned:chosen.map(r=>r?r.id:null)}}return}for(const r of options[i])walk(i+1,[...chosen,r])}
 walk(0,[]);return best}
function longest(g,seat){const e=g.routes.filter(r=>r.owner===seat),adj={};e.forEach((r,i)=>{(adj[r.a]??=[]).push(i);(adj[r.b]??=[]).push(i)});let best=0;
 function walk(node,used,len){best=Math.max(best,len);for(let id of adj[node]||[]){let mask=1n<<BigInt(id);if(!(used&mask)){let r=e[id];walk(r.a===node?r.b:r.a,used|mask,len+r.n)}}}
 for(let x of Object.keys(adj))walk(x,0n,0);return best}
function finish(g){g.phase='finished';const lengths=g.players.map((_,i)=>longest(g,i)),max=Math.max(...lengths);
 g.result=g.players.map((p,i)=>{let v=stationAssignments(g,i);let express=lengths[i]===max?10:0;return {seat:i,name:p.name,route:p.score,destination:v.score,completed:v.completed,stations:p.stations*4,express,longest:lengths[i],stationRoutes:v.assigned,individualTickets:v.tickets,tickets:p.tickets,score:p.score+v.score+p.stations*4+express}});
 g.result.sort((a,b)=>b.score-a.score||b.completed-a.completed||b.stations-a.stations||b.express-a.express);
 let win=g.result[0];g.result.forEach(x=>{x.winner=x.score===win.score&&x.completed===win.completed&&x.stations===win.stations&&x.express===win.express});note(g,'Partida finalizada. ¡Resultados calculados!')}
function view(g,seat){let p=g.players[seat];const own=seat===g.current;return {phase:g.phase,current:g.current,seat,players:g.players.map((x,i)=>({name:x.name,color:x.color,trains:x.trains,stations:x.stations,score:x.score,placed:x.placed,handCount:x.hand.length,ticketsCount:x.tickets.length})),routes:g.routes,face:g.face,deckCount:g.deck.length,discardCount:g.discard.length,ticketDeckCount:g.shortDeck.length,hand:p.hand,tickets:p.tickets,drawCount:own?g.drawCount:0,initial:own&&g.phase==='initial'?p.pending:null,pending:own&&g.phase==='tickets'?g.pending.tickets:null,tunnel:own&&g.phase==='tunnel'?g.pending:null,finalRemaining:g.finalRemaining,logs:g.logs,result:g.phase==='finished'?g.result:null}}
module.exports={newGame,action,view,connected,longest,stationAssignments,finish,pay,block,draw,refill,next,SCORE,ROUTES,TICKETS,CITIES,COLORS,possibleClaim,possibleStation};
