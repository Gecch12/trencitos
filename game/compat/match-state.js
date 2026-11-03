"use strict";

const MATCH_SCHEMA_VERSION = 1;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code, at) => { throw Object.assign(new Error(`Invalid saved match: ${at}`), {code}); };
const invalid = at => fail("INVALID_MATCH_STATE", at);
const array = (value, at) => { if (!Array.isArray(value)) invalid(at); return value; };

// Schema, map/rules versions and replay/storage envelope versions are distinct.
// Only the two known unversioned formats (legacy Europe and explicit refs from
// the context transition) may acquire a schema after their contents validate.
function validateMatchHeader(game) {
  if (!object(game)) invalid("state object");
  if (Object.hasOwn(game,"schemaVersion") && game.schemaVersion !== MATCH_SCHEMA_VERSION)
    fail("UNSUPPORTED_MATCH_SCHEMA", "schemaVersion");
  const map = Object.hasOwn(game,"mapRef"), rules = Object.hasOwn(game,"rulesRef");
  if (map !== rules || Object.hasOwn(game,"schemaVersion") && (!map || !rules))
    fail("INCOMPLETE_MATCH_REFERENCES", "mapRef/rulesRef");
}

// Validate the saved IDs/topology against the exact immutable definition. This
// is a restoration boundary, not a command validator or a replay normalizer.
function restoreMatchState(source, context) {
  validateMatchHeader(source);
  const g = structuredClone(source), {rules} = context;
  if (!["initial","play","tunnel","tickets","closing","finished"].includes(g.phase)) invalid("phase");
  const players = array(g.players,"players");
  if (players.length < rules.setup.minPlayers || players.length > rules.setup.maxPlayers) invalid("player count");
  const seat = value => Number.isInteger(value) && value >= 0 && value < players.length;
  if (!seat(g.first) || !seat(g.current)) invalid("first/current");
  const cities = new Set(context.map.cities.map(city=>city.id));
  const routes = new Map(context.routes.map(route=>[route.id,route]));
  const tickets = new Map(context.tickets.map(ticket=>[ticket.id,ticket]));
  const routeId = id => { if (!routes.has(id)) invalid("route ID"); };
  const cityId = id => { if (!cities.has(id)) invalid("city ID"); };
  const routeIds = ids => array(ids,"route IDs").forEach(routeId);
  const stationRoute = id => { if (id !== null) routeId(id); };
  const matches = (value, expected, keys, at) => {
    if (!object(value) || !expected || keys.some(key=>value[key]!==expected[key])) invalid(at);
  };
  const ticket = value => matches(value,tickets.get(value?.id),["id","a","b","p","long"],"ticket definition");
  const seenRoutes = new Set();
  for (const route of array(g.routes,"routes")) {
    matches(route,routes.get(route?.id),["id","a","b","n","color","tunnel","ferry","corridorId"],"route definition");
    if (seenRoutes.has(route.id) || route.owner !== null && !seat(route.owner)) invalid("route owner/duplicate");
    seenRoutes.add(route.id);
  }
  if (seenRoutes.size !== routes.size) invalid("incomplete route network");
  const seenTickets = new Set();
  const pile = values => array(values,"ticket pile").forEach(value=>{
    ticket(value);if (seenTickets.has(value.id)) invalid("duplicate active ticket");seenTickets.add(value.id);
  });
  const colors = new Set([...rules.colors,"wild"]);
  const cards = values => array(values,"train card pile").forEach(color=>{if(!colors.has(color))invalid("train card color");});
  for (const name of ["deck","discard","face"]) cards(g[name]);
  pile(g.shortDeck);
  const placed = new Set();
  for (const player of players) {
    if (!object(player)) invalid("player");
    cards(player.hand);pile(player.tickets);pile(player.pending);
    for (const name of ["trains","stations","score"]) if (!Number.isSafeInteger(player[name]) || player[name]<0) invalid(`player ${name}`);
    for (const city of array(player.placed,"placed stations")) {
      cityId(city);if(placed.has(city))invalid("duplicate station");placed.add(city);
    }
    if (player.stations + player.placed.length !== rules.setup.stations) invalid("station resources");
    if (player.offer) { if(!object(player.offer))invalid("offer");pile(player.offer.tickets); }
  }
  if (g.phase === "tickets") {
    if(!object(g.pending))invalid("legacy ticket offer");pile(g.pending.tickets);
  } else if (g.phase === "tunnel") {
    const t = g.pending;
    if (!object(t) || !routes.get(t.routeId)?.tunnel) invalid("pending tunnel route");
    cards(t.revealed);
    if (t.stage !== undefined && !["reveal","decision","result"].includes(t.stage)) invalid("tunnel stage");
    if (!object(t.base) || !colors.has(t.base.color) || !colors.has(t.color)) invalid("tunnel payment");
    for (const count of [t.base.regular,t.base.wild,t.surcharge]) if (!Number.isSafeInteger(count)||count<0) invalid("tunnel payment quantity");
  } else if (g.pending != null) invalid("unexpected pending action");
  for (const event of array(g.events ?? [],"events")) {
    if (!object(event)) invalid("event");
    if (Object.hasOwn(event,"routeId")) routeId(event.routeId);
    if (Object.hasOwn(event,"city")) cityId(event.city);
  }
  if(g.construction){
    const c=g.construction;
    if(!object(c)||!Number.isSafeInteger(c.id)||!seat(c.seat)||!Number.isFinite(c.startedAt)||!Number.isFinite(c.until)||c.until<c.startedAt)invalid("construction cue");
    if(c.routeId!==undefined)routeId(c.routeId);else cityId(c.city);
  }
  const station = value => { if(!object(value))invalid("station detail");cityId(value.city);stationRoute(value.routeId); };
  if (g.result != null) for (const row of array(g.result,"result")) {
    if (!object(row) || !seat(row.seat)) invalid("result seat");
    array(row.tickets,"result tickets").forEach(ticket);
    array(row.stationRoutes,"station assignments").forEach(stationRoute);
    if (!row.details) continue; // Legacy details are completed later, preserving totals.
    const details = row.details;
    for (const route of array(details.routes,"result routes"))
      matches(route,routes.has(route?.id)?{...routes.get(route.id),length:routes.get(route.id).n}:null,["id","a","b","length"],"result route definition");
    for (const destination of array(details.destinations,"destination details")) {
      ticket(destination);routeIds(destination.routes);routeIds(destination.stationRoutes);
      array(destination.stations,"destination stations").forEach(station);
    }
    array(details.stations?.placed,"result stations").forEach(station);
    routeIds(details.express?.routes);array(details.express?.cities,"express cities").forEach(cityId);
  }
  if (g.phase === "finished" && (!Array.isArray(g.result) || g.result.length !== players.length)) invalid("finished result");
  array(g.logs,"logs");
  // No rewriting of numeric European IDs, deadlines, scores, events or receipts.
  return {...g,schemaVersion:MATCH_SCHEMA_VERSION,mapRef:{...context.mapRef},rulesRef:{...context.rulesRef}};
}

module.exports = {MATCH_SCHEMA_VERSION,validateMatchHeader,restoreMatchState};
