"use strict";
const { createReplayAnalysis } = require("./replay-analysis");
const Replay = require("../../shared/replay-state");
const Journal = require("../../backend/match-journal");
const { historyEntryView } = require("./match-view");
const { checkRecordedDefinition, requireRecordedDefinition } = require("../compat/replay-definition");

function projectSummary(record, full) {
  return structuredClone({ ...record, frames: undefined,
    players: record.players.map(({ name, color, bot }) => ({ name, color, bot })),
    scores: record.scores.map(score => full ? score : {
      seat: score.seat, route: score.route, score: score.score, partial: score.partial, winner: score.winner,
    }),
  });
}

// Reveal only recorded game facts; never return account IDs, reconnect tokens
// or regenerate historical views with today's engine/rules.
function transparentViews(state) {
  const game = state.game;
  return state.views.map(view => {
    const result = structuredClone(view);
    if (!game) return result;
    if (game.journal) result.turnHistory = Journal.project(game, view.seat, { revealAll:true });
    if (game.history) result.history = structuredClone(game.history);
    if (game.events) result.events = structuredClone(game.events);
    if (game.lastDraw) result.drawEvent = structuredClone(game.lastDraw);
    if (game.result) result.result = structuredClone(game.result);
    return result;
  });
}

// Access is decided before frames are loaded. Replay uses stored projections;
// it never invokes current rules, normalizes historical state or rewrites hashes.
function createReplayProjector(record, { full, audit, includeAnalysis = false }) {
  let state = null, previous = null, seenDefinition = false;
  const analyze=createReplayAnalysis({full}),analysis=[];
  function push(frame) {
    state = frame.snapshot ? structuredClone(frame.snapshot) : Replay.apply(state, frame.changes);
    const defined = checkRecordedDefinition(record, state);
    if (seenDefinition && !defined) throw Object.assign(Error("La definición de la repetición está incompleta."), { status: 409 });
    seenDefinition ||= defined;
    if (audit) return structuredClone(frame);
    if(includeAnalysis)analysis.push(analyze(state));
    const projected = { members: state.members, views: full ? transparentViews(state) : [state.views[0]],
      ...(full && state.game ? { knowledge: structuredClone({ deck:state.game.deck, discard:state.game.discard,
        ticketDeck:state.game.shortDeck, longTicketDeck:state.game.longDeck }) } : {}),
      ...(defined ? { definition: state.definition } : {}) };
    const data = frame.seq % 32 === 0 || !previous ? { snapshot: projected } : { changes: Replay.diff(previous, projected) };
    previous = projected;
    return { seq: frame.seq, at: frame.at,
      events: full ? structuredClone(frame.events) : frame.events.map(entry => historyEntryView(entry, -1)),
      ...(full ? { action: structuredClone(frame.action) } : {}), ...data,
    };
  }
  return {push,finish(){requireRecordedDefinition(record,seenDefinition);},analysis};
}
function projectReplay(record, options) {
  const projector=createReplayProjector(record,options),frames=record.frames.map(projector.push);
  projector.finish();
  if(options.audit)return {match:projectSummary(record,true),frames};
  return {match:projectSummary(record,options.full),full:options.full,canAudit:!!options.canAudit,frames,...(options.includeAnalysis?{analysis:projector.analysis}:{})};
}
// Retain only the current reconstructed state and a bounded source page. JSON
// chunks preserve the existing HTTP contract; the caller applies backpressure.
async function* streamReplay(record, options, source) {
  const projector=createReplayProjector(record,options);
  let first=true;
  for await(const frame of source){
    const projected=projector.push(frame);
    if(first){yield '{"match":'+JSON.stringify(projectSummary(record,options.full))+(options.audit?'':',"full":'+JSON.stringify(options.full)+',"canAudit":'+JSON.stringify(!!options.canAudit))+',"frames":[';first=false;}
    else yield ',';
    yield JSON.stringify(projected);
  }
  projector.finish();
  if(first)yield '{"match":'+JSON.stringify(projectSummary(record,options.full))+(options.audit?'':',"full":'+JSON.stringify(options.full)+',"canAudit":'+JSON.stringify(!!options.canAudit))+',"frames":[';
  yield ']'+(!options.audit&&options.includeAnalysis?',"analysis":'+JSON.stringify(projector.analysis):'')+'}';
}
module.exports = { projectSummary, projectReplay, streamReplay };
