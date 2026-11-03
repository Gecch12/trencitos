"use strict";
const { validateMapForRules } = require("../game/maps/catalog");
const legacyEurope = require("../shared/maps/europe-legacy-v1");
const rules = require("./rules/europe-classic-v1");
const {validateMatchHeader} = require("../game/compat/match-state");
const { EUROPE_REFERENCE } = require("./maps");
const RULES_REFERENCE = Object.freeze({id:rules.id,version:rules.version});
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const exactRules = ref => ref && typeof ref === "object" && !Array.isArray(ref) &&
  Reflect.ownKeys(ref).length === 2 && Object.hasOwn(ref,"id") && Object.hasOwn(ref,"version") &&
  ref.id === rules.id && ref.version === rules.version;

// Definitions and projections are immutable; mutable owners/piles belong only
// to the game. Resolve from serializable references, never an object WeakMap.
function createMatchContexts(maps) {
  const cache = new Map();
  function resolve(mapRef, rulesRef) {
    if (!exactRules(rulesRef)) fail("UNKNOWN_RULES_VERSION", "Unknown or invalid rules reference");
    const map = maps.get(mapRef);
    if (cache.has(map)) return cache.get(map);
    validateMapForRules(map,rules);
    const isLegacyEurope = map.id === EUROPE_REFERENCE.id && map.version === EUROPE_REFERENCE.version;
    const data = isLegacyEurope ? legacyEurope.adapt(map) : {
      ROUTES:map.routes.map(({id,corridorId,a,b,length,color,tunnel,ferry})=>({id,corridorId,a,b,n:length,color,tunnel,ferry})),
      TICKETS:map.tickets.map(({id,a,b,points,kind})=>({id,a,b,p:points,long:kind==="long"})),
    };
    const names = new Map(map.cities.map(city=>[city.id,city.name]));
    const context = Object.freeze({
      map, rules, mapRef:Object.freeze({id:map.id,version:map.version}), rulesRef:RULES_REFERENCE,
      routes:Object.freeze(data.ROUTES.map(Object.freeze)), tickets:Object.freeze(data.TICKETS.map(Object.freeze)),
      cityName:id=>names.get(id),
    });
    cache.set(map,context);
    return context;
  }
  function forGame(game) {
    validateMatchHeader(game);
    const hasMap = Object.hasOwn(game,"mapRef"), hasRules = Object.hasOwn(game,"rulesRef");
    if (!hasMap && !hasRules) return resolve(EUROPE_REFERENCE,RULES_REFERENCE);
    if (!hasMap || !hasRules) fail("INCOMPLETE_MATCH_REFERENCES", "A referenced match needs both map and rules");
    return resolve(game.mapRef,game.rulesRef);
  }
  function forSetup(options) {
    const hasMap = Object.hasOwn(options,"mapRef"), hasRules = Object.hasOwn(options,"rulesRef");
    const context = resolve(hasMap?options.mapRef:EUROPE_REFERENCE,hasRules?options.rulesRef:RULES_REFERENCE);
    return {context, references:{mapRef:{...context.mapRef},rulesRef:{...context.rulesRef}}};
  }
  return Object.freeze({forGame,forSetup});
}

// Fail before shuffling when a registered map cannot supply this initial deal.
function validateSetupTickets(context, playerCount) {
  const {setup} = context.rules;
  for (const [long,count] of [[true,setup.initialLongTickets],[false,setup.initialShortTickets]]) {
    if (context.tickets.filter(ticket=>ticket.long===long).length < playerCount*count) {
      fail("INSUFFICIENT_MAP_TICKETS", "Map cannot supply the initial destination deal");
    }
  }
}

module.exports = {createMatchContexts,validateSetupTickets,RULES_REFERENCE};
