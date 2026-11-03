"use strict";
const Replay = require("../../shared/replay-state");
const { historyEntryView } = require("./match-view");

function projectSummary(record, full) {
  return structuredClone({ ...record, frames: undefined,
    players: record.players.map(({ name, color, bot }) => ({ name, color, bot })),
    scores: record.scores.map(score => full ? score : {
      seat: score.seat, route: score.route, score: score.score, partial: score.partial, winner: score.winner,
    }),
  });
}

// Access is decided before frames are loaded. Replay uses stored projections;
// it never invokes current rules, normalizes historical state or rewrites hashes.
function projectReplay(record, { full, audit }) {
  if (audit) return { match: projectSummary(record, true), frames: structuredClone(record.frames) };
  let state = null, previous = null;
  const frames = record.frames.map(frame => {
    state = frame.snapshot ? structuredClone(frame.snapshot) : Replay.apply(state, frame.changes);
    const projected = { members: state.members, views: full ? state.views : [state.views[0]] };
    const data = frame.seq % 32 === 0 || !previous ? { snapshot: projected } : { changes: Replay.diff(previous, projected) };
    previous = projected;
    return { seq: frame.seq, at: frame.at,
      events: full ? structuredClone(frame.events) : frame.events.map(entry => historyEntryView(entry, -1)),
      ...(full ? { action: structuredClone(frame.action) } : {}), ...data,
    };
  });
  return { match: projectSummary(record, full), full, frames };
}

module.exports = { projectSummary, projectReplay };
