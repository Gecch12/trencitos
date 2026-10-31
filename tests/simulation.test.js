const test=require('node:test'),assert=require('node:assert/strict'),E=require('../engine');
function play(n){let g=E.newGame(Array.from({length:n},(_,i)=>'J'+i));for(let i=0;i<n;i++)E.action(g,i,{type:'choose_initial',indexes:[0,1]});let turns=0;
 while(g.phase!=='finished'&&turns++<1500){let seat=g.current,p=g.players[seat];
 if(g.phase==='tunnel'){try{E.action(g,seat,{type:'pay_tunnel',extraWild:g.pending.surcharge})}catch{E.action(g,seat,{type:'decline_tunnel'})}continue}
 const choosing=g.players.findIndex(p=>p.offer);if(choosing>=0){E.action(g,choosing,{type:'keep_tickets',offerId:g.players[choosing].offer.id,indexes:[0]});continue}
 const options=g.routes.filter(r=>r.owner===null&&!E.block(g,r,seat)&&p.trains>=r.n);
 let choice=null;
 for(let r of options){for(let color of r.color==='gray'?[...E.COLORS,'wild']:[r.color,'wild']){let payment=E.pay(p.hand,color,r.n,r.ferry);if(payment){choice={r,color,payment};break}}if(choice)break}
 if(choice&&g.drawCount===0){E.action(g,seat,{type:'claim',routeId:choice.r.id,color:choice.color,wildCount:choice.payment.wild});continue}
 if(g.deck.length||g.discard.length||g.face.length){let index=g.deck.length+g.discard.length?-1:g.face.findIndex(c=>g.drawCount===0||c!=='wild');if(index>=-1&&!(index===-1&&!g.deck.length&&!g.discard.length)){E.action(g,seat,{type:'draw_train',index});continue}}
 if(g.shortDeck.length){E.action(g,seat,{type:'draw_tickets'});continue}
 if(E.possibleStation(g,seat)){for(let c of [...E.COLORS,'wild']){let x=E.pay(p.hand,c,4-p.stations);if(x){let city=Object.keys(E.CITIES).find(city=>!g.players.some(p=>p.placed.includes(city)));E.action(g,seat,{type:'station',city,color:c,wildCount:x.wild});break}}continue}
 E.action(g,seat,{type:'pass'});
 }
 return {finished:g.phase==='finished',turns,game:g};}
for(const n of [2,3,4,5])test(`automated full-game smoke ${n} players, scoring and train conservation`,()=>{for(let run=0;run<3;run++){let x=play(n);assert.ok(x.finished,`${n} players stalled after ${x.turns} turns, phase=${x.game.phase}`);assert.equal(x.game.result.length,n);for(let p of x.game.players){assert.ok(p.trains>=0);assert.ok(p.trains<=45);assert.ok(p.stations>=0&&p.stations<=3)}for(let r of x.game.routes)assert.ok(r.owner===null||r.owner>=0&&r.owner<n);assert.equal(x.game.deck.length+x.game.discard.length+x.game.face.length+x.game.players.flatMap(p=>p.hand).length,110);}});
