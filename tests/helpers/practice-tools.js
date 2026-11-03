"use strict";
const { createPlanner } = require("../../backend/practice-planner");
const { createTactics } = require("../../backend/practice-tactics");
const { createSearch, randomStream, LIMITS } = require("../../backend/practice-search");

function practiceTools(engine, game = {}) {
  const context = engine.contextFor(game);
  const P = createPlanner({ engine, context });
  const T = createTactics({ planner: P, context });
  const S = { ...createSearch({ engine, planner: P, tactics: T, context }), randomStream, LIMITS };
  return { context, P, T, S };
}
module.exports = { practiceTools };
