"use strict";
// Contract-level double, not a substitute for applying the SQL on Supabase.
function fakeSupabase() {
  const state = { schema_version: 1, version: 0, rooms: [], matches:{}, claims:{}, writer: null, commit: null };
  const calls = [];
  let fail = false, lostResponses = 0, wait = null;
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
  return {
    state, calls,
    set fail(value) { fail = value; },
    set lostResponses(value) { lostResponses = value; },
    hold() { let release; wait = new Promise(resolve => { release = resolve; }); return () => { wait = null; release(); }; },
    async fetch(url, options) {
      const method = new URL(url).pathname.split('/').pop(), body = JSON.parse(options.body);
      calls.push({ method, body, headers: options.headers });
      if (wait) await wait;
      if (fail) return json({ message: 'Unavailable' }, 503);
      if (method === 'ferrovia_claim_checkpoint') { state.writer = body.p_writer; return json(state); }
      if (method === 'trencitos_close_missing') return json({ok:true});
      if (method === 'trencitos_claim_guest') {state.claims[body.p_guest]=body.p_account;return json({ok:true});}
      if (method === 'trencitos_read_archive') return json({matches:body.p_match?[state.matches[body.p_match]].filter(Boolean):Object.values(state.matches),claims:state.claims});
      if (state.writer !== body.p_writer || (state.commit !== body.p_commit && state.version !== body.p_version))
        return json({ message: 'FERROVIA_WRITER_CONFLICT' }, 400);
      if (state.commit !== body.p_commit) {
        for(const entry of body.p_archive||[]){const id=entry.match.id,old=state.matches[id];state.matches[id]={...structuredClone(entry.match),frames:[...(old?.frames||[]),...structuredClone(entry.frames)]};}
        state.rooms = structuredClone(body.p_rooms); state.version++; state.commit = body.p_commit;
      }
      if (lostResponses) { lostResponses--; throw new Error('Connection lost after commit'); }
      return json({ version: state.version, commit: state.commit });
    },
  };
}
module.exports = { fakeSupabase };
