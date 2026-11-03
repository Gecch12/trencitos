"use strict";
const engine = require("../../engine");
const Directory = require("../../room-directory");
const Timing = require("../../game-timing");
const { createAuthorizedViews } = require("../queries/authorized-views");

function createLegacyAuthorizedViews({ now = () => Date.now() } = {}) {
  return createAuthorizedViews({ engine, now, isPublic: Directory.isPublic,
    capacity: Directory.capacity, normalizeTiming: Timing.normalize });
}

module.exports = { createLegacyAuthorizedViews };
