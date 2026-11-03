"use strict";
const MapOptions = require("../shared/map-options");
const {randomUUID,createHash}=require('node:crypto');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const frameHash=frame=>createHash('sha256').update(canonical(frame)).digest('hex');
const Engine=require('./engine'),Replay=require('../shared/replay-state'),I18n=require('../shared/i18n');
const fail=(status,message)=>Object.assign(Error(message),{status});
const { safePublic } = require('../game/queries/authorized-views');
const { createLegacyAuthorizedViews } = require('../game/compat/legacy-authorized-views');
const { createHistoryQueries, participant } = require('../game/application/history-queries');
function createMatchArchive({saved={matches:{},claims:{}},remote=null,engine=Engine,projections=createLegacyAuthorizedViews({engine})}={}) {
  let state=saved, pending=new Map();
  function capture(room,endReason=null) {
    // Closure seals the recording. Later disconnects or room expiry must not
    // append an abandonment event to an already completed game.
    if(!room.game || room.archiveClosedAt) return;
    room.matchId ||= randomUUID();
    const g=room.game, previous=room._archiveState;
    engine.normalize(g);
    const identity=JSON.stringify(room.members.map(m=>[m.name,m.color,!!m.bot,m.accountId||null,m.guestId||null,!!m.autopilot,!!m.bot||!!(m.ws&&!m.ws.closed)]));
    // The action observer already recorded this exact state. Staging commonly
    // calls capture again; skip its expensive authorized views and replay diff.
    if(previous&&!endReason&&!room.archiveAction&&room._archiveIdentity===identity&&JSON.stringify(g)===JSON.stringify(previous.game))return;
    const {members,views,definition}=projections.recording(room);
    const next=structuredClone({game:g,views,members,definition});
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
    old.match={id:room.matchId,code:room.code,schemaVersion:1,definitionVersion:definition.schemaVersion,
      mapRef:structuredClone(definition.mapRef),rulesRef:structuredClone(definition.rulesRef),
      rulesVersion:`${definition.rulesRef.id}-${definition.rulesRef.version}`,map:MapOptions.name(definition.mapRef),
      mode:room.practice?'Práctica':'Clásico',visibility:room.visibility||'private',startedAt:room.archiveStartedAt,updatedAt:now,closedAt:status==='active'?null:room.archiveClosedAt||now,status,endReason:status==='abandoned'?endReason||'Práctica terminada anticipadamente.':null,complete:!!room.archiveFull,steps:seq+1,digest:room.archiveHash,players,
      scores:g.players.map((p,seat)=>({seat,route:p.score,...(status==='completed'?structuredClone(g.result.find(r=>r.seat===seat)):{score:p.score,partial:true})}))};
    if(status!=='active') room.archiveClosedAt ||= now;
    room._archiveIdentity=identity;
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
    return {matches:Object.values(state.matches),claims:state.claims};
  }
  async function bootstrap(rooms) {
    const ids=[...rooms.values()].map(r=>r.matchId).filter(Boolean);
    if(remote) return remote.closeMissing(ids);
    for(const record of Object.values(state.matches)) if(record.status==='active'&&!ids.includes(record.id)) {
      record.status='abandoned';record.closedAt=Date.now();record.endReason='La sala caducó sin reconexión.';
    }
  }
  const queries=createHistoryQueries({repository:{records,frames:(id,steps)=>remote.readFrames(id,steps),iterateFrames:(id,steps)=>remote.iterateFrames(id,steps)}});
  return {bootstrap,capture,claim,list:queries.list,replay:queries.replay,replayStream:queries.replayStream,snapshot,rollback,get pending(){return [...pending.values()]},get state(){return state},prepare:()=>applyPending(state),commit(next){if(next)state=next;pending.clear();},restore(next){state=next;pending.clear();}};
}
module.exports={createMatchArchive,safePublic,participant,frameHash};
