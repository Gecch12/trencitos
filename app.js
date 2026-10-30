"use strict";
const $ = (id) => document.getElementById(id);
const C = {
  red: "#ce554c",
  blue: "#4d85c3",
  green: "#46966d",
  yellow: "#caa23e",
  black: "#35414d",
  white: "#dce2e0",
  orange: "#df8b44",
  purple: "#956dae",
  wild: "#6d647f",
  gray: "#9ba7a8",
};
const N = {
  red: "Rojo",
  blue: "Azul",
  green: "Verde",
  yellow: "Amarillo",
  black: "Negro",
  white: "Blanco",
  orange: "Naranja",
  purple: "Morado",
  wild: "Locomotora",
};
let sock = null,
  game = null,
  seat = -1,
  room = "",
  token = "",
  members = [],
  host = false,
  practiceMode = false,
  selected = null,
  stationCity = null,
  attempted = false;
const MAP_BOUNDS = RailMap.bounds;
const MAP_GEOMETRY = RailMap.createNetwork(ROUTES);
const MAP_CENTER = { x: MAP_BOUNDS.x + MAP_BOUNDS.width / 2, y: MAP_BOUNDS.y + MAP_BOUNDS.height / 2 };
const TICKET_COLORS = ["#b48916", "#c64e48", "#357bb5", "#32815b"];
let zoom = 1,
  boardExpanded = false,
  mapCenter = { ...MAP_CENTER };
let pendingChoiceKey = null,
  ticketChoices = new Set(),
  hoveredTicket = null,
  focusedTicket = null,
  desiredRoom = new URLSearchParams(location.search).get("room") || "";
$("code").value = desiredRoom.toUpperCase();
const savedName = localStorage.getItem("rr-name");
if (savedName) $("nickname").value = savedName;
function escapeHTML(x) {
  return String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function status(text) {
  $("connection").textContent = text;
  $("connection").dataset.online = text.includes("Conectado") ? "true" : "false";
}
function send(obj) {
  if (!sock || sock.readyState !== WebSocket.OPEN) {
    error("Sin conexión.");
    return;
  }
  sock.send(JSON.stringify(obj));
}
function error(s) {
  $("lobbyError").textContent = s;
  let el = $("errorMsg");
  if (el) el.textContent = s;
  status("⚠ " + s.slice(0, 35));
}
function identityKey(code) {
  return "rr-room-" + code;
}
function resetToLobby(message = "") {
  if (room || desiredRoom) localStorage.removeItem(identityKey(room || desiredRoom));
  room = desiredRoom = token = "";
  game = null;
  seat = -1;
  members = [];
  host = practiceMode = attempted = false;
  selected = stationCity = null;
  boardExpanded = false;
  zoom = 1;
  mapCenter = { ...MAP_CENTER };
  pendingChoiceKey = null;
  ticketChoices.clear();
  document.body.classList.remove("board-expanded");
  $("expandboard").innerHTML = "⛶ <span>Ampliar</span>";
  $("expandboard").setAttribute("aria-label", "Ampliar el tablero");
  $("lobby").classList.remove("hidden");
  for (const id of ["game", "overlay", "roompanel", "practiceControls"])
    $(id).classList.add("hidden");
  $("practiceControls").removeAttribute("style");
  $("code").value = "";
  $("lobbyError").textContent = message;
  history.replaceState(null, "", "/");
  status(sock?.readyState === WebSocket.OPEN ? "● Conectado" : "○ Desconectado");
  $("createTest").focus();
}
function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  sock = new WebSocket(proto + "//" + location.host + "/socket");
  status("Conectando…");
  sock.onopen = () => {
    status("● Conectado");
    if (attempted && desiredRoom) {
      let t = localStorage.getItem(identityKey(desiredRoom));
      send({
        type: "join",
        code: desiredRoom,
        token: t || undefined,
        name: $("nickname").value,
      });
    }
  };
  sock.onmessage = (event) => {
    let m;
    try {
      m = JSON.parse(event.data);
    } catch {
      return;
    }
    if (m.type === "error") {
      if (m.code === "ROOM_NOT_FOUND") {
        resetToLobby(m.message);
        return;
      }
      error(m.message);
      return;
    }
    if (m.type === "room_closed") {
      resetToLobby();
      return;
    }
    if (m.type === "lobby") {
      room = m.code;
      desiredRoom = room;
      seat = m.seat;
      token = m.token;
      members = m.members;
      host = m.host;
      practiceMode = !!m.practice;
      localStorage.setItem(identityKey(room), token);
      localStorage.setItem("rr-name", $("nickname").value);
      history.replaceState(null, "", "/?room=" + room);
      renderLobby();
      return;
    }
    if (m.type === "state") {
      game = m.game;
      selected = null;
      stationCity = null;
      render();
      return;
    }
  };
  sock.onclose = () => {
    status("○ Desconectado");
    if (practiceMode) renderPracticeControls();
    setTimeout(() => {
      if (!sock || sock.readyState === WebSocket.CLOSED) {
        if (room) {
          desiredRoom = room;
          attempted = true;
        }
        connect();
      }
    }, 2200);
  };
  sock.onerror = () => {};
}
function renderLobby() {
  $("roompanel").classList.remove("hidden");
  $("roomcode").textContent = room;
  $("members").innerHTML = members
    .map(
      (m, i) =>
        `<div class="member"><b>${i + 1}. ${escapeHTML(m.name)} ${m.bot ? "🤖" : i === 0 ? "👑" : ""}</b><span class="${m.connected ? "connected" : "disconnected"}">${m.bot ? "Automático" : m.connected ? "● En línea" : "○ Sin conexión"}</span></div>`,
    )
    .join("");
  $("start").classList.toggle("hidden", practiceMode || !host || !!game);
  $("firstSeatBox").classList.toggle("hidden", practiceMode || !host || !!game);
  const previousFirst = $("firstSeat").value;
  $("firstSeat").innerHTML = members
    .map((m, i) => `<option value="${i}">${escapeHTML(m.name)}</option>`)
    .join("");
  if ([...$("firstSeat").options].some((x) => x.value === previousFirst))
    $("firstSeat").value = previousFirst;
  $("start").disabled = members.length < 2 || members.some((m) => !m.connected);
  $("roomNote").textContent =
    practiceMode ? "Sala de pruebas temporal · Tú y 3 bots." :
      `${members.length}/5 jugadores · ${members.length < 2 ? "Invita al menos a una persona." : "Solo el anfitrión puede comenzar."}`;
}
$("create").onclick = () => {
  if (room) return error("Ya perteneces a una sala.");
  attempted = false;
  send({ type: "create", name: $("nickname").value });
};
$("createTest").onclick = () => {
  if (room) return error("Ya perteneces a una sala.");
  attempted = false;
  $("lobbyError").textContent = "";
  send({ type: "create_test", name: $("nickname").value });
};
$("finishTest").onclick = () => send({ type: "finish_test" });
$("leaveTest").onclick = () => send({ type: "leave_test" });
$("join").onclick = () => {
  if (room) return error("Ya perteneces a una sala.");
  desiredRoom = $("code").value.trim().toUpperCase();
  if (!desiredRoom) return error("Introduce un código.");
  attempted = true;
  send({
    type: "join",
    code: desiredRoom,
    token: localStorage.getItem(identityKey(desiredRoom)) || undefined,
    name: $("nickname").value,
  });
};
$("start").onclick = () =>
  send({ type: "start", firstSeat: +$("firstSeat").value });
