"use strict";
const {construction}=require('../../shared/game-timing');
// Called once for a newly accepted build, before recording/publication. Tunnel
// results already pause every clock; their existing interval includes this cue.
function pauseForConstruction(game,event,now){
 if(!event||event.type!=='build'||game.construction?.id===event.id)return;
 const duration=construction.focusMs+construction.flightMs+construction.holdMs;
 game.construction={id:event.id,seat:event.seat,startedAt:now,until:now+duration,...(event.routeId===undefined?{city:event.city}:{routeId:event.routeId})};
 if(game.phase==='tunnel'&&game.pending?.stage==='result')return;
 if(Number.isFinite(game.turnDeadline))game.turnDeadline+=duration;
 for(const p of game.players)if(Number.isFinite(p.offer?.deadline))p.offer.deadline+=duration;
}
module.exports={pauseForConstruction};
