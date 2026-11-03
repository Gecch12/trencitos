"use strict";

// Client read model. It never runs the engine or decides whether an action commits.
const MatchPresentation = (() => {
  const commonJS = typeof module !== "undefined" && module.exports;
  const geometry = commonJS ? require("./map-layout") : RailMap;
  const europeLayout = commonJS ? require("./layouts/europe-v1") : EuropeLayoutV1;
  const laboratoryLayout = commonJS ? require("./layouts/laboratory-v1") : LaboratoryLayoutV1;
  const southAmericaLayout = commonJS ? require("./layouts/south-america-v3.3-beta") : SouthAmericaLayoutV33;
  const legacyData = () => commonJS ? require("../shared/data") : { CITIES, ROUTES, TICKETS, COLORS };
  const legacyRules = Object.freeze({ colors: Object.freeze([...legacyData().COLORS]),
    routePoints: Object.freeze({1:1,2:2,3:4,4:7,6:15,8:21}), doubleRoutesMinPlayers:4,
    stationCosts:Object.freeze([1,2,3]), setup:Object.freeze({stations:3}),
    trainCards:Object.freeze({marketSize:5,drawsPerTurn:2}), destinations:Object.freeze({initialMinimum:2,offerMinimum:1}) });
  const fail = message => { throw Error(message || "La definición de esta partida no es compatible."); };
  const ref = r => r && typeof r.id === "string" && r.id && typeof r.version === "string" && r.version;
  const same = (a,b) => ref(a) && ref(b) && a.id === b.id && a.version === b.version;
  const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  function indexed(rows) {
    if (!Array.isArray(rows)) fail();
    const byId = new Map(), byDom = new Map();
    for (const row of rows) {
      if (!row || !(typeof row.id === "string" && row.id.length || Number.isSafeInteger(row.id) && row.id >= 0) || byDom.has(String(row.id))) fail();
      byId.set(row.id, row); byDom.set(String(row.id), row.id);
    }
    return { get: id => byId.get(id), has: id => byId.has(id), fromDom: value => byDom.get(value) };
  }
  function legacyDefinition() {
    const data = legacyData();
    return { schemaVersion:1, mapRef:{id:"europe",version:"1"}, rulesRef:{id:"europe-classic",version:"1"},
      map:{cities:Object.entries(data.CITIES).map(([id,row]) => ({id,name:row[2]})), routes:data.ROUTES, tickets:data.TICKETS}, rules:legacyRules };
  }
  function create({ layouts = [europeLayout,laboratoryLayout,southAmericaLayout] } = {}) {
    const catalog = layouts.map(layout => freeze(structuredClone(layout)));
    let previous = null;
    function resolve(view, definition, { replay = false } = {}) {
      // A negotiated compact stream may omit an unchanged definition. The refs
      // must still match the last validated definition; reconnects start in full.
      if (definition === undefined && !replay && previous && same(view.mapRef,previous.definition.mapRef) && same(view.rulesRef,previous.definition.rulesRef)) definition = previous.definition;
      const header = ["definitionVersion","mapRef","rulesRef"].some(key => Object.hasOwn(view,key));
      const legacy = !header && definition === undefined && replay;
      if (!legacy && (!header || view.definitionVersion !== 1 || !definition || definition.schemaVersion !== 1 ||
          !same(view.mapRef, definition.mapRef) || !same(view.rulesRef, definition.rulesRef))) fail();
      const source = legacy ? legacyDefinition() : definition;
      const key = JSON.stringify([legacy,source]);
      let context = previous?.key === key ? previous : null;
      if (!context) {
        const layout = catalog.find(item => same(item.mapRef,source.mapRef));
        if (!layout) fail("El diseño de este mapa todavía no está disponible.");
        const data = freeze(structuredClone(source)), map = data.map, rules = data.rules;
        if (!map || !rules || !Array.isArray(rules.colors) || !rules.colors.length || !rules.routePoints ||
            !Number.isInteger(rules.doubleRoutesMinPlayers) || !Array.isArray(rules.stationCosts) ||
            !Number.isInteger(rules.trainCards?.marketSize) || !Number.isInteger(rules.trainCards?.drawsPerTurn) ||
            !Number.isInteger(rules.setup?.stations) || !Number.isInteger(rules.destinations?.initialMinimum) ||
            !Number.isInteger(rules.destinations?.offerMinimum)) fail();
        const cities = indexed(map.cities), routes = indexed(map.routes), tickets = indexed(map.tickets);
        if (!map.cities.length || Object.keys(layout.cities).length !== map.cities.length || map.cities.some(city =>
          typeof city.id !== "string" || typeof city.name !== "string" || !Object.hasOwn(layout.cities,city.id) ||
          !Array.isArray(layout.cities[city.id]) || layout.cities[city.id].length !== 2 || !layout.cities[city.id].every(Number.isFinite))) fail();
        if (map.routes.some(r => !cities.has(r.a) || !cities.has(r.b) || !Number.isInteger(r.n) || r.n < 1 ||
            !Number.isFinite(rules.routePoints[r.n])) || map.tickets.some(t => !cities.has(t.a) || !cities.has(t.b))) fail();
        const board = geometry.createLayout(layout), network = board.createNetwork(map.routes), paths = new Map(network.map(path => [path.id,path]));
        context = {key, legacy, definition:data, rules, layout:board, network, geometryFor:id => paths.get(id),
          cityIds:map.cities.map(city => city.id), cityName:id => cities.get(id)?.name || id,
          routeIdFromDom:routes.fromDom, ticketIdFromDom:tickets.fromDom, route:routes.get};
      }
      // A stale definition must never draw ownership over a different network.
      if (!Array.isArray(view.routes) || view.routes.length !== context.network.length || new Set(view.routes.map(r => r.id)).size !== view.routes.length ||
          view.routes.some(r => !context.route(r.id) || ["a","b","n","color","tunnel","ferry"].some(key => r[key] !== context.route(r.id)[key]))) fail();
      previous = context;
      return context;
    }
    return { resolve };
  }
  return { create, legacyRules };
})();
if (typeof module !== "undefined") module.exports = MatchPresentation;
