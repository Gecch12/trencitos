"use strict";

// Pure view helpers. The server remains authoritative for every game action.
const GameUI = (() => {
  const MIN_ZOOM = .25, MAX_ZOOM = 6;
  const ROUTE_POINTS = Object.freeze({ 1: 1, 2: 2, 3: 4, 4: 7, 6: 15, 8: 21 });
  function cityLabelScale(zoom) { return Math.min(1.6, Math.max(1, 1 + (zoom - 2.5) * .24)); }
  function turnPresentation(game, seat, controlled = true) {
    if (!game) return { title: "", hint: "", clock: null, mine: false };
    const own = game.current === seat, player = game.players[game.current];
    if (game.phase === "finished") return { title: "PARTIDA TERMINADA", hint: "Consulta el desglose de puntos", clock: null, mine: false };
    if (game.phase === "initial") return { title: game.initial?.length ? "ELIGE TUS DESTINOS" : "ESPERANDO AL RESTO", hint: `${game.initialReadyCount}/${game.players.length} jugadores listos`, clock: "initial", mine: false };
    if (game.phase === "closing") return { title: "ÚLTIMOS BILLETES", hint: "Esperando las elecciones pendientes", clock: "closing", mine: false };
    if (game.turnWaiting) return { title: own ? "ELIGE TUS BILLETES" : `Turno de ${player.name}`, hint: own ? "Después tendrás un minuto completo para jugar" : "Está eligiendo sus destinos pendientes", clock: "waiting", mine: false };
    const mine = own && controlled;
    return { title: mine ? "TU TURNO" : own ? "TU PUESTO · SIN CONTROL" : `Turno de ${player.name}`,
      hint: !controlled && own ? "Reconecta o recupera el control para jugar" : mine ? game.phase === "tunnel" ? "Resuelve el túnel" : game.drawCount === 1 ? "Roba una carta más" : "Elige una acción" : "Puedes explorar el mapa y tus destinos",
      clock: "turn", mine };
  }
  function needsSecondDraw(game, seat, panel, controlled = true) {
    return !!(controlled && game?.phase === "play" && !game.turnWaiting && game.current === seat && game.drawCount === 1 && panel !== "cards");
  }
  const YELLOW = "#f4d83d";
  const WHITE = "#fff9e9", NEUTRAL = "#929da5";
  // Shared map/card presentation palette. Asset tests guard against hue drift.
  const ROUTE_COLORS = Object.freeze({
    red: "#ce554c", blue: "#4d85c3", green: "#46966d", yellow: YELLOW,
    black: "#1c2025", white: WHITE, orange: "#df8b44", purple: "#956dae",
    wild: "#c69b45", gray: NEUTRAL,
  });
  const OWNER_MARK_SCALE = .8;
  const playerMarks = [
    { name: "círculo", path: "M-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0" },
    { name: "triángulo", path: "M0-3L3 2.5H-3Z" },
    { name: "rombo", path: "M0-3.2L3 0 0 3.2-3 0Z" },
    { name: "cruz", path: "M-1-3H1V-1H3V1H1V3H-1V1H-3V-1H-1Z" },
    { name: "estrella", path: "M0-3.2L.95-1 3.2-1 1.4.5 2.1 3 0 1.5-2.1 3-1.4.5-3.2-1-.95-1Z" },
  ].map(Object.freeze);
  function playerMark(seat) { return playerMarks[seat]; }
  // Presentation-only migration: existing rooms keep their stored player colors.
  function playerColor(color) { return color?.toLowerCase() === "#ddaf40" ? YELLOW : color; }
  function routeOwner(game, route, seat) {
    if (!route || route.owner === null || !Number.isInteger(route.owner)) return null;
    const player = game.players[route.owner];
    if (!player) return null;
    return { seat: route.owner, name: player.name, color: playerColor(player.color), mark: playerMark(route.owner),
      label: route.owner === seat ? "Esta ruta es tuya" : `Ocupada por ${player.name}` };
  }
  // Logs arrive newest first and are capped on the server. Find the retained
  // prefix, including repeated messages, so the view can anchor the same row.
  function historyPrependCount(previous, next) {
    if (!previous.length) return next.length;
    for (let added = 0; added < next.length; added++) {
      const retained = next.length - added;
      if (retained <= previous.length && next.slice(added).every((text, i) => text === previous[i])) return added;
    }
    return null;
  }
  function historyAnchorIndex(previous, next, index) {
    const added = historyPrependCount(previous, next);
    // The DOM is chronological: discarded server entries disappear at its top.
    return added === null ? 0 : Math.max(0, index - Math.max(0, previous.length + added - next.length));
  }
  function newDrawEvent(previousId, next) {
    const event = next.drawEvent;
    return previousId !== null && event && Number.isInteger(event.id) && event.id > previousId && next.phase !== "finished" ? event : null;
  }
  function destinationStatus(game, id) {
    const status = game.ticketProgress?.find(entry => entry.id === id);
    return typeof status?.completed === "boolean" ? status : null;
  }
  // Sort only the presentation. Offer actions still use their original indexes,
  // and map numbers/colors remain stable when a destination is completed.
  function destinationEntries(game, tickets) {
    return tickets.map((ticket, index) => ({ ticket, index })).sort((a, b) =>
      Number(!!destinationStatus(game, a.ticket.id)?.completed) -
      Number(!!destinationStatus(game, b.ticket.id)?.completed) || a.index - b.index);
  }
  // Only kept private tickets belong in the overview, never an unconfirmed
  // offer. Hover can inspect a completed connection; overview shows cities only.
  function destinationSpotlightSelection(game, ticketId, all = false, result = null) {
    if (!game) return null;
    const ticket = game.tickets?.find(t => t.id === ticketId);
    if (ticket) {
      const path = game.ticketPaths?.find(p => p.id === ticket.id);
      return { endpoints: [ticket.a, ticket.b], routes: path?.routes || [],
        stationRoutes: path?.stationRoutes || [], stations: path?.stations || [] };
    }
    if (all && game.tickets?.length) return {
      endpoints: [...new Set(game.tickets.flatMap(t => [t.a, t.b]))],
      routes: [], stationRoutes: [], stations: [], overview: true,
    };
    return result;
  }
  const colors = ["red", "blue", "green", "yellow", "black", "white", "orange", "purple"];
  function payments(hand, cost, color = "gray", ferry = 0) {
    const wild = hand.filter(c => c === "wild").length;
    const options = [];
    for (const c of color === "gray" ? colors : [color]) {
      const regular = hand.filter(x => x === c).length;
      for (let w = Math.max(ferry, cost - regular); w <= Math.min(wild, cost - 1); w++)
        options.push({ color: c, wild: w, regular: cost - w });
    }
    if (wild >= cost && cost >= ferry) options.push({ color: "wild", wild: cost, regular: 0 });
    return options.sort((a, b) => a.wild - b.wild);
  }
  function construction(game, seat, target) {
    const no = reason => ({ reason, options: [] });
    if (!game || game.phase === "finished") return no("La partida ha terminado.");
    if (game.current !== seat) return no("No es tu turno.");
    if (game.phase !== "play" || game.turnWaiting) return no("Resuelve la acción pendiente antes de construir.");
    if (game.drawCount) return no("Termina de robar tus cartas antes de construir.");
    const player = game.players[seat];
    let cost, color = "gray", ferry = 0, route;
    if (target?.routeId !== undefined) {
      route = game.routes.find(r => r.id === target.routeId);
      if (!route) return no("Esta ruta no existe.");
      if (route.owner !== null) return no("Esta ruta ya está ocupada.");
      const parallel = game.routes.some(r => r.id !== route.id && r.owner !== null &&
        ((r.a === route.a && r.b === route.b) || (r.a === route.b && r.b === route.a)) &&
        (r.owner === seat || game.players.length <= 3));
      if (parallel) return no("La ruta paralela impide construir aquí.");
      if (player.trains < route.n) return no("No te quedan suficientes vagones.");
      cost = route.n;
      color = route.color;
      ferry = route.ferry;
    } else if (target?.city) {
      if (player.stations < 1) return no("No te quedan estaciones.");
      if (game.players.some(p => p.placed.includes(target.city))) return no("Esta ciudad ya tiene una estación.");
      cost = 4 - player.stations;
    } else return no("Selecciona una ruta o una ciudad.");
    const options = payments(game.hand, cost, color, ferry);
    return { reason: options.length ? null : "No tienes las cartas suficientes.", options, cost, route };
  }
  function tunnelPayments(hand, tunnel) {
    if (!tunnel || tunnel.surcharge < 1) return [];
    const remaining = [...hand];
    const base = [...Array(tunnel.base.regular).fill(tunnel.base.color), ...Array(tunnel.base.wild).fill("wild")];
    for (const card of base) {
      const index = remaining.indexOf(card);
      if (index < 0) return [];
      remaining.splice(index, 1);
    }
    if (tunnel.color === "wild") return remaining.filter(c => c === "wild").length >= tunnel.surcharge
      ? [{ color: "wild", regular: 0, wild: tunnel.surcharge }] : [];
    return payments(remaining, tunnel.surcharge, tunnel.color);
  }
  function canPass(game, seat, cities) {
    if (!game || game.phase !== "play" || game.turnWaiting || game.current !== seat || game.drawCount ||
      game.deckCount + game.discardCount || game.face.length || (!game.ticketOffer && game.ticketDeckCount)) return false;
    return !game.routes.some(r => !construction(game, seat, { routeId: r.id }).reason) &&
      !cities.some(city => !construction(game, seat, { city }).reason);
  }
  function overviewLabels(entries, important) {
    const shown = [];
    const ordered = [...entries].sort((a, b) => Number(important.has(b.key)) - Number(important.has(a.key)) || a.key.localeCompare(b.key));
    for (const entry of ordered) {
      if (important.has(entry.key) || !shown.some(other => Math.abs(entry.x - other.x) < (entry.width + other.width) / 2 + 20 && Math.abs(entry.y - other.y) < 42)) shown.push(entry);
    }
    return shown;
  }
  function endpointPosition(point, safe, inset = 24) {
    const left = safe.x + inset, right = safe.x + Math.max(inset, safe.width - inset);
    const top = safe.y + inset, bottom = safe.y + Math.max(inset, safe.height - inset);
    const outside = point.x < left || point.x > right || point.y < top || point.y > bottom;
    const cx = (left + right) / 2, cy = (top + bottom) / 2, dx = point.x - cx, dy = point.y - cy;
    const ratio = outside ? Math.min(dx ? (right - left) / 2 / Math.abs(dx) : Infinity, dy ? (bottom - top) / 2 / Math.abs(dy) : Infinity) : 1;
    return { x: Math.max(left, Math.min(right, cx + dx * ratio)), y: Math.max(top, Math.min(bottom, cy + dy * ratio)), outside, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  // Fit in the unobscured rectangle, while the SVG still fills the whole stage.
  function safeArea(viewport, { top = 8, right = 8, bottom = 8 } = {}) {
    return { x: 8, y: Math.max(8, top), width: Math.max(1, viewport.width - 8 - right), height: Math.max(1, viewport.height - Math.max(8, top) - bottom) };
  }
  function pinchZoom(startZoom, startDistance, distance) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, startZoom * Math.max(1, distance) / Math.max(1, startDistance)));
  }
  function pinchTransform(start, distance, midpoint) {
    const zoom = pinchZoom(start.zoom, start.distance, distance);
    const scale = start.scale * start.zoom / zoom;
    return { zoom, center: {
      x: start.center.x + start.midpoint.x * start.scale - midpoint.x * scale,
      y: start.center.y + start.midpoint.y * start.scale - midpoint.y * scale,
    } };
  }
  function camera(bounds, viewport, safe, zoom, center) {
    const scale = Math.max(bounds.width / Math.max(1, safe.width), bounds.height / Math.max(1, safe.height)) / zoom;
    const width = viewport.width * scale, height = viewport.height * scale;
    const sx = safe.x + safe.width / 2, sy = safe.y + safe.height / 2;
    // Allow water around the map at every scale, but keep part of it reachable.
    const clamp = (value, origin, extent, visible) => {
      const margin = visible / 2 - Math.min(visible, extent) / 4;
      return Math.max(origin - margin, Math.min(value, origin + extent + margin));
    };
    const focus = {
      x: clamp(center.x, bounds.x, bounds.width, safe.width * scale),
      y: clamp(center.y, bounds.y, bounds.height, safe.height * scale),
    };
    return { width, height, scale, focus,
      x: focus.x - sx * scale, y: focus.y - sy * scale, sx, sy };
  }
  return { payments, tunnelPayments, construction, canPass, camera, safeArea, pinchZoom, pinchTransform, cityLabelScale, turnPresentation, needsSecondDraw, ROUTE_POINTS, overviewLabels, endpointPosition, playerMark, playerColor, routeOwner, historyPrependCount, historyAnchorIndex, newDrawEvent, destinationStatus, destinationEntries, destinationSpotlightSelection, ROUTE_COLORS, YELLOW, WHITE, NEUTRAL, OWNER_MARK_SCALE, MIN_ZOOM, MAX_ZOOM };
})();
if (typeof module !== "undefined") module.exports = GameUI;
