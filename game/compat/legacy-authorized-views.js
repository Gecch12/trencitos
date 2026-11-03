"use strict";
const defaultEngine = require("../../backend/engine");
const Directory = require("../../backend/room-directory");
const Timing = require("../../shared/game-timing");
const { createAuthorizedViews } = require("../queries/authorized-views");

function createLegacyAuthorizedViews({ now = () => Date.now(), engine = defaultEngine } = {}) {
  return createAuthorizedViews({ engine, now, isPublic: Directory.isPublic,
    capacity: Directory.capacity, normalizeTiming: Timing.normalize });
}

module.exports = { createLegacyAuthorizedViews };
