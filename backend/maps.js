"use strict";
const { createMapCatalog, validateMapForRules } = require("../game/maps/catalog");
const europe = require("../shared/maps/europe-v1");

// Registration does not enable a lobby selector. Live matches still use the
// European legacy bridge until the per-match runtime contracts are migrated.
const maps = createMapCatalog([europe]);
const EUROPE_REFERENCE = Object.freeze({ id: "europe", version: "1" });
module.exports = { maps, EUROPE_REFERENCE, validateMapForRules };
