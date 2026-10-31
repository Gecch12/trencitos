#!/usr/bin/env node
"use strict";
const { match } = require("../tests/helpers/bot-match");
function benchmark({ seed = 1001, seeds = 20, players = 4, measure = true, opponent = "stage1" } = {}) {
  const rows = [], durations = [], actionCounts = {};
  for (let deal = seed; deal < seed + seeds; deal++) for (let position = 0; position < players; position++) {
    const seats = Array(players).fill(opponent); seats[position] = "new";
    const result = match({ seed: deal, seats, first: (deal - seed) % players, measure });
    const current = result.result.find(r => r.seat === position), old = result.result.filter(r => r.seat !== position);
    rows.push({ seed: deal, seat: position, score: current.score, completed: current.completed,
      destination: current.destination,
      winShare: current.winner ? 1 / result.result.filter(r => r.winner).length : 0,
      oldScore: old.reduce((sum, r) => sum + r.score, 0) / old.length,
      oldCompleted: old.reduce((sum, r) => sum + r.completed, 0) / old.length, turns: result.turns });
    durations.push(...result.durations);
    for (const [type, count] of Object.entries(result.actionCounts)) actionCounts[type] = (actionCounts[type] || 0) + count;
  }
  durations.sort((a, b) => a - b);
  const mean = field => rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
  const round = n => Math.round(n * 100) / 100;
  return { seed, seeds, players, opponent, actionCounts, games: rows.length, wins: round(mean("winShare") * rows.length), winPercent: round(mean("winShare") * 100),
    averageScore: round(mean("score")), baselineAverageScore: round(mean("oldScore")),
    completedTickets: round(mean("completed")), baselineCompletedTickets: round(mean("oldCompleted")),
    destinationScore: round(mean("destination")),
    averageTurns: round(mean("turns")), ...(measure ? { decisionMs: { p50: round(durations[Math.floor(durations.length * .5)]),
      p95: round(durations[Math.floor(durations.length * .95)]), max: round(durations.at(-1)) } } : {}) };
}
if (require.main === module) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i].replace(/^--/, "");
    if (name === "opponent" && ["old", "stage1", "heuristic"].includes(process.argv[i + 1])) { options.opponent = process.argv[i + 1]; continue; }
    const value = Number(process.argv[i + 1]);
    if (!["seed", "seeds", "players"].includes(name) || !Number.isSafeInteger(value) || value < 1
      || name === "players" && (value < 2 || value > 5)) throw Error("Usage: node scripts/benchmark-bots.js [--seed N] [--seeds N] [--players 2..5] [--opponent old|stage1|heuristic]");
    options[name] = value;
  }
  console.log(JSON.stringify(benchmark(options), null, 2));
}
module.exports = { benchmark };
