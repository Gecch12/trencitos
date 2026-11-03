"use strict";
const {longestTrail} = require('../domain/network');

function createLiveScore() {
  const cache = new WeakMap();
  return function score(game, seat, rules, destinationDetails) {
    let entry=cache.get(game);
    if(!entry){entry={networks:[]};cache.set(game,entry);}
    entry.lengths=game.players.map((_,seat)=>{
      const routes=game.routes.filter(r=>r.owner===seat),key=JSON.stringify(routes.map(r=>[r.id,r.a,r.b,r.n]));
      let network=entry.networks[seat];
      if(!network||network.key!==key)entry.networks[seat]=network={key,length:longestTrail(routes.map(r=>({...r,length:r.n}))).length};
      return network.length;
    });
    const maximum=Math.max(...entry.lengths);
    entry.leaders=maximum>0?entry.lengths.flatMap((n,i)=>n===maximum?[i]:[]):[];
    const players=game.players.map((p,i)=>({longest:entry.lengths[i],bonus:entry.leaders.includes(i)?rules.expressPoints:0,
      visible:p.score+(entry.leaders.includes(i)?rules.expressPoints:0)}));
    let own=null;
    if (seat>=0) {
      const p=game.players[seat],completed=new Set(destinationDetails(game,seat).progress.filter(t=>t.completed).map(t=>t.id));
      const completedPoints=p.tickets.reduce((n,t)=>n+(completed.has(t.id)?t.p:0),0);
      const pendingPoints=p.tickets.reduce((n,t)=>n+(completed.has(t.id)?0:t.p),0);
      const stations=p.stations*rules.unusedStationPoints;
      const closingBonus=entry.lengths.every(n=>n===0)?rules.expressPoints:players[seat].bonus;
      own={route:p.score,completedPoints,pendingPoints,stations,bonus:players[seat].bonus,
        score:players[seat].visible+completedPoints,closingBonus,projected:p.score+closingBonus+completedPoints-pendingPoints+stations};
    }
    return {players,own};
  };
}
module.exports={createLiveScore};
