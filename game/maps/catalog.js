"use strict";

class MapCatalogError extends Error {
  constructor(code, message) { super(message); this.name = "MapCatalogError"; this.code = code; }
}
const fail = (code, message) => { throw new MapCatalogError(code, message); };
const text = value => typeof value === "string" && value.trim().length > 0;
const integer = (value, minimum) => Number.isSafeInteger(value) && value >= minimum;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const pairKey = (a, b) => JSON.stringify([a, b].sort());
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function fields(value, names, at, code = "INVALID_MAP_DEFINITION") {
  if (!object(value) || Reflect.ownKeys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) {
    fail(code, `${at}: expected only ${names.join(", ")}`);
  }
}
function records(value, names, at) {
  if (!Array.isArray(value) || !value.length) fail("INVALID_MAP_DEFINITION", `${at}: expected a nonempty array`);
  const ids = new Map();
  for (const row of value) {
    fields(row, names, at);
    if (!text(row.id) || ids.has(row.id)) fail("INVALID_MAP_DEFINITION", `${at}: missing or duplicate ID`);
    ids.set(row.id, row);
  }
  return ids;
}
function validateReference(ref) {
  fields(ref, ["id", "version"], "map reference", "INVALID_MAP_REFERENCE");
  if (!text(ref.id) || !text(ref.version)) fail("INVALID_MAP_REFERENCE", "Map ID and version must be nonempty strings");
}

// A definition is public topology and destinations only. Ownership and geometry
// belong to match state and layout; rules compatibility is checked separately.
function validateMapDefinition(definition) {
  fields(definition, ["schemaVersion", "id", "version", "cities", "corridors", "routes", "tickets"], "map");
  if (definition.schemaVersion !== 1) fail("UNSUPPORTED_MAP_SCHEMA", "Unsupported map schema version");
  if (!text(definition.id) || !text(definition.version)) fail("INVALID_MAP_DEFINITION", "Map ID and version must be nonempty strings");
  const cities = records(definition.cities, ["id", "name"], "cities");
  if (cities.size < 2 || definition.cities.some(city => !text(city.name))) fail("INVALID_MAP_DEFINITION", "A map needs named cities");
  const ends = (a, b, at) => {
    if (a === b || !cities.has(a) || !cities.has(b)) fail("INVALID_MAP_DEFINITION", `${at}: endpoints must be distinct known cities`);
  };
  const corridors = records(definition.corridors, ["id", "cityIds"], "corridors"), pairs = new Set();
  for (const corridor of corridors.values()) {
    if (!Array.isArray(corridor.cityIds) || corridor.cityIds.length !== 2) fail("INVALID_MAP_DEFINITION", "A corridor needs two cities");
    const [a, b] = corridor.cityIds; ends(a, b, "corridor");
    const key = pairKey(a, b);
    if (pairs.has(key)) fail("INVALID_MAP_DEFINITION", "Parallel routes must share one corridor");
    pairs.add(key);
  }
  const routes = records(definition.routes, ["id", "corridorId", "a", "b", "length", "color", "tunnel", "ferry"], "routes");
  const used = new Set(), adjacency = new Map([...cities.keys()].map(id => [id, []]));
  for (const route of routes.values()) {
    ends(route.a, route.b, "route");
    const corridor = corridors.get(route.corridorId);
    if (!corridor || pairKey(...corridor.cityIds) !== pairKey(route.a, route.b)) fail("INVALID_MAP_DEFINITION", "Route does not match its corridor");
    if (!integer(route.length, 1) || !text(route.color) || typeof route.tunnel !== "boolean" ||
        !integer(route.ferry, 0) || route.ferry > route.length) fail("INVALID_MAP_DEFINITION", "Invalid route length, color, tunnel or ferry requirement");
    used.add(route.corridorId);
    adjacency.get(route.a).push(route.b); adjacency.get(route.b).push(route.a);
  }
  if (used.size !== corridors.size) fail("INVALID_MAP_DEFINITION", "Every corridor needs a route");
  const tickets = records(definition.tickets, ["id", "a", "b", "points", "kind"], "tickets");
  for (const ticket of tickets.values()) {
    ends(ticket.a, ticket.b, "ticket");
    if (!integer(ticket.points, 1) || !["short", "long"].includes(ticket.kind)) fail("INVALID_MAP_DEFINITION", "Invalid ticket points or kind");
  }
  const seen = new Set(), pending = [definition.cities[0].id];
  while (pending.length) {
    const id = pending.pop(); if (seen.has(id)) continue;
    seen.add(id); pending.push(...adjacency.get(id).filter(next => !seen.has(next)));
  }
  if (seen.size !== cities.size) fail("INVALID_MAP_DEFINITION", "Map network must connect every city");
  return definition;
}

// This is the map-facing portion of the current rule policies, not a complete
// RuleSet schema. Setup resources and live match selection follow in later cuts.
function validateMapForRules(definition, rules) {
  validateMapDefinition(definition);
  const invalid = message => fail("INCOMPATIBLE_MAP_RULES", message);
  if (!object(rules) || !Array.isArray(rules.colors) || !rules.colors.length ||
      rules.colors.some(color => !text(color) || ["gray", "wild"].includes(color)) ||
      new Set(rules.colors).size !== rules.colors.length || !object(rules.routePoints) || !object(rules.capabilities)) {
    invalid("Expected colors, route points and supported map capabilities");
  }
  for (const route of definition.routes) {
    if (route.color !== "gray" && !rules.colors.includes(route.color)) invalid(`Unsupported route color: ${route.color}`);
    if (!Object.hasOwn(rules.routePoints, route.length) || !integer(rules.routePoints[route.length], 0)) invalid(`Missing route score for length ${route.length}`);
    if (route.tunnel && rules.capabilities.tunnels !== true) invalid("Tunnel rules are required");
    if (route.ferry && rules.capabilities.ferries !== true) invalid("Ferry rules are required");
  }
  return definition;
}

function createMapCatalog(definitions) {
  if (!Array.isArray(definitions)) fail("INVALID_MAP_DEFINITION", "Expected map definitions");
  const maps = new Map();
  for (const source of definitions) {
    validateMapDefinition(source);
    const key = JSON.stringify([source.id, source.version]);
    if (maps.has(key)) fail("DUPLICATE_MAP_VERSION", `Duplicate map version: ${key}`);
    maps.set(key, freeze(structuredClone(source)));
  }
  const references = freeze([...maps.values()].map(({ id, version }) => ({ id, version })));
  return Object.freeze({
    list: () => references,
    get(ref) {
      validateReference(ref);
      const key = JSON.stringify([ref.id, ref.version]);
      if (!maps.has(key)) fail("UNKNOWN_MAP_VERSION", `Unknown map version: ${key}`);
      return maps.get(key);
    },
  });
}

module.exports = { createMapCatalog, validateMapDefinition, validateMapForRules, MapCatalogError };
