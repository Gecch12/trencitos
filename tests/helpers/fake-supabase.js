"use strict";
// Contract-level double, not a substitute for applying the SQL on Supabase.
function fakeSupabase({roomDelta=false,roomTransactions=false}={}) {
  const state = { schema_version: 1, version: 0, rooms: [], matches:{}, claims:{}, writer: null, commit: null };
  const calls = [];
  let fail = false, lostResponses = 0, wait = null;
  const versions=new Map(),receipts=new Map(),roomWaits=new Map(),failedRooms=new Set();
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  return {
    state, calls,
    set fail(value) { fail = value; },
    set lostResponses(value) { lostResponses = value; },
    holdRoom(code) {let release;const promise=new Promise(resolve=>release=resolve);roomWaits.set(code,promise);return()=>{roomWaits.delete(code);release();};},
    failRoom(code,value=true){if(value)failedRooms.add(code);else failedRooms.delete(code);},
    hold() { let release; wait = new Promise(resolve => { release = resolve; }); return () => { wait = null; release(); }; },
    async fetch(url, options) {
      const method = new URL(url).pathname.split('/').pop(), body = JSON.parse(options.body);
      calls.push({ method, body, headers: options.headers });
      if (wait) await wait;
      if (fail) return json({ message: 'Unavailable' }, 503);
      if (method === 'ferrovia_claim_checkpoint') { state.writer = body.p_writer; return json({...state,capabilities:{...(roomDelta?{roomDelta:1}:{}),...(roomTransactions?{roomTransactions:1}:{})}}); }
      if(method==='trencitos_claim_rooms') {for(const room of state.rooms)if(!versions.has(room.code))versions.set(room.code,1);return json({versions:Object.fromEntries(versions)});}
      if(method==='trencitos_read_room')return state.writer===body.p_writer?json({room:structuredClone(state.rooms.find(r=>r.code===body.p_code)||null),version:versions.get(body.p_code)||0}):json({message:'FERROVIA_WRITER_CONFLICT'},400);
      if(method==='trencitos_save_rooms') {
        for(const change of body.p_changes)if(roomWaits.has(change.code))await roomWaits.get(change.code);
        if(state.writer!==body.p_writer)return json({message:'FERROVIA_WRITER_CONFLICT'},400);
        if(body.p_changes.some(c=>failedRooms.has(c.code)))return json({message:'Unavailable'},503);
        if(receipts.has(body.p_commit)){if(lostResponses){lostResponses--;throw Error('Connection lost after commit');}return json(receipts.get(body.p_commit));}
        if(body.p_changes.some(c=>(versions.get(c.code)||0)!==c.version))return json({message:'FERROVIA_ROOM_CONFLICT'},400);
        const result={commit:body.p_commit,versions:{}};
        for(const change of body.p_changes){state.rooms=state.rooms.filter(r=>r.code!==change.code);if(change.room)state.rooms.push(structuredClone(change.room));versions.set(change.code,change.version+1);result.versions[change.code]=change.version+1;}
        for(const entry of body.p_archive||[]){const id=entry.match.id,old=state.matches[id];state.matches[id]={...structuredClone(entry.match),frames:[...(old?.frames||[]),...structuredClone(entry.frames)]};}
        receipts.set(body.p_commit,result);
        if(lostResponses){lostResponses--;throw Error('Connection lost after commit');}
        return json(result);
      }
      if (method === 'trencitos_close_missing') return json({ok:true});
      if (method === 'trencitos_claim_guest') {state.claims[body.p_guest]=body.p_account;return json({ok:true});}
      if (method === 'trencitos_read_archive_summary') return json({matches:(body.p_match?[state.matches[body.p_match]].filter(Boolean):Object.values(state.matches)).map(({frames,...metadata})=>metadata),claims:state.claims});
      if (method === 'trencitos_read_frames') return json((state.matches[body.p_match]?.frames||[]).slice(body.p_from,body.p_from+body.p_count));
      if (state.writer !== body.p_writer || (state.commit !== body.p_commit && state.version !== body.p_version))
        return json({ message: 'FERROVIA_WRITER_CONFLICT' }, 400);
      if (state.commit !== body.p_commit) {
        for(const entry of body.p_archive||[]){const id=entry.match.id,old=state.matches[id];state.matches[id]={...structuredClone(entry.match),frames:[...(old?.frames||[]),...structuredClone(entry.frames)]};}
        if(method==='ferrovia_save_checkpoint_delta'){
          const changed=new Map(body.p_changed.map(r=>[r.code,r])),removed=new Set(body.p_removed);
          state.rooms=[...state.rooms.filter(r=>!removed.has(r.code)&&!changed.has(r.code)),...changed.values()].map(r=>({...structuredClone(r),savedAt:body.p_saved_at})).sort((a,b)=>a.code.localeCompare(b.code));
        }else state.rooms = structuredClone(body.p_rooms);
        state.version++; state.commit = body.p_commit;
      }
      if (lostResponses) { lostResponses--; throw new Error('Connection lost after commit'); }
      return json({ version: state.version, commit: state.commit });
    },
  };
}
module.exports = { fakeSupabase };