async function copyInvitation() {
  const url = location.origin + "/?room=" + room;
  try {
    await navigator.clipboard.writeText(url);
    $("copyLink").textContent = "✓ Copiado";
    $("copyRoomInGame").textContent = "✓ Copiado";
    setTimeout(() => {
      $("copyRoomInGame").innerHTML = "↗ <span>Invitar</span>";
    }, 2400);
  } catch {
    $("copyLink").textContent = url;
    prompt("Copia el enlace de tu sala", url);
  }
}
$("copyLink").onclick = copyInvitation;
$("copyRoomInGame").onclick = copyInvitation;
function act(type, other = {}) {
  send({ type: "action", action: { type, ...other } });
}
function amIUp() {
  return game && game.current === seat && game.phase === "play";
}
function drawAllowed() {
  return amIUp() && game.drawCount < 2;
}
function colorCard(c, count, click, disabled) {
  const b = document.createElement(click ? "button" : "div");
  b.className = "traincard suit-" + c;
  const image = document.createElement("img");
  image.src = "assets/cards/" + c + ".svg";
  image.alt = N[c] || c;
  image.draggable = false;
  b.appendChild(image);
  if (count !== null && count !== undefined) {
    const tag = document.createElement("span");
    tag.className = "cardcount";
    tag.textContent = "×" + count;
    b.appendChild(tag);
  }
  if (click) {
    b.type = "button";
    b.title = "Robar carta " + N[c];
    b.disabled = disabled;
    b.onclick = click;
  }
  return b;
}
function render() {
  if (!game) return;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  renderPracticeControls();
  const p = game.players[seat],
    active = amIUp();
  $("scores").innerHTML = game.players
    .map(
      (x, i) =>
        `<div class="scorebadge ${i === game.current ? "active" : ""}"><span class="player-dot"></span><div class="player-details"><b>${escapeHTML(x.name)} ${members[i]?.bot ? "🤖" : i === seat ? "<em>TÚ</em>" : ""}</b><small>🚂 ${x.trains} vagones · 🏠 ${x.stations} estaciones</small></div><strong class="player-points">${x.score}<span>pts</span></strong></div>`,
    )
    .join("");
  [...$("scores").children].forEach((badge, i) =>
    badge.style.setProperty("--player-color", game.players[i].color));
  $("turntitle").textContent =
    game.phase === "finished"
      ? "Partida terminada"
      : game.phase === "initial"
        ? "Elección inicial"
        : active
          ? "Tu turno"
          : `Turno de ${game.players[game.current].name}`;
  $("myname").textContent = p.name;
  $("myseat").textContent = "JUGADOR " + (seat + 1);
  $("turnhint").textContent =
    game.phase === "finished"
      ? "Resultados finales disponibles"
      : game.phase === "initial"
        ? "Escogiendo billetes iniciales"
        : active
          ? game.drawCount
            ? "Completa tu robo de cartas"
            : "Elige una acción"
          : "Esperando a " + game.players[game.current].name;
  $("stats").textContent =
    `${p.trains} vagones restantes · ${p.stations} estaciones disponibles${game.finalRemaining !== null ? " · Última ronda" : ""}`;
  $("hand").innerHTML = "";
  for (const c of [...COLORS, "wild"]) {
    let n = game.hand.filter((x) => x === c).length;
    if (n) $("hand").appendChild(colorCard(c, n, null, false));
  }
  $("mytickets").innerHTML =
    game.tickets
      .map(
        (t) =>
          `<div class="ticket ${t.long ? "long" : ""}"><span>${escapeHTML(CITIES[t.a][2])} → ${escapeHTML(CITIES[t.b][2])}</span><b>${t.p}</b></div>`,
      )
      .join("") || '<p class="smallmuted">Todavía sin billetes</p>';
  $("market").innerHTML = "";
  game.face.forEach((c, i) =>
    $("market").appendChild(
      colorCard(
        c,
        null,
        () => act("draw_train", { index: i }),
        !drawAllowed() || (c === "wild" && game.drawCount === 1),
      ),
    ),
  );
  $("drawblind").disabled =
    !drawAllowed() || game.deckCount + game.discardCount === 0;
  $("drawtickets").disabled =
    !active || game.drawCount > 0 || !game.ticketDeckCount;
  $("deckinfo").textContent =
    `${game.deckCount} cartas ocultas · ${game.ticketDeckCount} destinos por robar`;
  $("drawstats").textContent = active ? `${game.drawCount}/2 cartas` : " ";
  $("pass").classList.toggle("hidden", !active || game.drawCount > 0 ||
    game.deckCount + game.discardCount > 0 || game.face.length > 0 || game.ticketDeckCount > 0);
  $("history").innerHTML = game.logs
    .map((t) => "<div>• " + escapeHTML(t) + "</div>")
    .join("");
  renderBoard();
  renderSelection();
  renderDialog();
  applyZoom();
}
const LABEL_OFFSETS = RailMap.labels;
function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}
function routeRequirementText(r) {
  const base = r.n - r.ferry;
  if (r.color === "gray") {
    if (r.ferry) return `${base ? plural(base, "carta") + " de un mismo color + " : ""}${plural(r.ferry, "locomotora")}`;
    return `${plural(r.n, "carta")} de un mismo color`;
  }
  const colorName = N[r.color].toLowerCase();
  if (r.ferry) return `${base ? plural(base, "carta") + " de color " + colorName + " + " : ""}${plural(r.ferry, "locomotora")}`;
  return `${plural(r.n, "carta")} de color ${colorName}`;
}
function routeSummaryText(r) {
  const tags = [];
  if (r.tunnel) tags.push("Túnel");
  if (r.ferry) tags.push("Ferri");
  return `${CITIES[r.a][2]} — ${CITIES[r.b][2]} · ${plural(r.n, "espacio")}${tags.length ? " · " + tags.join(" · ") : ""} · Requiere ${routeRequirementText(r)}`;
}
function svgElements(svg) {
  return (tag, attrs = {}, parent = svg) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };
}
function drawMapBase(el, prefix) {
  const defs = el("defs");
  const grain = el("pattern", {
    id: `${prefix}-paper`, width: 7, height: 9, patternUnits: "userSpaceOnUse",
  }, defs);
  el("circle", { cx: 1, cy: 2, r: 0.45, fill: "#9c8861", opacity: 0.15 }, grain);
  el("circle", { cx: 5, cy: 7, r: 0.3, fill: "#fffdf5", opacity: 0.6 }, grain);
  const geography = el("g", { class: "map-geography", "pointer-events": "none" });
  for (const d of RailMap.land) {
    el("path", { d, fill: "none", stroke: "#e5f0e8", "stroke-width": 5, opacity: 0.55 }, geography);
    el("path", { d, fill: "#eee6d2", stroke: "#a5b3a7", "stroke-width": 1.1, "stroke-linejoin": "round" }, geography);
    el("path", { d, fill: `url(#${prefix}-paper)` }, geography);
  }
  for (const d of RailMap.details)
    el("path", { d, fill: "none", stroke: "#c2b797", "stroke-width": 0.7, "stroke-dasharray": "2 3", opacity: 0.55 }, geography);
  for (const [x, y, name, size, rotation] of [
    [55, 392, "ATLÁNTICO", 13, -70],
    [346, 615, "MEDITERRÁNEO", 11, 0],
    [761, 473, "MAR NEGRO", 9, 0],
    [509, 101, "BÁLTICO", 8, -25],
  ]) el("text", {
    x, y, class: "sea-label", "font-size": size, "text-anchor": "middle",
    transform: `rotate(${rotation} ${x} ${y})`,
  }, geography).textContent = name;
  return defs;
}
function drawTrainGlyph(el, parent, color, ferry = false) {
  const g = el("g", { class: ferry ? "ferry-mark" : "owned-train", fill: color, stroke: "#405351", "stroke-width": 0.3, "pointer-events": "none" }, parent);
  el("path", {
    d: ferry ? "M-7 2V-2H-3V-4H0V-1H5L8 2ZM-6-3V-5H-3V-3Z" : "M-8 1V-3Q-8-4-6-4H5L8-1V1Z",
  }, g);
  for (const x of [-4, 4]) el("circle", { cx: x, cy: 3, r: 1.5 }, g);
}
function renderBoard() {
  const svg = $("board");
  svg.replaceChildren();
  const el = svgElements(svg);
  drawMapBase(el, "board");
  const guides = el("g", { class: "rail-guides" });
  for (const r of game.routes) {
    const geometry = MAP_GEOMETRY[r.id];
    const owned = r.owner !== null;
    const color = owned ? game.players[r.owner].color : r.color === "gray" ? "#fbfaf1" : C[r.color];
    const group = el("g", {
      class: `route-group${selected === r.id ? " is-selected" : ""}`,
      "data-route-id": r.id,
    });
    // A pale separation under each track makes geometric crossings unambiguous.
    el("path", { d: geometry.d, class: "route-separation", fill: "none", stroke: "#f2eddc", "stroke-width": 12, "stroke-linecap": "round" }, guides);
    el("path", { d: geometry.d, class: "route-guide", fill: "none", stroke: "#8c9991", "stroke-width": 0.8, opacity: 0.45 }, guides);
    geometry.cells.forEach((cell, i) => {
      const slot = el("g", {
        class: "train-slot", transform: `translate(${cell.x} ${cell.y}) rotate(${cell.angle})`,
      }, group);
      if (r.tunnel) el("path", {
        class: "tunnel-mark", d: "M-8-4.8V-6.2M-3-4.8V-6.2M2-4.8V-6.2M7-4.8V-6.2M-8 4.8V6.2M-3 4.8V6.2M2 4.8V6.2M7 4.8V6.2",
        stroke: "#384b4f", "stroke-width": 2, fill: "none",
      }, slot);
      el("rect", {
        class: "train-space", x: -cell.width / 2, y: -cell.height / 2,
        width: cell.width, height: cell.height, rx: 1.6,
        fill: color, stroke: selected === r.id ? "#db921e" : owned ? "#fffef2" : "#405351",
        "stroke-width": selected === r.id ? 2.2 : owned ? 1.5 : 0.9,
      }, slot);
      if (owned) drawTrainGlyph(el, slot, "#fffef3");
      else if (i < r.ferry) drawTrainGlyph(el, slot, "#405351", true);
    });
    el("title", {}, group).textContent =
      `${routeSummaryText(r)}${owned ? " · Ocupada" : ""}`;
    el("path", {
      d: geometry.d, class: "route-hit", fill: "none", stroke: "transparent",
      "stroke-width": 11, "pointer-events": "stroke",
    }, group);
    group.addEventListener("click", () => {
      if (!amIUp() || game.drawCount) return;
      selected = r.id;
      stationCity = null;
      renderSelection();
      renderBoard();
    });
  }
  for (const [key, [x, y]] of Object.entries(RailMap.cities)) {
    const occupant = game.players.findIndex(p => p.placed.includes(key));
    const group = el("g", { transform: `translate(${x} ${y})`, class: "city-node", "data-city": key });
    el("circle", { r: 6.6, fill: "#fffdf1", opacity: 0.9 }, group);
    el("circle", {
      r: 4.4, fill: occupant >= 0 ? game.players[occupant].color : "#f9f4e6",
      stroke: stationCity === key ? "#bd6b38" : "#6b7972",
      "stroke-width": stationCity === key ? 2.3 : 1.3, class: "city-circle",
    }, group);
    el("title", {}, group).textContent = CITIES[key][2];
    group.addEventListener("click", () => {
      if (!amIUp() || game.drawCount) return;
      stationCity = key;
      selected = null;
      renderSelection();
      renderBoard();
    });
    if (occupant >= 0) el("path", {
      d: "M-3 2V-1H-4L0-4 4-1H3V2Z", fill: "#fffefa", "pointer-events": "none",
    }, group);
  }
  const names = el("g", { class: "city-names", "pointer-events": "none" });
  for (const key of Object.keys(RailMap.cities)) {
    const group = el("g", { "data-city-label": key }, names);
    el("line", { class: "city-leader", stroke: "#6e8078", "stroke-width": 0.8 }, group);
    el("text", { class: "city-label" }, group).textContent = CITIES[key][2];
  }
  updateCityLabels();
}
function updateCityLabels() {
  const view = mapViewSize();
  if (!view) return;
  const viewport = $("mapscroll");
  const origin = { x: mapCenter.x - view.width / 2, y: mapCenter.y - view.height / 2 };
  const screen = ([x, y]) => [(x - origin.x) / view.scale, (y - origin.y) / view.scale];
  const entries = [];
  const groups = new Map();
  for (const g of $("board").querySelectorAll("[data-city-label]")) {
    const key = g.dataset.cityLabel, [x, y] = screen(RailMap.cities[key]);
    const visible = x >= 0 && y >= 0 && x <= viewport.clientWidth && y <= viewport.clientHeight;
    g.style.display = visible ? "" : "none";
    if (!visible) continue;
    groups.set(key, g);
    entries.push({ key, x, y, width: g.querySelector("text").getComputedTextLength() });
  }
  const obstacles = MAP_GEOMETRY.flatMap(r => r.cells.map(cell => {
    const [x, y] = screen([cell.x, cell.y]), angle = cell.angle * Math.PI / 180;
    const width = (Math.abs(Math.cos(angle)) * cell.width + Math.abs(Math.sin(angle)) * cell.height) / view.scale;
    const height = (Math.abs(Math.sin(angle)) * cell.width + Math.abs(Math.cos(angle)) * cell.height) / view.scale;
    return { x: x - width / 2, y: y - height / 2, width, height };
  }));
  const placements = RailMap.placeLabels(entries, viewport.clientWidth, viewport.clientHeight, obstacles);
  for (const box of placements) {
    const g = groups.get(box.key), city = RailMap.cities[box.key], [sx, sy] = screen(city);
    const dx = box.x - sx, dy = box.y - sy;
    // Inverse camera scale: font, halo, label offsets and leaders stay in CSS px.
    g.setAttribute("transform", `translate(${city[0]} ${city[1]}) scale(${view.scale})`);
    const text = g.querySelector("text");
    text.setAttribute("x", dx);
    text.setAttribute("y", dy + 11);
    const leader = g.querySelector("line");
    const ex = Math.max(dx, Math.min(0, dx + box.width)), ey = Math.max(dy, Math.min(0, dy + box.height));
    const distance = Math.hypot(ex, ey);
    leader.setAttribute("x1", distance ? ex / distance * 8 : 0);
    leader.setAttribute("y1", distance ? ey / distance * 8 : 0);
    leader.setAttribute("x2", ex);
    leader.setAttribute("y2", ey);
    leader.style.display = distance > 18 ? "" : "none";
  }
}
function renderSelection() {
  const active = amIUp() && !game.drawCount;
  const r = selected === null ? null : game.routes[selected],
    p = game.players[seat];
  const previousColor = $("paycolor").value;
  $("paycolor").innerHTML = "";
  $("wildcount").innerHTML = "";
  $("routeinfo").textContent = r
    ? `${routeSummaryText(r)}${r.owner !== null ? " · OCUPADA" : ""}`
    : stationCity
      ? `Estación en ${CITIES[stationCity][2]} · ${4 - p.stations} carta(s) del mismo color`
      : "Selecciona una ruta o una ciudad en el mapa.";
  const label = $("mapselection");
  if (label)
    label.textContent = r
      ? `🚂 ${routeSummaryText(r)}${r.owner !== null ? " · Ocupada" : ""}`
      : stationCity
        ? `🏠 Estación seleccionada: ${CITIES[stationCity][2]}`
        : "Selecciona una ruta o una ciudad. Las líneas resaltadas son interactuables.";
  const opts = r
    ? r.color === "gray"
      ? [...COLORS, "wild"]
      : [r.color, "wild"]
    : [...COLORS, "wild"];
  for (let c of opts) {
    const o = document.createElement("option");
    o.value = c;
    o.textContent = N[c];
    $("paycolor").appendChild(o);
  }
  if (opts.includes(previousColor)) $("paycolor").value = previousColor;
  $("paycolor").onchange = renderSelection;
  $("claim").disabled =
    !active ||
    !r ||
    r.owner !== null ||
    p.trains < r.n ||
    game.routes.some(
      (x) =>
        r.id !== x.id &&
        x.owner !== null &&
        x.a === r.a &&
        x.b === r.b &&
        (x.owner === seat || game.players.length <= 3),
    );
  $("station").disabled =
    !active ||
    !stationCity ||
    p.stations === 0 ||
    game.players.some((p) => p.placed.includes(stationCity));
  updateWild();
  $("buildhint").textContent =
    r && r.tunnel
      ? "En túneles se revelan 3 cartas; puedes aceptar o rechazar el coste extra."
      : r && r.ferry
        ? "Se necesitan locomotoras por cada símbolo ⚓."
        : "Las locomotoras sustituyen cualquier color.";
}
function updateWild() {
  let r = selected === null ? null : game.routes[selected],
    p = game.players[seat];
  const cost = r ? r.n : 4 - p.stations,
    need = r ? r.ferry : 0,
    c = $("paycolor").value,
    wild = game.hand.filter((x) => x === "wild").length,
    reg = game.hand.filter((x) => x === c).length,
    min = c === "wild" ? cost : Math.max(need, cost - reg),
    max = c === "wild" ? cost : Math.min(wild, cost);
  $("wildcount").innerHTML = "";
  if (min > max) {
    let o = document.createElement("option");
    o.textContent = "Cartas insuficientes";
    o.value = "-1";
    $("wildcount").appendChild(o);
  } else
    for (let i = min; i <= max; i++) {
      let o = document.createElement("option");
      o.value = i;
      o.textContent = i + " locomotora(s)";
      $("wildcount").appendChild(o);
    }
  $("claim").disabled = $("claim").disabled || min > max;
  $("station").disabled = $("station").disabled || (!r && min > max);
}
$("claim").onclick = () => {
  if (selected === null || +$("wildcount").value < 0) return;
  act("claim", {
    routeId: selected,
    color: $("paycolor").value,
    wildCount: +$("wildcount").value,
  });
};
$("station").onclick = () => {
  if (!stationCity || +$("wildcount").value < 0) return;
  act("station", {
    city: stationCity,
    color: $("paycolor").value,
    wildCount: +$("wildcount").value,
  });
};
$("drawblind").onclick = () => act("draw_train", { index: -1 });
$("drawtickets").onclick = () => act("draw_tickets");
$("pass").onclick = () => act("pass");
function showDialog(title, body, ticketDialog = false) {
  $("overlay").classList.remove("hidden");
  $("dialog").classList.toggle("ticket-dialog", ticketDialog);
  $("dialog").setAttribute("aria-labelledby", "dialogTitle");
  $("dialog").innerHTML =
    `<h2 id="dialogTitle">${title}</h2>${body}<p class="err" id="errorMsg"></p>`;
}
function renderTicketMap(tickets) {
  const svg = $("ticketMap");
  svg.replaceChildren();
  const el = svgElements(svg);
  drawMapBase(el, "tickets");
  const network = el("g", { class: "ticket-network", "aria-hidden": "true" });
  for (const r of MAP_GEOMETRY)
    el("path", { d: r.d, fill: "none" }, network);
  for (const [x, y] of Object.values(RailMap.cities))
    el("circle", { cx: x, cy: y, r: 2.8 }, network);

  const preview = hoveredTicket ?? focusedTicket;
  const visible = tickets.map((ticket, i) => ({ ticket, i }))
    .filter(({ i }) => ticketChoices.has(i) || preview === i);
  const endpoints = new Map();
  for (const { ticket, i } of visible) {
    const [x, y] = RailMap.cities[ticket.a], [xx, yy] = RailMap.cities[ticket.b];
    const g = el("g", {
      class: "ticket-connection", "data-ticket-index": i,
      opacity: preview !== null && preview !== i ? 0.5 : 1,
    });
    el("title", {}, g).textContent =
      `${CITIES[ticket.a][2]} → ${CITIES[ticket.b][2]} · ${ticket.p} puntos`;
    const line = { x1: x, y1: y, x2: xx, y2: yy, "stroke-linecap": "round" };
    el("line", { ...line, stroke: "#fffefa", "stroke-width": 6 }, g);
    el("line", {
      ...line, stroke: TICKET_COLORS[i], "stroke-width": 2.8,
      "stroke-dasharray": "6 6", class: "ticket-connector",
    }, g);
    // A number as well as a color keeps overlapping destinations identifiable.
    const mx = (x + xx) / 2, my = (y + yy) / 2;
    el("circle", { cx: mx, cy: my, r: 11, fill: TICKET_COLORS[i], stroke: "#fffefa", "stroke-width": 2 }, g);
    el("text", { x: mx, y: my + 4, "text-anchor": "middle", class: "ticket-map-number" }, g).textContent = i + 1;
    for (const city of [ticket.a, ticket.b]) {
      if (!endpoints.has(city)) endpoints.set(city, []);
      endpoints.get(city).push(i);
    }
  }
  for (const [city, indexes] of endpoints) {
    const [x, y] = RailMap.cities[city], name = CITIES[city][2];
    const g = el("g", { class: "ticket-endpoint", "data-city": city });
    el("circle", { cx: x, cy: y, r: 5, fill: "#fffefa", stroke: "#24495a", "stroke-width": 1.3 }, g);
    indexes.forEach((i, ring) => el("circle", {
      cx: x, cy: y, r: 8 + ring * 4, fill: "none",
      stroke: TICKET_COLORS[i], "stroke-width": 2.5, "data-ticket-index": i,
    }, g));
    const offset = LABEL_OFFSETS[city] || [0, -19];
    const radius = 8 + (indexes.length - 1) * 4;
    el("text", {
      x, y: y + (offset[1] > 0 ? radius + 17 : -radius - 7),
      "text-anchor": "middle", class: "ticket-city-label",
    }, g).textContent = name;
  }
}
function updateTicketSelection(tickets, min) {
  const count = ticketChoices.size;
  $("ticketCount").textContent = `${count} de ${tickets.length} seleccionados · mínimo ${min}`;
  $("keep").disabled = count < min;
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.classList.toggle("is-selected", ticketChoices.has(i));
    row.classList.toggle("is-preview", (hoveredTicket ?? focusedTicket) === i);
  }
  renderTicketMap(tickets);
}
function showTicketDialog(tickets, min) {
  const key = JSON.stringify([room, seat, game.phase, tickets.map((t) => t.id)]);
  if (pendingChoiceKey === key && $("ticketMap") && !$("overlay").classList.contains("hidden")) return;
  if (pendingChoiceKey !== key) {
    ticketChoices = new Set(tickets.map((_, i) => i).slice(0, min));
    pendingChoiceKey = key;
  }
  hoveredTicket = focusedTicket = null;
  showDialog(
    game.phase === "initial" ? "Elige tus billetes iniciales" : "Nuevos billetes de destino",
    `<p class="ticket-intro">Conserva al menos ${min} billete${min > 1 ? "s" : ""}. Tus destinos permanecerán secretos hasta el final.</p>
    <div class="ticket-layout">
      <figure class="ticket-map-panel">
        <svg id="ticketMap" viewBox="${MAP_BOUNDS.x} ${MAP_BOUNDS.y} ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}" role="img" aria-label="Vista de los destinos seleccionados" aria-describedby="ticketMapCaption"></svg>
        <figcaption id="ticketMapCaption">Las líneas unen destinos; no indican un recorrido obligatorio.</figcaption>
      </figure>
      <div class="ticket-options">
        <p class="ticket-options-title">Compara tus destinos</p>
        <p class="ticket-options-hint">Pasa el cursor por un billete para verlo. Marca los que quieras conservar.</p>
        <div class="ticket-choices">${tickets.map((t, i) => `
          <label class="choice ticket-choice" data-ticket-index="${i}">
            <input type="checkbox" class="keep" value="${i}" ${ticketChoices.has(i) ? "checked" : ""}>
            <span class="ticket-number" aria-hidden="true">${i + 1}</span>
            <span class="ticket-choice-text"><b>${escapeHTML(CITIES[t.a][2])} → ${escapeHTML(CITIES[t.b][2])}</b><small>${t.p} puntos ${t.long ? '<span class="longtag">LARGA</span>' : ""}</small></span>
          </label>`).join("")}</div>
        <div class="ticket-confirm">
          <p id="ticketCount" role="status" aria-live="polite"></p>
          <button class="primary full" id="keep" aria-describedby="ticketCount">Conservar seleccionados</button>
        </div>
      </div>
    </div>`,
    true,
  );
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.style.setProperty("--ticket-color", TICKET_COLORS[i]);
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) ticketChoices.add(i);
      else ticketChoices.delete(i);
      updateTicketSelection(tickets, min);
    });
    for (const type of ["mouseenter", "mouseleave", "focusin", "focusout"])
      row.addEventListener(type, () => {
        if (type === "mouseenter") hoveredTicket = i;
        if (type === "mouseleave") hoveredTicket = null;
        if (type === "focusin") focusedTicket = i;
        if (type === "focusout") focusedTicket = null;
        updateTicketSelection(tickets, min);
      });
  }
  $("keep").onclick = () => {
    if (ticketChoices.size < min) return;
    act(game.phase === "initial" ? "choose_initial" : "keep_tickets", {
      indexes: [...ticketChoices].sort((a, b) => a - b),
    });
  };
  updateTicketSelection(tickets, min);
  $("dialogTitle").tabIndex = -1;
  $("dialogTitle").focus({ preventScroll: true });
}
function renderDialog() {
  if (!game) return;
  const myTurn = game.current === seat;
  if (!myTurn || !["initial", "tickets"].includes(game.phase)) pendingChoiceKey = null;
  if (game.phase === "finished") {
    const res = game.result;
    showDialog(
      game.earlyFinish ? "Prueba terminada anticipadamente" : "Fin de partida",
      `<p>${game.earlyFinish ? "Puntuación del estado actual. Solo cuentan las rutas construidas y los billetes ya elegidos." : "Resultados calculados: rutas, destinos, estaciones y camino más largo."}</p>${res.map((r, i) => `<div class="resultrow"><b>${i + 1}. ${escapeHTML(r.name)} — ${r.score} puntos ${r.winner ? "🏆" : ""}</b><small>Rutas ${r.route} · Destinos ${r.destination} · Estaciones ${r.stations} · Express ${r.express} (${r.longest} vagones)</small></div>`).join("")}${practiceMode ? '<button id="practiceHome" class="primary full">Volver al inicio</button>' : '<p class="warning">Sala finalizada. Para jugar de nuevo, crea otra sala.</p>'}`,
    );
    if (practiceMode) $("practiceHome").onclick = () => send({ type: "leave_test" });
    return;
  }
  if (!myTurn) {
    $("overlay").classList.add("hidden");
    return;
  }
  if (game.phase === "initial" || game.phase === "tickets") {
    const t = game.phase === "initial" ? game.initial : game.pending;
    if (!t) return;
    const min = game.phase === "initial" ? 2 : 1;
    showTicketDialog(t, min);
    return;
  }
  if (game.phase === "tunnel") {
    const t = game.tunnel;
    if (!t) return;
    const can = game.hand.filter((x) => x === t.color).length - t.base.regular,
      wild = game.hand.filter((x) => x === "wild").length - t.base.wild,
      possible =
        t.color === "wild" ? wild >= t.surcharge : can + wild >= t.surcharge;
    showDialog(
      "Un túnel inesperado",
      `<p>Las cartas reveladas son:</p><div id="revealed" class="market"></div><p><b>${t.surcharge}</b> carta(s) adicionales para completar la ruta. Puedes desistir sin perder las cartas de tu mano.</p><label>Locomotoras adicionales</label><select id="extraWild"></select><button class="primary full" id="acceptTunnel" ${!possible ? "disabled" : ""}>Pagar y construir</button><button class="tertiary full" id="declineTunnel">Desistir del túnel</button>`,
    );
    for (const c of t.revealed)
      $("revealed").appendChild(colorCard(c, 1, null, false));
    const select = $("extraWild");
    if (possible) {
      let min =
          t.color === "wild" ? t.surcharge : Math.max(0, t.surcharge - can),
        max = Math.min(wild, t.surcharge);
      for (let j = min; j <= max; j++) {
        let option = document.createElement("option");
        option.value = j;
        option.textContent = j;
        select.appendChild(option);
      }
    }
    $("acceptTunnel").onclick = () =>
      act("pay_tunnel", { extraWild: +select.value });
    $("declineTunnel").onclick = () => act("decline_tunnel");
    return;
  }
  $("overlay").classList.add("hidden");
}

