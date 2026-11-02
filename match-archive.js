"use strict";
const {randomUUID,createHash}=require('node:crypto');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const frameHash=frame=>createHash('sha256').update(canonical(frame)).digest('hex');
const Engine=require('./engine'),Replay=require('./replay-state'),I18n=require('./i18n');
const fail=(status,message)=>Object.assign(Error(message),{status});
function safePublic(view) {
  const result=structuredClone(view);
  // Final scores are public; the identities of private tickets stay private.
  if(result.result) for(const row of result.result){row.tickets=[];row.individualTickets=[];row.stationRoutes=[];if(row.details) row.details.destinations=[];}
  return result;
}
function participant(record, identity, claims) {
  return record.players.some(p=>!p.bot && (identity.accountId && (p.accountId===identity.accountId || claims[p.guestId]===identity.accountId) || identity.guestId && p.guestId===identity.guestId && !claims[p.guestId]));
}
function createMatchArchive({saved={matches:{},claims:{}},remote=null}={}) {
  let state=saved, pending=new Map();
  function capture(room,endReason=null) {
    // Closure seals the recording. Later disconnects or room expiry must not
    // append an abandonment event to an already completed game.
    if(!room.game || room.archiveClosedAt) return;
    room.matchId ||= randomUUID();
    const g=room.game, previous=room._archiveState;
    const members=room.members.map(m=>({name:m.name,color:m.color,bot:!!m.bot,autopilot:!!m.autopilot,connected:!!m.bot||!!(m.ws&&!m.ws.closed)}));
    // Remove volatile serverNow from the recorded projections; retain deadlines
    // and authoritative timestamps to reproduce clocks at each recorded step.
    const views=[-1,...g.players.map((_,i)=>i)].map(seat=>{
      const view=Engine.view(g,seat);delete view.serverNow;
      return seat===-1?safePublic(view):view;
    });
    const next=structuredClone({game:g,views,members});
    const changes=previous?Replay.diff(previous,next):[];
    const old=pending.get(room.matchId)||{frames:[]};
    const changed=!previous||changes.length||endReason;
    if(!changed && old.match && JSON.stringify(old.match.players)===JSON.stringify(room.members.map(m=>({name:m.name,color:m.color,bot:!!m.bot,accountId:m.accountId||null,guestId:m.guestId||null})))) return;
    const seq=(room.archiveSeq??-1)+(changed?1:0), now=Date.now();
    if(changed){
      const priorSerial=previous?.game.logSerial??(room.archiveSeq>=0?g.logSerial:0);
      const events=g.history?.filter(e=>(e.id||0)>(priorSerial||0)).reverse()||[];
      if(!previous&&room.archiveSeq>=0)events.push({seat:null,text:'Grabación reanudada tras reiniciar el servidor.'});
      if(previous) members.forEach((m,i)=>{
        const old=previous.members[i];if(!old)return;
        let message=null;
        if(old.autopilot!==m.autopilot)message=m.autopilot?I18n.message`${m.name}: un bot tomó el control.`:I18n.message`${m.name} recuperó el control.`;
        else if(old.connected!==m.connected)message=m.connected?I18n.message`${m.name} se reconectó.`:I18n.message`${m.name} se desconectó.`;
        if(message)events.push({seat:i,text:I18n.format(message),message});
      });
      if(endReason)events.push({seat:null,text:endReason});
      const action=room.archiveAction||null;
      const frame={seq,at:now,action,events:structuredClone(events),previousHash:room.archiveHash||null,...(seq%32===0||!previous?{snapshot:next}:{changes})};
      frame.hash=frameHash(frame);room.archiveHash=frame.hash;old.frames.push(frame);
      room.archiveSeq=seq;room._archiveState=next;delete room.archiveAction;
    }
    const status=g.phase==='finished'&&!room.earlyFinish?'completed':endReason||room.earlyFinish?'abandoned':'active';
    room.archiveStartedAt ||= now;
    const players=room.members.map(m=>({name:m.name,color:m.color,bot:!!m.bot,accountId:m.accountId||null,guestId:m.guestId||null}));
    old.match={id:room.matchId,code:room.code,schemaVersion:1,rulesVersion:'europe-classic-1',map:'Europa',mode:room.practice?'Práctica':'Clásico',visibility:room.visibility||'private',startedAt:room.archiveStartedAt,updatedAt:now,closedAt:status==='active'?null:room.archiveClosedAt||now,status,endReason:status==='abandoned'?endReason||'Práctica terminada anticipadamente.':null,complete:!!room.archiveFull,steps:seq+1,digest:room.archiveHash,players,
      scores:g.players.map((p,seat)=>({seat,route:p.score,...(status==='completed'?structuredClone(g.result.find(r=>r.seat===seat)):{score:p.score,partial:true})}))};
    if(status!=='active') room.archiveClosedAt ||= now;
    pending.set(room.matchId,old);
  }
  function applyPending(target) {
    const next={matches:{...target.matches},claims:{...target.claims}};
    for(const [id,{match,frames}]of pending){const old=target.matches[id];next.matches[id]={...match,frames:[...(old?.frames||[]),...frames.filter(f=>f.seq>=(old?.frames.length||0))]};}
    return next;
  }
  function rollback(savedPending){pending=new Map(savedPending);}
  const snapshot=()=>[...pending].map(([id,value])=>[id,{...value,frames:[...value.frames]}]);
  function claim(guestId,accountId) {
    if(!guestId||!accountId)return;
    if(remote) return remote.claimGuest(guestId,accountId);
    if(state.claims[guestId]&&state.claims[guestId]!==accountId)throw fail(409,'Este historial ya pertenece a otra cuenta.');
    return {claims:{...state.claims,[guestId]:accountId}};
  }
  async function records(identity,id) {
    if(remote) return remote.readArchive(identity,id);
    if(id){const record=state.matches[id];return {matches:record?[record]:[],claims:state.claims};}
    return {matches:Object.values(state.matches).filter(r=>participant(r,identity,state.claims)),claims:state.claims};
  }
  async function bootstrap(rooms) {
    const ids=[...rooms.values()].map(r=>r.matchId).filter(Boolean);
    if(remote) return remote.closeMissing(ids);
    for(const record of Object.values(state.matches)) if(record.status==='active'&&!ids.includes(record.id)) {
      record.status='abandoned';record.closedAt=Date.now();record.endReason='La sala caducó sin reconexión.';
    }
  }
  async function list(identity) {
    const {matches,claims}=await records(identity,null);
    return matches.filter(r=>participant(r,identity,claims)).sort((a,b)=>b.startedAt-a.startedAt).map(r=>summary(r,true));
  }
  function summary(r,own) {
    return {...r,frames:undefined,players:r.players.map(({name,color,bot})=>({name,color,bot})),scores:r.scores.map(score=>own?score:{seat:score.seat,route:score.route,score:score.score,partial:score.partial,winner:score.winner})};
  }
  async function replay(identity,id,audit=false) {
    const {matches,claims}=await records(identity,id),record=matches[0];
    if(!record)throw fail(404,'Esta repetición no está disponible.');
    const own=participant(record,identity,claims);
    if(!own&&record.visibility!=='public')throw fail(404,'Esta repetición no está disponible.');
    if(record.status==='active')throw fail(409,'La repetición estará disponible cuando la partida se cierre.');
    if(record.schemaVersion!==1)throw fail(409,'Esta versión de repetición no está disponible.');
    if(audit&&!own)throw fail(403,'Solo los participantes pueden descargar la auditoría.');
    if(!record.frames)record.frames=await remote.readFrames(id,record.steps);
    if(audit)return {match:summary(record,true),frames:record.frames};
    let state=null,previous=null;
    const frames=record.frames.map(frame=>{
      state=frame.snapshot?structuredClone(frame.snapshot):Replay.apply(state,frame.changes);
      const projected={members:state.members,views:own?state.views:[state.views[0]]};
      const data=frame.seq%32===0||!previous?{snapshot:projected}:{changes:Replay.diff(previous,projected)};previous=projected;
      // Actions can contain private selections; only participants receive them.
      return {seq:frame.seq,at:frame.at,events:own?frame.events:frame.events.map(entry=>Engine.historyEntryView(entry,-1)),...(own?{action:frame.action}:{}),...data};
    });
    return {match:summary(record,own),full:own,frames};
  }
  return {bootstrap,capture,claim,list,replay,snapshot,rollback,get pending(){return [...pending.values()]},get state(){return state},prepare:()=>applyPending(state),commit(next){if(next)state=next;pending.clear();},restore(next){state=next;pending.clear();}};
}
module.exports={createMatchArchive,safePublic,participant,frameHash};
