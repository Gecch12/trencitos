"use strict";
// Contract-level double, not a substitute for applying the SQL on Supabase.
function fakeSupabase() {
  const state = { schema_version: 1, version: 0, rooms: [], writer: null, commit: null };
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
      if (state.writer !== body.p_writer || (state.commit !== body.p_commit && state.version !== body.p_version))
        return json({ message: 'FERROVIA_WRITER_CONFLICT' }, 400);
      if (state.commit !== body.p_commit) {
        state.rooms = structuredClone(body.p_rooms); state.version++; state.commit = body.p_commit;
      }
      if (lostResponses) { lostResponses--; throw new Error('Connection lost after commit'); }
      return json({ version: state.version, commit: state.commit });
    },
  };
}
module.exports = { fakeSupabase };
