"use strict";
const engine = require("../../backend/engine");
const Directory = require("../../backend/room-directory");
const Timing = require("../../shared/game-timing");
const { createAuthorizedViews } = require("../queries/authorized-views");

function createLegacyAuthorizedViews({ now = () => Date.now() } = {}) {
  return createAuthorizedViews({ engine, now, isPublic: Directory.isPublic,
    capacity: Directory.capacity, normalizeTiming: Timing.normalize });
}

module.exports = { createLegacyAuthorizedViews };
