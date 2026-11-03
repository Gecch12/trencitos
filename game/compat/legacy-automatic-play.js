"use strict";
const { randomInt } = require("node:crypto");
const engine = require("../../backend/engine");
const I18n = require("../../shared/i18n");
const { chooseBotAction, chooseReplacementAction } = require("../../backend/bots");
const { createAutomaticPlay } = require("../application/automatic-play");

// Composition for the existing runtime. Policy randomness stays independent of
// engine randomness; practice also uses its policy source for scheduling jitter.
function createLegacyAutomaticPlay({ stageRoom, now = Date.now, random = randomInt, botRandom = randomInt }) {
  return createAutomaticPlay({ engine, chooseBotAction, chooseReplacementAction,
    stageRoom, now, random, botRandom,
    messages: {
      permanentPass: name => I18n.message`${name} cede el turno.`,
      practicePass: name => I18n.message`${name} no encuentra una jugada útil y cede el turno.`,
    },
    onReplacementError: error => console.error("Replacement bot:", error.message),
  });
}

module.exports = { createLegacyAutomaticPlay };
