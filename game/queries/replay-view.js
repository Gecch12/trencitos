"use strict";
const { createReplayAnalysis } = require("./replay-analysis");
const Replay = require("../../shared/replay-state");
const Journal = require("./turn-history");
const { historyEntryView } = require("./match-view");
const { checkRecordedDefinition, requireRecordedDefinition } = require("../compat/replay-definition");

function projectSummary(record, full) {
  return structuredClone({ ...record, frames: undefined,
    players: record.players.map(({ name, color, bot, username, displayName, avatar }) => ({ name, color, bot, username, displayName, avatar })),
    scores: record.scores.map(score => full ? score : {
      seat: score.seat, route: score.route, score: score.score, partial: score.partial, winner: score.winner,
    }),
  });
}

// Reveal only recorded game facts; never return account IDs, reconnect tokens
// or regenerate historical views with today's engine/rules.
function transparentViews(state) {
  const game = state.game;
  const turnHistory=game?.journal?Journal.project(game,-1,{revealAll:true}):null;
  return state.views.map(view => {
    const result = structuredClone(view);
    if (!game) return result;
    if (turnHistory) result.turnHistory = turnHistory;
    if (game.history) result.history = structuredClone(game.history);
    if (game.events) result.events = structuredClone(game.events);
    if (game.lastDraw) result.drawEvent = structuredClone(game.lastDraw);
    if (game.result) result.result = structuredClone(game.result);
    return result;
  });
}
function compactViews(state,full){
  if(!full||!state.game)return {views:full?structuredClone(state.views):structuredClone([state.views[0]]),shared:{}};
  const game=state.game,shared={};
  if(game.journal)shared.turnHistory=Journal.project(game,-1,{revealAll:true});
  else if(game.history)shared.history=structuredClone(game.history);
  if(game.events)shared.events=structuredClone(game.events);
  if(game.lastDraw)shared.drawEvent=structuredClone(game.lastDraw);
  if(game.result)shared.result=structuredClone(game.result);
  const views=state.views.map(view=>{
    const copy={...view};
    for(const key of Object.keys(shared))delete copy[key];
    if(game.journal)delete copy.history;
    return structuredClone(copy);
  });
  return {views,shared};
}

// Access is decided before frames are loaded. Replay uses stored projections;
// it never invokes current rules, normalizes historical state or rewrites hashes.
function createReplayProjector(record, { full, audit, includeAnalysis = false, compact = false }) {
  let state = null, previous = null, seenDefinition = false;
  const cursor=Replay.cursor();
  const analyze=createReplayAnalysis({full}),analysis=[];
  function push(frame) {
    state = cursor.push(frame);
    const defined = checkRecordedDefinition(record, state);
    if (seenDefinition && !defined) throw Object.assign(Error("La definición de la repetición está incompleta."), { status: 409 });
    seenDefinition ||= defined;
    if (audit) return structuredClone(frame);
    if(includeAnalysis)analysis.push(analyze(state));
    const {views,shared}=compact?compactViews(state,full):{views:full?transparentViews(state):structuredClone([state.views[0]])};
    const projected = { members: structuredClone(state.members), views,
      ...(compact?{shared}:{}),
      ...(!compact && full && state.game ? { knowledge: structuredClone({ deck:state.game.deck, discard:state.game.discard,
        ticketDeck:state.game.shortDeck, longTicketDeck:state.game.longDeck }) } : {}),
      ...(defined ? { definition: structuredClone(state.definition) } : {}) };
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
  if(options.compact){
    yield* streamCompactReplay(record,options,source);return;
  }
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
// Each complete line is independently consumable. First paint needs only the
// first validated frame; a terminal record distinguishes completion from EOF.
async function* streamCompactReplay(record,options,source){
  const projector=createReplayProjector(record,{...options,includeAnalysis:false});
  let count=0;
  for await(const frame of source){
    const projected=projector.push(frame);
    if(!count)yield JSON.stringify({type:'match',match:projectSummary(record,options.full),full:options.full,canAudit:!!options.canAudit})+'\n';
    yield JSON.stringify({type:'frame',frame:projected})+'\n';
    count++;
    // File-backed archives are synchronous. Let HTTP flush and other rooms run.
    await new Promise(resolve=>setImmediate(resolve));
  }
  projector.finish();
  if(count!==record.steps)throw Error('Incomplete replay');
  yield JSON.stringify({type:'end',steps:count})+'\n';
}
module.exports = { projectSummary, projectReplay, streamReplay };
