"use strict";
const {participantSeat,placement} = require('../game/application/history-queries');
const fail=(status,message)=>Object.assign(Error(message),{status});
const mode = m => m.mode==='Práctica'||m.players.filter(p=>!p.bot).length<2?'practice':m.players.some(p=>p.bot)?'mixed':'humans';
const valid = m => m.mapRef?.id && m.mapRef.id!=='laboratory';
const resolved = m => m.status!=='active';
const end = m => m.closedAt||m.updatedAt||m.startedAt;
const mean = values => values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const median = values => {if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;};
function filters(params) {
 const get=k=>params instanceof URLSearchParams?params.get(k):params?.[k];
 const period=get('period')||'all', selectedMode=get('mode')||'humans', players=get('players')?Number(get('players')):null;
 if(!['all','30','90'].includes(period)||!['all','humans','mixed','practice'].includes(selectedMode)||players!==null&&(!Number.isInteger(players)||players<2||players>5))throw fail(400,'Filtros de estadísticas inválidos.');
 return {period,mode:selectedMode,players,map:get('map')||null,rules:get('rules')||null};
}
function matchesFilter(m,f,now) {return valid(m)&&(!f.map||m.mapRef.id===f.map)&&(!f.rules||m.rulesVersion===f.rules)&&(!f.players||m.players.length===f.players)&&(f.mode==='all'||mode(m)===f.mode)&&(f.period==='all'||end(m)>=now-Number(f.period)*86400000);}
function result(m,seat) {
 const p=m.players[seat], penalized=p.participation?.penalizedAt!=null, left=p.participation?.definitive===true;
 const score=m.status==='completed'&&!penalized&&!left?m.scores.find(s=>s.seat===seat&&!s.partial&&Number.isFinite(s.score)):null;
 const ranked=score?placement(m,seat):null;
 return {match:m,seat,score,win:!!score&&(typeof score.winner==='boolean'?score.winner:ranked===1),abandoned:penalized||left,penalized,rank:ranked};
}
function summarize(rows) {
 const finished=rows.filter(r=>r.score), played=rows.filter(r=>r.score||r.abandoned), wins=played.filter(r=>r.win).length;
 const points=finished.map(r=>r.score.score), best=finished.reduce((best,r)=>!best||r.score.score>best.score.score?r:best,null);
 const sum=key=>finished.reduce((total,r)=>total+(Number.isFinite(r.score[key])?r.score[key]:0),0);
 const recent=[...played].sort((a,b)=>participationEnd(b)-participationEnd(a));
 const streak=predicate=>{let n=0;for(const row of recent){if(!predicate(row))break;n++;}return n;};
 return {played:played.length,completed:finished.length,abandoned:played.filter(r=>r.abandoned).length,active:rows.filter(r=>!resolved(r.match)&&!r.abandoned).length,wins,winRate:played.length?100*wins/played.length:null,totalPoints:points.reduce((a,b)=>a+b,0),average:mean(points),sample:points.length,
  best:best?{score:best.score.score,matchId:best.match.id,map:best.match.map,date:end(best.match)}:null,
  components:{routes:sum('route'),destinations:sum('destination'),stations:sum('stations'),express:sum('express')},
  ticketsCompleted:sum('completed'),ticketsTotal:finished.reduce((n,r)=>n+(r.score.tickets?.length||0),0),longest:finished.length?Math.max(...finished.map(r=>r.score.longest||0)):null,expressCount:finished.filter(r=>r.score.express>0).length,
  winStreak:streak(r=>r.win),completionStreak:streak(r=>!r.abandoned),trend:[...finished].sort((a,b)=>end(b.match)-end(a.match)).slice(0,20).reverse().map(r=>({score:r.score.score,date:end(r.match),map:r.match.map,mapId:r.match.mapRef.id,matchId:r.match.id}))};
}
function commitment(rows) {
 // A cancelled/expired room is not evidence of an individual outcome.
 const eligible=rows.filter(r=>r.match.commitment?.eligible&&(r.score||r.abandoned)).sort((a,b)=>participationEnd(b)-participationEnd(a)).slice(0,20);
 const abandons=eligible.filter(r=>r.penalized).length;
 return {score:eligible.length?Math.max(0,20-abandons):null,sample:eligible.length,abandons,window:20};
}
function participationEnd(r) {const p=r.match.players[r.seat].participation;return p?.penalizedAt??p?.leftAt??end(r.match);}
function roster(m,claims) {const ids=m.players.filter(p=>!p.bot).map(p=>p.accountId||claims[p.guestId]);return ids.every(Boolean)&&new Set(ids).size===ids.length?ids.sort():null;}
function groupData(records,claims,groups,friendIds,own,f,now) {
 const result=groups.map(g=>{
  const ids=[...g.members].sort(),matches=records.filter(m=>JSON.stringify(roster(m,claims))===JSON.stringify(ids)&&matchesFilter(m,f,now));
  return {...g,sample:matches.filter(m=>m.status==='completed').length,players:ids.map(id=>({id,...summarize(matches.map(m=>resultRow(m,id,claims)).filter(Boolean))}))};
 });
 const recurring=new Map();
 for(const m of records.filter(m=>m.status==='completed'&&valid(m))) {const ids=roster(m,claims);if(!ids||ids.length<2||!ids.includes(own)||ids.some(id=>id!==own&&!friendIds.includes(id)))continue;const key=ids.join(',');const r=recurring.get(key)||{members:ids,count:0};r.count++;recurring.set(key,r);}
 const suggestions=[...recurring.values()].filter(r=>r.count>=3&&!groups.some(g=>[...g.members].sort().join(',')===r.members.join(','))).sort((a,b)=>b.count-a.count).slice(0,5);
 return {groups:result,suggestions};
}
function resultRow(m,id,claims){const seat=participantSeat(m,{accountId:id},claims);return seat<0?null:result(m,seat);}
function distribution(values){const freq={};for(const n of values)freq[n]=(freq[n]||0)+1;return freq;}
function percentile(hist,value){if(value==null)return null;let below=0,total=0;for(const [n,count]of Object.entries(hist||{})){total+=count;if(Number(n)<=value)below+=count;}return total?100*below/total:null;}
function snapshot(records,claims,f,now=Date.now()) {
 const rows=records.filter(m=>matchesFilter(m,f,now)&&m.status==='completed').flatMap(m=>m.players.flatMap((p,seat)=>{if(p.bot)return[];const r=result(m,seat);const id=p.accountId||claims[p.guestId];return r.score&&id?[{score:r.score.score,id}]:[];}));
 const byPlayer=new Map();for(const r of rows){const v=byPlayer.get(r.id)||[];v.push(r.score);byPlayer.set(r.id,v);}
 const scores=rows.map(r=>r.score), averages=[...byPlayer.values()].filter(v=>v.length>=5).map(mean);
 return {updatedAt:now,sample:scores.length,players:byPlayer.size,qualifiedPlayers:averages.length,average:mean(scores),median:median(scores),best:scores.length?Math.max(...scores):null,scoreDistribution:distribution(scores),playerDistribution:distribution(averages)};
}
function compare(s,own) {if(!s)return null;const {scoreDistribution,playerDistribution,...publicData}=s;const enough=s.sample>=30&&s.players>=5;return {...publicData,minimumResults:30,minimumPlayers:5,minimumPlayerGames:5,scorePercentile:enough?percentile(scoreDistribution,own.best?.score):null,averagePercentile:own.sample>=5&&s.qualifiedPlayers>=5?percentile(playerDistribution,own.average):null};}
async function overview({archive,identity,params,now=Date.now(),social=null,global=null}) {
 const f=filters(params),{matches,claims}=await archive.records(identity,null);
 const ownMatches=matches.filter(m=>participantSeat(m,identity,claims)>=0),rows=ownMatches.filter(valid).map(m=>result(m,participantSeat(m,identity,claims)));
 const selected=rows.filter(r=>matchesFilter(r.match,f,now)),summary=summarize(selected);
 const meta={maps:[...new Map(rows.map(r=>[r.match.mapRef.id,{id:r.match.mapRef.id,name:r.match.map}])).values()],rules:[...new Set(rows.map(r=>r.match.rulesVersion))].filter(Boolean)};
 return {filters:f,...meta,summary,commitment:commitment(rows),global:compare(global,summary),...(social&&identity.accountId?groupData(ownMatches,claims,social.groups,social.players.filter(p=>p.relationship==='accepted').map(p=>p.id),identity.accountId,f,now):{})};
}
module.exports={overview,filters,matchesFilter,summarize,commitment,result,mode,snapshot,compare,groupData};
