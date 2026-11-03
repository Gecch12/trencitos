"use strict";
const { longestTrail } = require('../domain/network');

// Read-only analysis of recorded outcomes. Destination completion comes from the
// stored authorized view (including its historical station assignment), never a
// new simulation. Cached trails use the same domain definition as final scoring.
function createReplayAnalysis({ full }) {
  const trails = new Map(); let prior = null, lastEvent = 0;
  return function analyze(state) {
    const view = state.views?.[0];
    if (!view?.players || !view.routes) return { available:false, players:[], milestones:[] };
    const lengths=view.players.map((_,seat)=>{
      const own=view.routes.filter(r=>r.owner===seat),key=JSON.stringify(own.map(r=>[r.id,r.a,r.b,r.n]));
      if(!trails.has(key))trails.set(key,longestTrail(own.map(r=>({...r,length:r.n}))).length);
      return trails.get(key);
    }),maximum=Math.max(...lengths),leaders=maximum>0?lengths.flatMap((n,i)=>n===maximum?[i]:[]):[];
    const scoring=state.definition?.rules?.scoring;
    const players=view.players.map((p,seat)=>{
      const privateView=full?state.views[seat+1]:null,progress=privateView?.ticketProgress;
      const known=Array.isArray(progress)&&Array.isArray(privateView?.tickets)&&progress.length===privateView.tickets.length;
      const done=known?new Set(progress.filter(t=>t.completed).map(t=>t.id)):null;
      const completedPoints=known?privateView.tickets.reduce((sum,t)=>sum+(done.has(t.id)?t.p:0),0):null;
      const pendingPoints=known?privateView.tickets.reduce((sum,t)=>sum+(done.has(t.id)?0:t.p),0):null;
      const provisionalBonus=scoring?(lengths[seat]===maximum?scoring.expressPoints:0):null;
      return {seat,routePoints:p.score,routes:view.routes.filter(r=>r.owner===seat).length,trains:p.trains,stations:p.stations,
        cards:p.handCount,tickets:p.ticketsCount,longest:lengths[seat],leader:leaders.includes(seat),
        ...(full?{completed:done?.size??null,completedPoints,pendingPoints,
          projectedScore:known&&scoring?p.score+completedPoints-pendingPoints+p.stations*scoring.unusedStationPoints+provisionalBonus:null,
          provisionalBonus}:{}),...(done?{completedIds:[...done]}:{})};
    });
    const milestones=[];
    for(const event of view.events||[]){
      if(event.id<=lastEvent)continue;
      if(event.type==='build')milestones.push({type:event.routeId===undefined?'station':'construction',seat:event.seat,...(event.routeId===undefined?{city:event.city}:{routeId:event.routeId})});
    }
    lastEvent=Math.max(lastEvent,...(view.events||[]).map(e=>e.id));
    if(prior){
      if(JSON.stringify(prior.leaders)!==JSON.stringify(leaders)&&leaders.length)milestones.push({type:leaders.length>1?'longest_tie':'longest_leader',seats:leaders});
      if(full)for(const p of players){const before=new Set(prior.players[p.seat].completedIds||[]);for(const id of p.completedIds||[])if(!before.has(id))milestones.push({type:'ticket_completed',seat:p.seat,ticketId:id});}
      if(prior.finalRemaining==null&&view.finalRemaining!=null)milestones.push({type:'last_round'});
      if(prior.phase!=='finished'&&view.phase==='finished')milestones.push({type:'finish'});
      if(view.sharedTunnel?.stage==='result'&&view.sharedTunnel.outcome==='declined'&&prior.tunnelId!==view.sharedTunnel.id)milestones.push({type:'tunnel_abandoned',seat:view.sharedTunnel.seat,routeId:view.sharedTunnel.routeId});
    }
    prior={players,leaders,phase:view.phase,finalRemaining:view.finalRemaining,tunnelId:view.sharedTunnel?.stage==='result'?view.sharedTunnel.id:null};
    return {available:true,players:players.map(({completedIds,...p})=>p),leaders,maximum,milestones};
  };
}
module.exports={createReplayAnalysis};