function renderPracticeControls() {
  $("practiceControls").classList.toggle("hidden", !practiceMode || !game);
  $("copyRoomInGame").classList.toggle("hidden", practiceMode);
  const finished = game?.phase === "finished";
  const online = sock?.readyState === WebSocket.OPEN;
  $("finishTest").classList.toggle("hidden", !!finished);
  $("leaveTest").classList.toggle("hidden", !finished);
  $("finishTest").disabled = $("leaveTest").disabled = !online;
  $("practiceStatus").textContent = !online
    ? "Reconectando… La sala se elimina tras 30 s de desconexión."
    : finished ? "Prueba finalizada · Puedes iniciar otra partida."
    : "Tú + 3 bots · 0,8–1 s por acción";
}

// Pointer capture supports mouse, touch and pen without dragging the stop button.
let practiceDrag = null;
function movePracticePanel(left, top) {
  const panel = $("practiceControls");
  const nav = $("mobileNav");
  const bottom = getComputedStyle(nav).display === "none" ? 8 : nav.getBoundingClientRect().height + 8;
  panel.style.left = Math.max(8, Math.min(left, document.documentElement.clientWidth - panel.offsetWidth - 8)) + "px";
  panel.style.top = Math.max(8, Math.min(top, document.documentElement.clientHeight - panel.offsetHeight - bottom)) + "px";
  panel.style.bottom = "auto";
}
$("practiceDrag").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const rect = $("practiceControls").getBoundingClientRect();
  practiceDrag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
  event.currentTarget.setPointerCapture(event.pointerId);
});
$("practiceDrag").addEventListener("pointermove", (event) => {
  if (practiceDrag?.id !== event.pointerId) return;
  movePracticePanel(event.clientX - practiceDrag.x, event.clientY - practiceDrag.y);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
  $("practiceDrag").addEventListener(type, () => { practiceDrag = null; });
$("practiceDrag").addEventListener("keydown", (event) => {
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!directions[event.key]) return;
  event.preventDefault();
  const [x, y] = directions[event.key];
  const rect = $("practiceControls").getBoundingClientRect();
  const step = event.shiftKey ? 30 : 10;
  movePracticePanel(rect.left + x * step, rect.top + y * step);
});
window.addEventListener("resize", () => {
  const panel = $("practiceControls");
  if (practiceMode && panel.style.top) {
    const rect = panel.getBoundingClientRect();
    movePracticePanel(rect.left, rect.top);
  }
});

function mapViewSize() {
  const { width, height } = $("mapscroll").getBoundingClientRect();
  if (!width || !height) return null;
  const scale = Math.max(MAP_BOUNDS.width / width, MAP_BOUNDS.height / height) / zoom;
  return { width: width * scale, height: height * scale, scale };
}
function applyZoom() {
  const view = mapViewSize();
  if (!view) return;
  // Keep the map reachable: at fit it is centered, and at higher zoom levels
  // panning stops at the surrounding water margin rather than drifting away.
  for (const [axis, length] of [["x", "width"], ["y", "height"]]) {
    const half = view[length] / 2;
    mapCenter[axis] = view[length] >= MAP_BOUNDS[length]
      ? MAP_BOUNDS[axis] + MAP_BOUNDS[length] / 2
      : Math.max(MAP_BOUNDS[axis] + half,
          Math.min(mapCenter[axis], MAP_BOUNDS[axis] + MAP_BOUNDS[length] - half));
  }
  $("board").setAttribute("viewBox",
    `${mapCenter.x - view.width / 2} ${mapCenter.y - view.height / 2} ${view.width} ${view.height}`);
  $("zoomlevel").textContent = Math.round(zoom * 100) + "%";
  $("zoomout").disabled = zoom <= 1;
  $("zoomin").disabled = zoom >= 3;
  $("mapscroll").classList.toggle("can-pan", zoom > 1);
  updateCityLabels();
}
function setZoom(next, clientX, clientY) {
  const before = mapViewSize();
  if (!before) return;
  const rect = $("mapscroll").getBoundingClientRect();
  const fx = clientX === undefined ? 0 : (clientX - rect.left) / rect.width - 0.5;
  const fy = clientY === undefined ? 0 : (clientY - rect.top) / rect.height - 0.5;
  zoom = Math.min(3, Math.max(1, next));
  const after = mapViewSize();
  mapCenter.x += fx * (before.width - after.width);
  mapCenter.y += fy * (before.height - after.height);
  applyZoom();
}
$("zoomin").onclick = () => setZoom(zoom + 0.25);
$("zoomout").onclick = () => setZoom(zoom - 0.25);
$("zoomfit").onclick = () => setZoom(1);
$("mapscroll").addEventListener("wheel", (event) => {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
  const delta = Math.max(-200, Math.min(200, event.deltaY * unit));
  setZoom(zoom * Math.exp(-delta * 0.002), event.clientX, event.clientY);
}, { passive: false });

let mapDrag = null, suppressMapClick = false;
$("mapscroll").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  suppressMapClick = false;
  if (zoom <= 1) return;
  mapDrag = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    center: { ...mapCenter }, scale: mapViewSize().scale, moved: false,
  };
});
$("mapscroll").addEventListener("pointermove", (event) => {
  if (mapDrag?.id !== event.pointerId) return;
  const dx = event.clientX - mapDrag.x, dy = event.clientY - mapDrag.y;
  if (!mapDrag.moved && Math.hypot(dx, dy) < 5) return;
  mapDrag.moved = true;
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("is-panning");
  mapCenter.x = mapDrag.center.x - dx * mapDrag.scale;
  mapCenter.y = mapDrag.center.y - dy * mapDrag.scale;
  applyZoom();
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"])
  $("mapscroll").addEventListener(type, (event) => {
    if (!mapDrag || (type === "pointerleave" && mapDrag.moved)) return;
    suppressMapClick = mapDrag.moved && type !== "pointercancel";
    mapDrag = null;
    event.currentTarget.classList.remove("is-panning");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  });
$("mapscroll").addEventListener("click", (event) => {
  if (!suppressMapClick || event.detail === 0) return;
  suppressMapClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);
new ResizeObserver(applyZoom).observe($("mapscroll"));
$("expandboard").onclick = () => {
  boardExpanded = !boardExpanded;
  document.body.classList.toggle("board-expanded", boardExpanded);
  $("expandboard").innerHTML = boardExpanded
    ? "✕ <span>Cerrar</span>"
    : "⛶ <span>Ampliar</span>";
  $("expandboard").setAttribute("aria-label", boardExpanded ? "Cerrar tablero ampliado" : "Ampliar el tablero");
  setZoom(1);
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && boardExpanded) $("expandboard").click();
});
$("goMap").onclick = () =>
  document
    .querySelector(".boardcard")
    .scrollIntoView({ behavior: "smooth", block: "start" });
$("goCards").onclick = () =>
  $("handdock")
    .scrollIntoView({ behavior: "smooth", block: "start" });
$("goBuild").onclick = () =>
  document
    .querySelectorAll(".sidebar .sidepanel")[2]
    .scrollIntoView({ behavior: "smooth", block: "start" });
setInterval(() => {
  if (sock?.readyState === WebSocket.OPEN && room) send({ type: "ping" });
}, 180000);
if (desiredRoom && localStorage.getItem(identityKey(desiredRoom))) {
  attempted = true;
}
connect();
