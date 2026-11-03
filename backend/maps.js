"use strict";
const { createMapCatalog, validateMapForRules } = require("../game/maps/catalog");
const europe = require("../shared/maps/europe-v1");
const laboratory = require("../shared/maps/laboratory-v1");

// Built-in live maps. Only Europe uses the historical numeric wire bridge.
const maps = createMapCatalog([europe,laboratory]);
const EUROPE_REFERENCE = Object.freeze({ id: "europe", version: "1" });
module.exports = { maps, EUROPE_REFERENCE, validateMapForRules };
