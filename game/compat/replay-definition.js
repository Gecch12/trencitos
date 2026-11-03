"use strict";

const fail = () => { throw Object.assign(Error("La definición de esta repetición no es compatible."), { status: 409 }); };
const reference = value => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === 2 && ["id", "version"].every(key => Object.hasOwn(value, key) && typeof value[key] === "string" && value[key].trim());
const same = (a, b) => a.id === b.id && a.version === b.version;

// No current catalog or rules execution: the recording owns its definition.
// Absence of the entire additive header identifies the original v1 protocol.
function hasDefinitionHeader(value) {
  if (!["definitionVersion", "mapRef", "rulesRef"].some(key => Object.hasOwn(value, key))) return false;
  if (value.definitionVersion !== 1 || !reference(value.mapRef) || !reference(value.rulesRef)) fail();
  return true;
}

function checkRecordedDefinition(record, state) {
  const current = hasDefinitionHeader(record);
  if (!state.definition) {
    if (Object.hasOwn(state, "definition") || state.views.some(hasDefinitionHeader)) fail();
    // A resumed legacy recording can have a prefix without the new protocol.
    return false;
  }
  const definition = state.definition;
  if (!current || definition.schemaVersion !== 1 || !reference(definition.mapRef) || !reference(definition.rulesRef) ||
      !same(definition.mapRef, record.mapRef) || !same(definition.rulesRef, record.rulesRef) ||
      !definition.rules || !definition.map || !["cities", "corridors", "routes", "tickets"].every(key => Array.isArray(definition.map[key]))) fail();
  for (const view of state.views) {
    if (!hasDefinitionHeader(view) || !same(view.mapRef, definition.mapRef) || !same(view.rulesRef, definition.rulesRef)) fail();
  }
  return true;
}

function requireRecordedDefinition(record, seen) {
  if (hasDefinitionHeader(record) && !seen) fail();
}

module.exports = { hasDefinitionHeader, checkRecordedDefinition, requireRecordedDefinition };
