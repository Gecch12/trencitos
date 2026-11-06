"use strict";
// Presentation plans use recorded score details. Never recalculate a result.
const ScoreRecount=(()=>{
 function connectedOrder(routes){
  const remaining=new Map(routes.map(r=>[r.id,r])),ordered=[];
  function visit(r){remaining.delete(r.id);ordered.push(r);for(const city of [r.b,r.a])for(const next of [...remaining.values()])if(remaining.has(next.id)&&(next.a===city||next.b===city))visit(next);}
  while(remaining.size)visit(remaining.values().next().value);return ordered;
 }
 function plan(result,category,routes){
  const d=result.details;
  const total=result[{routes:'route',express:'longest',destinations:'destination',stations:'stations'}[category]]??null;
  const bonus=category==='express'?(result.express??null):0;
  if(!d)return {steps:[],total,hidden:[],bonus,available:false};
  const byId=new Map(routes.map(r=>[r.id,r]));let steps=[];
  if(category==='routes'){
   steps=connectedOrder(d.routes).map(r=>({routes:[r.id],points:r.points,anchor:r.id,label:[r.a,r.b]}));
   if(d.routeAdjustment)steps.push({routes:[],points:d.routeAdjustment,adjustment:true});
  }else if(category==='express'){
   d.express.routes.forEach((id,i)=>{const r=byId.get(id);if(!r)return;const length=r.n??r.length;const reverse=d.express.cities?.[i]===r.b;
    for(let n=0;n<length;n++)steps.push({routes:[id],cell:reverse?length-1-n:n,points:1,anchor:id,label:[r.a,r.b]});});
  }else if(category==='destinations')steps=d.destinations.map(ticket=>({routes:ticket.routes,points:ticket.points,anchor:ticket.routes.at(-1),label:[ticket.a,ticket.b],completed:ticket.completed,borrowed:ticket.stationRoutes||[],ticket:ticket.id}));
  else steps=[{routes:[],points:result.stations,stations:true}];
  return {steps,total,hidden:[...new Set(steps.flatMap(s=>s.routes))],bonus,available:true};
 }
 return {plan,connectedOrder};
})();
if(typeof module!=='undefined')module.exports=ScoreRecount;
