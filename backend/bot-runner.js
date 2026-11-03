"use strict";
const {createLegacyAutomaticPlay}=require('../game/compat/legacy-automatic-play');
function createBotRunner({planner,dispatch,automaticPlay,stageRoom,engine,schedule,active=()=>true,onError=()=>{}}){
 const pending=new WeakSet();
 return async function run(room,method,eligible){
  if(pending.has(room)||!active()||!eligible())return;
  pending.add(room);
  const fingerprint=JSON.stringify(room.game),game=JSON.parse(fingerprint);
  const seats=method==='playPermanentBots'?automaticPlay.permanentSeats(room):method==='playReplacement'?[game.current]:
   game.phase==='initial'?room.members.flatMap((m,i)=>m.bot&&game.players[i].pending.length?[i]:[]):
   game.phase!=='tunnel'&&game.players.some((p,i)=>room.members[i].bot&&p.offer)?room.members.flatMap((m,i)=>m.bot&&game.players[i].offer?[i]:[]):[game.current];
  try{
   const actions=new Map(await planner.plan(game,seats,{replacement:method==='playReplacement'}));
   await dispatch(()=>{
    if(!active()||!eligible()||JSON.stringify(room.game)!==fingerprint)return;
    const choose=(g,seat)=>{if(!actions.has(seat))throw Error('Unplanned bot seat');return actions.get(seat);};
    createLegacyAutomaticPlay({stageRoom,engine,policies:{chooseBotAction:choose,chooseReplacementAction:choose}})[method](room);
   });
  }catch(error){onError(error);}
  finally{pending.delete(room);if(active()&&eligible())schedule(room);}
 };
}
module.exports={createBotRunner};
