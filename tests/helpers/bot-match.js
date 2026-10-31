"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { compileFunction } = require("node:vm");
const root = path.resolve(__dirname, "../..");
const sources = new Map();
function random(seed) {
  return max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
}

// Each match gets an isolated module graph and seeded engine randomness,
// including every shuffle/recycle. No global crypto patch or production RNG
// change. Decisions have independent per-seat streams, separate from deals.
function match({ seed = 1, seats = ["new", "old", "old", "old"], first = 0, measure = false, onAction } = {}) {
  const cache = new Map(), engineRandom = random(seed), durations = [];
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    if (!sources.has(file)) sources.set(file, compileFunction(fs.readFileSync(file, "utf8"), ["require", "module", "exports"], { filename: file }));
    sources.get(file)(name => {
      if (["node:crypto", "crypto"].includes(name)) return { randomInt: engineRandom };
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + (name.endsWith(".js") ? "" : ".js")));
      return require(name);
    }, module, module.exports);
    return module.exports;
  }
  const engine = load(path.join(root, "engine.js"));
  const policies = { new: load(path.join(root, "bots.js")).chooseBotAction,
    old: load(path.join(root, "tests/helpers/bots-baseline.js")).chooseBotAction,
    stage1: load(path.join(root, "tests/helpers/bots-stage1.js")).chooseBotAction,
    heuristic: (g, seat, rng) => policies.new(g, seat, rng, { search: false }) };
  const rngs = seats.map((_, i) => random(seed * 31 + i + 17));
  const game = engine.newGame(seats.map((policy, i) => `${policy}-${i}`), first, 0);
  let steps = 0;
  const actionCounts = {};
  while (game.phase !== "finished" && steps++ < 3000) {
    const offered = game.players.findIndex(p => p.offer);
    const seat = game.phase === "initial" ? game.players.findIndex(p => p.pending.length) : offered >= 0 ? offered : game.current;
    const start = measure ? performance.now() : 0;
    const action = policies[seats[seat]](game, seat, rngs[seat]);
    if (measure && seats[seat] === "new") durations.push(performance.now() - start);
    if (onAction) onAction({ action, seat, game });
    if (action) {
      if (seats[seat] === "new") actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
      engine.action(game, seat, action, { now: steps });
    } else {
      if (game.phase === "closing" || game.players[seat].offer) throw Error("Unresolved bot offer");
      engine.next(game, steps);
    }
    const cards = game.deck.length + game.discard.length + game.face.length + game.players.reduce((sum, p) => sum + p.hand.length, 0)
      + (game.phase === "tunnel" ? game.pending.revealed.length : 0);
    if (cards !== 110 || game.players.some(p => p.trains < 0 || p.stations < 0 || p.stations > 3 || p.placed.length + p.stations !== 3)) throw Error(`Invariant failed: seed ${seed}, step ${steps}`);
  }
  if (game.phase !== "finished") throw Error(`Stalled match: seed ${seed}`);
  return { steps, actionCounts, turns: game.turnSerial, result: game.result.map(({ seat, score, winner, completed, destination }) => ({ seat, score, winner, completed, destination })), durations };
}
module.exports = { match, random };
