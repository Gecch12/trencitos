"use strict";
const $ = (id) => document.getElementById(id);
const C = GameUI.ROUTE_COLORS;
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
let sessionReplaced = false, storagePaused = false, pendingAction = null, resendPending = false, sessionSupported = false;
const MAP_BOUNDS = RailMap.bounds;
const MAP_GEOMETRY = RailMap.createNetwork(ROUTES);
const MAP_CENTER = { x: MAP_BOUNDS.x + MAP_BOUNDS.width / 2, y: MAP_BOUNDS.y + MAP_BOUNDS.height / 2 };
const TICKET_COLORS = ["#b48916", "#c64e48", "#357bb5", "#32815b"];
let zoom = 1,
  mapCenter = { ...MAP_CENTER };
let labelPriority = [];
let hoveredPlayer = null, focusedPlayer = null;
let displayedLogs = null;
let displayedHistoryKey = null;
let hoveredDestination = null, focusedDestination = null;
let historyFollowing = true, lastDrawId = null;
let lastEffectId = null, serverOffset = 0, seenOfferId = null;
let waitingForGameStart = false;
let retainedVisible = new Set();
const effectTimers = new Set();
const cardFlights = new Set();
const constructionFlights = new Map();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let uiDialog = null, dialogReturnFocus = null, buildTarget = null, buildSubmitting = false;
let resultsSeen = false, resultMapSelection = null;
const expandedResults = new Set();
let toastTimer = null;
const ticketColor = i => TICKET_COLORS[i % TICKET_COLORS.length];
let pendingChoiceKey = null,
  ticketChoices = new Set(),
  hoveredTicket = null,
  focusedTicket = null,
  desiredRoom = new URLSearchParams(location.search).get("room") || "";
$("code").value = desiredRoom.toUpperCase();
const recoveryToken = new URLSearchParams(location.hash.slice(1)).get("recover");
let incomingRecovery = null;
if (recoveryToken && /^[a-f0-9]{48}$/.test(recoveryToken) && /^[a-z0-9]{6}$/i.test(desiredRoom)) {
  desiredRoom = desiredRoom.toUpperCase();
  incomingRecovery = recoveryToken;
  attempted = true;
}
if (location.hash) history.replaceState(null, "", location.pathname + location.search);
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
  if (game) toast(s);
  buildSubmitting = false;
  if ($("confirmBuild")) $("confirmBuild").disabled = false;
  if ($("acceptTunnel")) $("acceptTunnel").disabled = !GameUI.tunnelPayments(game.hand, game.tunnel).length;
  if ($("declineTunnel")) $("declineTunnel").disabled = false;
}
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 4000);
}
function identityKey(code) {
  return "rr-room-" + code;
}
function resetToLobby(message = "", preserveIdentity = false) {
  if (!preserveIdentity && (room || desiredRoom)) localStorage.removeItem(identityKey(room || desiredRoom));
  room = desiredRoom = token = "";
  game = null;
  seat = -1;
  members = [];
  host = practiceMode = attempted = false;
  pendingAction = null; storagePaused = false;
  $("sessionControls").classList.add("hidden");
  $("sessionNotice").classList.add("hidden");
  selected = stationCity = null;
  zoom = 1;
  mapCenter = { ...MAP_CENTER };
  pendingChoiceKey = null;
  ticketChoices.clear();
  document.body.classList.remove("is-playing");
  uiDialog = buildTarget = null;
  resultsSeen = false; resultMapSelection = null; expandedResults.clear();
  $("resultContext").classList.add("hidden");
  buildSubmitting = false;
  closeMapMenu();
  displayedLogs = null;
  displayedHistoryKey = null;
  hoveredDestination = focusedDestination = null;
  cancelConstruction();
  updateDestinationSpotlight();
  historyFollowing = true;
  lastDrawId = null;
  lastEffectId = seenOfferId = null;
  waitingForGameStart = false;
  cancelCardFlights();
  stopSounds();
  $("historyEntries").replaceChildren();
  $("history").scrollTop = 0;
  $("historyLatest").classList.add("hidden");
  $("serverWarning").classList.add("hidden");
  $("toast").classList.add("hidden");
  clearTimeout(toastTimer);
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
  if (sessionReplaced) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  sock = new WebSocket(proto + "//" + location.host + "/socket");
  status("Conectando…");
  sock.onopen = () => {
    resendPending = true;
    lastDrawId = null; // The reconnect snapshot is not a new draw.
    lastEffectId = null;
    status("● Conectado");
    if (attempted && desiredRoom) {
      let t = incomingRecovery || localStorage.getItem(identityKey(desiredRoom));
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
      pendingAction = null;
      if (["ROOM_NOT_FOUND", "INVALID_TOKEN"].includes(m.code)) {
        incomingRecovery = null;
        resetToLobby(m.message, m.code === "INVALID_TOKEN");
        return;
      }
      error(m.message);
      return;
    }
    if (m.type === "room_closed") {
      resetToLobby(m.message || "", !!m.preserveIdentity);
      return;
    }
    if (m.type === "session_replaced") {
      sessionReplaced = true; pendingAction = null;
      notice("Esta partida está abierta en otra pestaña. Aquí no tienes el control.", "takeOver");
      return;
    }
    if (m.type === "storage") {
      storagePaused = m.paused;
      if (storagePaused) notice(m.requiresRestart
        ? "Partida pausada por el guardado remoto. El administrador debe restablecer el servicio; conserva esta pestaña para reconectar."
        : "Partida pausada: el servidor no pudo guardar. No se aceptarán jugadas hasta recuperarlo.", m.requiresRestart ? null : "retrySave");
      else if (!sessionReplaced) $("sessionNotice").classList.add("hidden");
      return;
    }
    if (m.type === "ack") {
      if (pendingAction?.id === m.id) pendingAction = null;
      return;
    }
    if (m.type === "lobby") {
      if (!m.started) waitingForGameStart = true;
      room = m.code;
      desiredRoom = room;
      seat = m.seat;
      token = m.token;
      incomingRecovery = null;
      members = m.members;
      host = m.host;
      practiceMode = !!m.practice;
      sessionSupported = m.sessionVersion >= 1;
      $("sessionControls").classList.toggle("hidden", practiceMode || !sessionSupported);
      $("reclaimControl").classList.toggle("hidden", !members[seat]?.autopilot);
      $("reclaimControl").disabled = !!members[seat]?.reclaim;
      $("reclaimControl").textContent = members[seat]?.reclaim ? "Volverás en tu siguiente turno" : "Recuperar control";
      localStorage.setItem(identityKey(room), token);
      localStorage.setItem("rr-name", $("nickname").value);
      history.replaceState(null, "", "/?room=" + room);
      renderLobby();
      if (resendPending) { resendPending = false; if (pendingAction) send(pendingAction); }
      return;
    }
    if (m.type === "state") {
      const effects = prepareEffects(m.game), oldTurn = game?.turnSerial, oldOffer = game?.ticketOffer;
      if (oldOffer && oldOffer.id !== m.game.ticketOffer?.id) localStorage.removeItem(`rr-choice-${room}-${seat}-${oldOffer.id}`);
      if (game?.initial && !m.game.initial) localStorage.removeItem(`rr-choice-${room}-${seat}-initial-${game.initial.map(t => t.id).join("-")}`);
      game = m.game;
      serverOffset = (game.serverNow || Date.now()) - Date.now();
      closeMapMenu();
      if (uiDialog === "build" && (buildSubmitting || oldTurn !== game.turnSerial || !amIUp())) {
        uiDialog = buildTarget = null;
        buildSubmitting = false;
      }
      if (game.ticketOffer && seenOfferId !== game.ticketOffer.id) {
        seenOfferId = game.ticketOffer.id; uiDialog = "tickets";
      } else if (uiDialog === "tickets" && !game.ticketOffer) {
        uiDialog = null; pendingChoiceKey = null; $("overlay").classList.add("hidden");
      }
      if (game.turnWaiting && game.current === seat && game.ticketOffer) uiDialog = "tickets";
      selected = null;
      stationCity = null;
      render();
      if (game.phase === "finished") cancelCardFlights();
      playEffects(effects);
      return;
    }
  };
  sock.onclose = () => {
    cancelCardFlights();
    cancelConstruction();
    stopSounds();
    status(sessionReplaced ? "Otra pestaña" : "○ Desconectado");
    if (sessionReplaced) return;
    if (practiceMode) renderPracticeControls();
    setTimeout(() => {
      if (!sessionReplaced && (!sock || sock.readyState === WebSocket.CLOSED)) {
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
        `<div class="member"><b>${i + 1}. ${escapeHTML(m.name)} ${m.bot ? "🤖" : m.host ? "👑" : ""}</b><span class="${m.connected ? "connected" : "disconnected"}">${m.bot ? "Automático" : m.connected ? "● En línea" : "○ Sin conexión · reserva 60 s"}</span>${host && !game && i !== seat && !practiceMode ? `<button type="button" data-kick="${i}" aria-label="Retirar a ${escapeHTML(m.name)}">Retirar</button>` : ""}</div>`,
    )
    .join("");
  $("members").querySelectorAll("[data-kick]").forEach(button => button.onclick = () => {
    if (confirm("¿Retirar a este participante de la sala?")) send({ type: "kick", seat: +button.dataset.kick });
  });
  $("start").classList.toggle("hidden", practiceMode || !host || !!game);
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
  waitingForGameStart = true;
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
  send({ type: "start" });
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
function notice(message, action) {
  $("sessionNotice").classList.remove("hidden");
  $("sessionNotice").querySelector("span").textContent = message;
  for (const id of ["takeOver", "retrySave"]) $(id).classList.toggle("hidden", id !== action);
}
$("takeOver").onclick = () => {
  sessionReplaced = false; attempted = true; desiredRoom = room;
  $("sessionNotice").classList.add("hidden"); connect();
};
$("retrySave").onclick = () => send({ type: "retry_save" });
$("copyRecovery").onclick = async () => {
  const url = location.origin + "/?room=" + room + "#recover=" + encodeURIComponent(token);
  try { await navigator.clipboard.writeText(url); toast("Enlace privado copiado. Guárdalo solo para ti."); }
  catch { prompt("Tu enlace privado de recuperación (no lo compartas)", url); }
};
$("rotateRecovery").onclick = () => {
  if (confirm("¿Invalidar el enlace privado anterior? Después copia y guarda el nuevo.")) send({ type: "rotate_token" });
};
$("reclaimControl").onclick = () => send({ type: "reclaim" });
$("leaveRoom").onclick = () => {
  if (!game || game.phase === "finished" || confirm("¿Salir de la partida? Un bot tomará tu puesto. Si todos salen, la partida se abandonará tras 60 segundos sin conexiones.")) send({ type: "leave" });
};
function act(type, other = {}) {
  if (sessionReplaced || storagePaused || members[seat]?.autopilot) { error("No tienes el control de este puesto."); return; }
  if (pendingAction) return;
  if (sock?.readyState !== WebSocket.OPEN) { error("Sin conexión."); return; }
  // Let an already running older server finish its games before it is restarted.
  if (!sessionSupported) { send({ type: "action", action: { type, ...other } }); return; }
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  pendingAction = { type: "action", id, revision: game.revision, action: { type, ...other } };
  send(pendingAction);
}
function amIUp() {
  return !sessionReplaced && !storagePaused && sock?.readyState === WebSocket.OPEN && !members[seat]?.autopilot && game && game.current === seat && game.phase === "play" && !game.turnWaiting;
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
    b.setAttribute("aria-label", `${N[c]}: ${count} carta${count === 1 ? "" : "s"}`);
    b.title = `${N[c]} · ${count}`;
    const tag = document.createElement("span");
    tag.className = "cardcount";
    const times = document.createElement("small");
    times.textContent = "×";
    tag.append(times, document.createTextNode(String(count)));
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
function playerInsignia(index) {
  const mark = GameUI.playerMark(index);
  return `<svg class="player-insignia" viewBox="-4 -4 8 8" aria-hidden="true"><path d="${mark.path}"/></svg>`;
}
function playerAvatar(index, compact = false) {
  return `<span class="player-avatar${compact ? " history-avatar" : ""}" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="5"/><path d="M7 27v-4a9 9 0 0 1 18 0v4Z"/></svg>${compact ? "" : `<span class="avatar-insignia">${playerInsignia(index)}</span>`}</span>`;
}
function render() {
  if (!game) return;
  document.body.classList.add("is-playing");
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  renderPracticeControls();
  $("serverWarning").classList.toggle("hidden", game.uiVersion >= 5 && sessionSupported);
  const active = amIUp();
  const previousFocus = document.activeElement.closest("[data-player]")?.dataset.player;
  const previousHover = $("scores").querySelector(".scorebadge:hover")?.dataset.player;
  $("scores").innerHTML = game.players
    .map(
      (x, i) =>
        `<div class="scorebadge ${i === game.current && ["play", "tunnel"].includes(game.phase) ? "active" : ""}" data-player="${i}" tabindex="0" aria-label="${escapeHTML(x.name)}. Símbolo: ${GameUI.playerMark(i).name}. ${game.result?.find(r => r.seat === i)?.score ?? x.score} puntos, ${x.trains} vagones, ${x.stations} estaciones. Enfoca para resaltar sus rutas.">
          <div class="player-heading">${playerAvatar(i)}<div class="player-details"><b title="${escapeHTML(x.name)}">${escapeHTML(x.name)}</b><span class="player-state">${[i === seat ? "Tú" : "", members[i]?.autopilot ? "Bot de reemplazo" : !members[i]?.connected ? "Sin conexión" : "", game.phase === "initial" ? (x.initialReady ? "✓ Listo" : "Eligiendo billetes") : i === game.current && ["play", "tunnel"].includes(game.phase) ? (game.turnWaiting ? 'Eligiendo billetes <span class="turn-clock" data-clock="waiting"></span>' : 'En turno <span class="turn-clock" data-clock="turn"></span>') : ""].filter(Boolean).join(" · ")}</span></div></div>
          <div class="player-metrics">${playerMetric("points", "Puntos", game.result?.find(r => r.seat === i)?.score ?? x.score)}${playerMetric("trains", "Vagones", x.trains)}${playerMetric("stations", "Estaciones", x.stations)}</div>
        </div>`,
    )
    .join("");
  hoveredPlayer = previousHover === undefined ? null : +previousHover;
  focusedPlayer = previousFocus === undefined ? null : +previousFocus;
  [...$("scores").children].forEach((badge, i) => {
    badge.style.setProperty("--player-color", GameUI.playerColor(game.players[i].color));
    badge.addEventListener("pointerenter", () => { hoveredPlayer = i; highlightPlayerRoutes(); });
    badge.addEventListener("pointerleave", () => { hoveredPlayer = null; highlightPlayerRoutes(); });
    badge.addEventListener("focus", () => { focusedPlayer = i; highlightPlayerRoutes(); });
    badge.addEventListener("blur", () => { focusedPlayer = null; highlightPlayerRoutes(); });
  });
  if (previousFocus !== undefined) $("scores").querySelector(`[data-player="${previousFocus}"]`)?.focus({ preventScroll: true });
  $("turntitle").textContent =
    game.phase === "finished"
      ? "Partida terminada"
      : game.phase === "initial"
        ? "Elección inicial"
        : active
          ? "Tu turno"
          : `Turno de ${game.players[game.current].name}`;
  $("roundStatus").textContent = game.phase === "finished" ? "Final" : game.phase === "initial" ? `${game.initialReadyCount}/${game.players.length} listos` : game.finalRemaining !== null ? "Última ronda" : "";
  $("initialStatus").classList.toggle("hidden", game.phase !== "initial");
  $("initialStatusText").textContent = `${game.initialReadyCount}/${game.players.length} listos · ${game.players[seat].initialReady ? "Puedes explorar el mapa mientras esperas" : "Todos eligen a la vez"}`;
  $("viewResults").classList.toggle("hidden", game.phase !== "finished");
  if (game.phase === "closing") $("roundStatus").innerHTML = 'Últimos billetes <span data-clock="closing"></span>';
  $("hand").innerHTML = "";
  for (const c of [...COLORS, "wild"]) {
    let n = game.hand.filter((x) => x === c).length;
    if (n) $("hand").appendChild(colorCard(c, n, null, false));
  }
  if (!game.hand.length) $("hand").innerHTML = '<span class="smallmuted">Aún no tienes cartas de tren.</span>';
  $("handCount").textContent = `${game.hand.length} cartas`;
  $("ticketTotal").textContent = game.tickets.length;
  renderDestinations();
  layoutHand();
  const blindDeck = $("drawblind");
  const visibleCards = Array.from({ length: 5 }, (_, i) => {
    const c = game.face[i];
    if (!c) { const empty = document.createElement("div"); empty.className = "empty-market-slot"; empty.setAttribute("aria-label", "Sin carta disponible"); return empty; }
    const card = colorCard(c, null, () => act("draw_train", { index: i }), !drawAllowed() || (c === "wild" && game.drawCount === 1));
    card.dataset.marketIndex = i;
    card.title = `Robar ${N[c]}${c === "wild" ? " · Consume los dos robos; no puede ser tu segunda carta" : ""}`;
    card.setAttribute("aria-label", card.title);
    return card;
  });
  $("market").replaceChildren(...visibleCards, blindDeck);
  $("drawblind").disabled =
    !drawAllowed() || game.deckCount + game.discardCount === 0;
  $("drawtickets").disabled =
    !active || game.drawCount > 0 || !game.ticketDeckCount || !!game.ticketOffer;
  $("pendingTickets").classList.toggle("hidden", !game.ticketOffer);
  $("deckinfo").textContent =
    `${game.deckCount} cartas ocultas · ${game.ticketDeckCount} destinos por robar`;
  $("drawstats").textContent = active ? `${game.drawCount}/2` : "";
  $("drawstats").setAttribute("aria-label", active ? `${game.drawCount} de 2 robos usados` : "");
  $("pass").classList.toggle("hidden", !GameUI.canPass(game, seat, Object.keys(CITIES)));
  renderHistory();
  renderBoard();
  renderDialog();
  applyZoom();
  updateClocks();
}
function updateClocks() {
  if (!game) return;
  const deadlines = { initial: game.initialDeadline, turn: game.turnDeadline, offer: game.ticketOffer?.deadline, waiting: game.waitingDeadline, closing: game.closingDeadline };
  for (const node of document.querySelectorAll("[data-clock]")) {
    const deadline = deadlines[node.dataset.clock], seconds = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now() - serverOffset) / 1000)) : null;
    node.textContent = seconds === null ? "" : `${seconds}s`;
    node.classList.toggle("clock-urgent", seconds !== null && seconds <= 5);
    node.setAttribute("aria-label", seconds === null ? "" : `${seconds} segundos restantes`);
  }
}
setInterval(updateClocks, 250);
$("pendingTickets").onclick = () => { if (game?.ticketOffer) { uiDialog = "tickets"; showTicketDialog(game.ticketOffer.tickets, 1); } };
function renderHistory() {
  const logs = game.logs, list = $("history"), entries = $("historyEntries");
  const history = game.history || logs.map(text => ({ text, seat: null }));
  const historyKey = JSON.stringify(history);
  if (displayedHistoryKey === historyKey) return;
  displayedHistoryKey = historyKey;
  const readingOlder = displayedLogs?.length && !historyFollowing;
  const rows = [...entries.children], top = list.getBoundingClientRect().top;
  const index = rows.findIndex(row => row.getBoundingClientRect().bottom > top);
  const offset = index < 0 ? 0 : rows[index].getBoundingClientRect().top - top;
  const anchorIndex = GameUI.historyAnchorIndex(displayedLogs || [], logs, index);
  entries.replaceChildren(...[...history].reverse().map(entry => {
    const row = document.createElement("div");
    const player = Number.isInteger(entry.seat) && game.players[entry.seat];
    if (player) {
      row.innerHTML = playerAvatar(entry.seat, true);
      row.style.setProperty("--player-color", GameUI.playerColor(player.color));
      row.dataset.actor = entry.seat;
    }
    const text = document.createElement("span"); text.textContent = entry.text; row.appendChild(text);
    return row;
  }));
  if (!logs.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Esperando el primer movimiento";
    entries.appendChild(empty);
  }
  if (readingOlder) {
    const anchor = entries.children[anchorIndex];
    list.scrollTop += anchor ? anchor.getBoundingClientRect().top - top - offset : -list.scrollTop;
    $("historyLatest").classList.remove("hidden");
  } else list.scrollTop = list.scrollHeight;
  displayedLogs = [...logs];
  updateHistoryScroll();
}
function updateHistoryScroll() {
  const list = $("history"), bar = $("historyScrollbar"), thumb = $("historyThumb");
  const max = Math.max(0, list.scrollHeight - list.clientHeight);
  historyFollowing = max - list.scrollTop < 3;
  if (historyFollowing) $("historyLatest").classList.add("hidden");
  bar.classList.toggle("hidden", max <= 1);
  const size = Math.min(list.clientHeight, Math.max(24, list.clientHeight ** 2 / Math.max(1, list.scrollHeight)));
  const fraction = max ? Math.max(0, Math.min(1, list.scrollTop / max)) : 1;
  thumb.style.height = `${size}px`;
  thumb.style.top = `${fraction * (list.clientHeight - size)}px`;
  bar.setAttribute("aria-valuenow", Math.round(fraction * 100));
}
$("history").addEventListener("scroll", updateHistoryScroll);
$("historyLatest").onclick = () => { $("history").scrollTop = $("history").scrollHeight; updateHistoryScroll(); $("history").focus({ preventScroll: true }); };
const historyResize = new ResizeObserver(() => {
  if (historyFollowing) $("history").scrollTop = $("history").scrollHeight;
  updateHistoryScroll();
});
historyResize.observe($("history"));
let historyDrag = null;
$("historyScrollbar").addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  event.preventDefault();
  const bar = event.currentTarget, list = $("history"), thumb = $("historyThumb");
  bar.focus({ preventScroll: true });
  const travel = bar.clientHeight - thumb.offsetHeight;
  if (event.target !== thumb && travel > 0) list.scrollTop = (event.clientY - bar.getBoundingClientRect().top - thumb.offsetHeight / 2) / travel * (list.scrollHeight - list.clientHeight);
  historyDrag = { id: event.pointerId, y: event.clientY, top: list.scrollTop };
  bar.setPointerCapture(event.pointerId);
});
$("historyScrollbar").addEventListener("pointermove", event => {
  if (historyDrag?.id !== event.pointerId) return;
  const list = $("history"), travel = event.currentTarget.clientHeight - $("historyThumb").offsetHeight;
  if (travel > 0) list.scrollTop = historyDrag.top + (event.clientY - historyDrag.y) / travel * (list.scrollHeight - list.clientHeight);
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) $("historyScrollbar").addEventListener(type, () => { historyDrag = null; });
$("historyScrollbar").addEventListener("wheel", event => {
  event.preventDefault();
  $("history").scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $("history").clientHeight : 1);
}, { passive: false });
$("historyScrollbar").addEventListener("keydown", event => {
  const list = $("history");
  const delta = { ArrowUp: -32, ArrowDown: 32, PageUp: -list.clientHeight, PageDown: list.clientHeight, Home: -list.scrollHeight, End: list.scrollHeight }[event.key];
  if (delta === undefined) return;
  event.preventDefault(); list.scrollTop += delta;
});

function prepareEffects(next) {
  const events = next.events || [];
  const fresh = lastEffectId === null ? (waitingForGameStart ? events.filter(e => e.type === "turn").slice(-1) : []) : events.filter(e => e.id > lastEffectId);
  waitingForGameStart = false;
  lastEffectId = Math.max(lastEffectId || 0, ...events.map(e => e.id));
  if (document.hidden) return [];
  return fresh.map(e => {
    const source = e.type === "draw" ? (e.index === -1 ? $("drawblind") : $("market").querySelector(`[data-market-index="${e.index}"]`)) : null;
    return { ...e, source: source?.getBoundingClientRect() };
  });
}
function playEffects(events) {
  let drawDelay = 0;
  for (const event of events) {
    if (event.type === "draw") {
      const timer = setTimeout(() => {
        effectTimers.delete(timer);
        if (document.hidden || game?.phase === "finished") return;
        playSound("card");
        if (!reducedMotion.matches && event.source?.width) animateCardFlight(event);
      }, drawDelay);
      effectTimers.add(timer); drawDelay += 180;
    } else if (event.type === "tickets") playSound("card");
    else if (event.type === "build") animateConstruction(event);
    else if (event.type === "turn" && event.seat === seat) playSound("bell");
  }
}
// Small original synthesized effects: no external audio, tracking or downloads.
let soundContext = null, muted = localStorage.getItem("rr-muted") === "true";
const soundNodes = new Set();
function soundLabel() {
  $("soundToggle").innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3Z"/>${muted ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
  $("soundToggle").setAttribute("aria-pressed", String(muted));
  $("soundToggle").title = muted ? "Activar sonidos" : "Silenciar sonidos";
  $("soundToggle").setAttribute("aria-label", $("soundToggle").title);
}
function unlockSound() {
  if (muted) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try { soundContext ||= new Context(); soundContext.resume().catch(() => {}); } catch (_) {}
}
function stopSounds() { for (const node of soundNodes) { try { node.stop(); } catch (_) {} } soundNodes.clear(); }
$("soundToggle").onclick = () => { muted = !muted; localStorage.setItem("rr-muted", String(muted)); soundLabel(); if (muted) stopSounds(); else unlockSound(); };
document.addEventListener("pointerdown", unlockSound, { passive: true });
document.addEventListener("keydown", unlockSound);
soundLabel();
function playSound(kind) {
  if (muted || document.hidden || soundContext?.state !== "running") return;
  const ctx = soundContext, at = ctx.currentTime;
  const tone = (frequency, duration, volume, type = "sine") => {
    const source = ctx.createOscillator(), gain = ctx.createGain();
    source.type = type; source.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(gain).connect(ctx.destination); source.start(at); source.stop(at + duration);
    soundNodes.add(source); source.onended = () => { soundNodes.delete(source); source.disconnect(); gain.disconnect(); };
  };
  if (kind === "bell") { tone(880, .7, .085); tone(1760, .42, .035); tone(2376, .2, .012); return; }
  if (kind === "build") { tone(155, .16, .14 * 1.15, "triangle"); tone(310, .09, .045 * 1.15); }
  const duration = kind === "card" ? .19 : .065;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  source.buffer = buffer; filter.type = "bandpass"; filter.frequency.setValueAtTime(kind === "card" ? 2200 : 650, at); filter.Q.value = .7;
  gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(kind === "card" ? .19 : .16 * 1.15, at + .018); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(filter).connect(gain).connect(ctx.destination); source.start(at); source.stop(at + duration);
  soundNodes.add(source); source.onended = () => { soundNodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
}
function cancelCardFlights() {
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers.clear();
  for (const flight of cardFlights) { flight.animations.forEach(a => a.cancel()); flight.node.remove(); }
  cardFlights.clear();
}
function animateCardFlight(event) {
  const own = event.seat === seat;
  const color = N[event.color] ? event.color : null;
  const targetSelector = own && color ? `#hand .suit-${color}` : `#scores [data-player="${event.seat}"] .player-avatar`;
  const target = document.querySelector(targetSelector);
  if (!target || (own && !color)) return;
  const end = target.getBoundingClientRect(), start = event.source;
  const node = document.createElement("div");
  node.className = "draw-flight";
  node.setAttribute("aria-hidden", "true");
  Object.assign(node.style, { left: `${start.x}px`, top: `${start.y}px`, width: `${start.width}px`, height: `${start.height}px` });
  const face = document.createElement("div"); face.className = "draw-flight-face"; node.appendChild(face);
  const image = (suit, cls = "") => {
    const img = document.createElement("img"); img.src = `assets/cards/${suit}.svg`; img.alt = ""; img.className = cls; face.appendChild(img);
  };
  const reveal = own && event.index === -1;
  if (reveal) { image("back"); image(color, "draw-flight-front"); }
  else image(color || "back"); // A rival's blind event contains no color at all.
  document.body.appendChild(node);
  const dx = end.x + end.width / 2 - start.x - start.width / 2;
  const dy = end.y + end.height / 2 - start.y - start.height / 2;
  const scale = (own ? end.width : 24) / start.width;
  const motion = node.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * .52}px,${dy * .52 - 32}px) scale(1.04)`, offset: .5, opacity: 1 },
    { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: own ? 1 : .2 },
  ], { duration: 750, easing: "cubic-bezier(.22,.65,.28,1)", fill: "forwards" });
  const animations = [motion];
  if (reveal) animations.push(face.animate([
    { transform: "rotateY(0deg)" }, { transform: "rotateY(0deg)", offset: .18 },
    { transform: "rotateY(180deg)", offset: .65 }, { transform: "rotateY(180deg)" },
  ], { duration: 750, fill: "forwards" }));
  const flight = { node, animations }; cardFlights.add(flight);
  motion.onfinish = () => {
    node.remove(); cardFlights.delete(flight);
    const landing = document.querySelector(targetSelector);
    const pulseTarget = own ? landing?.querySelector(".cardcount") : landing;
    if (pulseTarget && !reducedMotion.matches) pulseTarget.animate([
      { transform: "scale(1)" }, { transform: "scale(1.15)", offset: .45 }, { transform: "scale(1)" },
    ], { duration: 180 });
  };
}
function constructionTarget(event) {
  return event.routeId !== undefined ? $("board").querySelector(`[data-route-id="${event.routeId}"]`) : $("board").querySelector(`[data-city="${event.city}"]`);
}
function animateConstruction(event) {
  if (reducedMotion.matches || document.hidden || !constructionTarget(event)) { playSound("build"); return; }
  const flight = { event, started: performance.now(), animations: [], band: null };
  constructionFlights.set(event.id, flight);
  bindConstruction(flight);
  flight.timer = setTimeout(() => {
    if (!constructionFlights.delete(event.id)) return;
    flight.animations.forEach(a => a.cancel());
    flight.band?.style.removeProperty("opacity");
    const band = constructionTarget(event)?.querySelector(".ownership-band");
    if (band && !reducedMotion.matches) band.animate([{ opacity: 0 }, { opacity: .3 }], { duration: 180, easing: "ease-out" });
    playSound("build");
  }, 500);
}
function bindConstruction(flight) {
  flight.animations.forEach(a => a.cancel()); flight.animations = [];
  flight.band?.style.removeProperty("opacity");
  const target = constructionTarget(flight.event), scale = mapViewSize()?.scale || 1;
  flight.band = target?.querySelector(".ownership-band");
  if (flight.band) flight.band.style.opacity = "0";
  for (const node of target?.querySelectorAll(".owned-piece, .station-piece") || []) {
    // Counter-rotate the lift so every wagon descends vertically on screen,
    // even on curved/diagonal routes. Rebind at the same time after a redraw.
    const angle = +(node.parentElement.dataset.angle || 0) * Math.PI / 180;
    const dx = -Math.sin(angle) * 26 * scale, dy = -Math.cos(angle) * 26 * scale;
    const motion = node.animate([
      { transform: `translate(${dx}px,${dy}px)`, filter: "drop-shadow(0 4px 2px #16313a50)" },
      { transform: "translate(0,0)", filter: "drop-shadow(0 .7px .4px #162f4270)" },
    ], { duration: 500, easing: "ease-in-out", fill: "both" });
    motion.currentTime = Math.min(500, performance.now() - flight.started);
    flight.animations.push(motion);
  }
}
function cancelConstruction() {
  for (const flight of constructionFlights.values()) {
    clearTimeout(flight.timer); flight.animations.forEach(a => a.cancel()); flight.band?.style.removeProperty("opacity");
  }
  constructionFlights.clear();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelCardFlights(); cancelConstruction(); stopSounds(); } });
window.addEventListener("resize", () => { cancelCardFlights(); cancelConstruction(); });
reducedMotion.addEventListener("change", () => { cancelCardFlights(); cancelConstruction(); });
function layoutHand() {
  const cards = [...$("hand").querySelectorAll(".traincard")];
  if (!cards.length) return;
  const width = cards[0].getBoundingClientRect().width;
  const available = $("hand").clientWidth - 12;
  const step = cards.length === 1 ? width : Math.min(width + 10, (available - width) / (cards.length - 1));
  cards.forEach((card, i) => { card.style.marginRight = i === cards.length - 1 ? "0" : `${step - width}px`; });
}
function renderDestinations() {
  const content = game.tickets.map(t => {
    const status = GameUI.destinationStatus(game, t.id);
    const hint = !status ? "Progreso no disponible: el backend no envía este dato. Reinícialo al terminar la partida." : status.completed ? status.viaStation ? "Conectado usando una estación. Puntos al final de la partida." : "Conectado. Puntos al final de la partida." : "Destino pendiente";
    return `<button type="button" class="destination-row ${status?.completed ? "is-complete" : ""}" data-destination="${t.id}" title="${hint} · Ver en el mapa"><span class="destination-endpoints">${escapeHTML(CITIES[t.a][2])} <span aria-hidden="true">→</span> ${escapeHTML(CITIES[t.b][2])}</span><strong>${t.p}<span class="sr-only"> puntos</span></strong>${!status ? '<span class="destination-unknown" aria-label="Progreso no disponible">?</span>' : status.completed ? '<span class="destination-check" aria-label="Completado">✓</span>' : '<span class="destination-pending" aria-label="Pendiente">·</span>'}</button>`;
  }).join("") || '<p class="smallmuted">Elige tus billetes iniciales.</p>';
  // Keep the user's scroll position while bots act or a new card arrives.
  if ($("ticketList").innerHTML !== content) {
    const focus = document.activeElement.closest("#ticketList [data-destination]")?.dataset.destination;
    const top = $("ticketList").scrollTop;
    $("ticketList").innerHTML = content;
    if (focus !== undefined) $("ticketList").querySelector(`[data-destination="${focus}"]`)?.focus({ preventScroll: true });
    $("ticketList").scrollTop = top;
  }
}
function playerMetric(type, label, value) {
  const icons = {
    points: '<path d="M7 3h10v5a5 5 0 0 1-10 0ZM7 4H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 13v5m-4 2h8"/>',
    trains: '<rect x="3" y="4" width="18" height="11" rx="2"/><path d="M7 8h3m4 0h3M2 13h20"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    stations: '<path d="m2 9 10-7 10 7M5 8v13h14V8M9 21v-7h6v7M10 8h4"/>',
  };
  return `<span class="player-metric" title="${label}: ${value}" aria-label="${label}: ${value}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[type]}</svg><strong aria-hidden="true">${value}</strong></span>`;
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
  const texture = el("pattern", { id: `${prefix}-piece-grain`, width: 3, height: 3, patternUnits: "userSpaceOnUse" }, defs);
  el("path", { d: "M0 3L3 0", stroke: "#132d36", "stroke-width": .25, opacity: .22 }, texture);
  el("circle", { cx: .6, cy: .8, r: .23, fill: "#fff9df", opacity: .45 }, texture);
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
function drawFerryGlyph(el, parent) {
  const g = el("g", { class: "ferry-mark", fill: "#405351", stroke: "#405351", "stroke-width": 0.3, "pointer-events": "none" }, parent);
  el("path", {
    d: "M-7 2V-2H-3V-4H0V-1H5L8 2ZM-6-3V-5H-3V-3Z",
  }, g);
  for (const x of [-4, 4]) el("circle", { cx: x, cy: 3, r: 1.5 }, g);
}
function highlightPlayerRoutes() {
  const requested = hoveredPlayer ?? focusedPlayer;
  const owner = requested !== null && game?.routes.some(r => r.owner === requested) ? requested : null;
  for (const group of $("board").querySelectorAll(".route-group")) {
    group.classList.toggle("owner-highlight", owner !== null && group.dataset.owner === String(owner));
    group.classList.toggle("owner-muted", owner !== null && group.dataset.owner !== String(owner));
  }
}
function drawOwnedPiece(el, slot, cell, owner, prefix) {
  const color = owner.color, x = (cell.width - 1.2) / 2, h = cell.height - 1;
  const top = -h / 2 - .5, bottom = h / 2 - .5;
  const piece = el("g", { class: "owned-piece", "pointer-events": "none", "aria-hidden": "true" }, slot);
  el("rect", { x: -x, y: top + 1.15, width: x * 2, height: h, rx: 1.2, fill: "#243b42", stroke: "#17313a", "stroke-width": .6 }, piece);
  const shape = `M${-x + 1} ${top}H${x - 1}L${x} ${top + 1}V${bottom - 1}L${x - 1} ${bottom}H${-x + 1}L${-x} ${bottom - 1}V${top + 1}Z`;
  el("path", { d: shape, fill: color, stroke: "#344d50", "stroke-width": .4 }, piece);
  el("path", { d: shape, fill: `url(#${prefix}-piece-grain)` }, piece);
  el("path", { d: `M${-x + .8} ${bottom - 1}V${top + 1}H${x - .8}`, fill: "none", stroke: "#fff8d8", "stroke-opacity": .68, "stroke-width": .85 }, piece);
  el("path", { d: `M${-x + .8} ${bottom - .7}H${x - .8}V${top + 1}`, fill: "none", stroke: "#173640", "stroke-opacity": .6, "stroke-width": .8 }, piece);
  for (const gx of [-x + 3, x - 3]) {
    el("path", { d: `M${gx} ${top + 1.2}V${bottom - 1.1}`, stroke: "#172a30", "stroke-opacity": .5, "stroke-width": .9 }, piece);
    el("path", { d: `M${gx + .7} ${top + 1.2}V${bottom - 1.1}`, stroke: "#fffce5", "stroke-opacity": .65, "stroke-width": .55 }, piece);
  }
  el("path", { class: "ownership-mark", d: owner.mark.path, "data-symbol": owner.mark.name,
    transform: `translate(0 -.5) rotate(${-cell.angle}) scale(${GameUI.OWNER_MARK_SCALE})` }, piece);
}
function drawStation(el, parent, color, scale = 1) {
  const piece = el("g", { class: "station-piece", "pointer-events": "none" }, parent);
  const art = el("g", { class: "station-art", transform: `scale(${scale})` }, piece);
  const outline = "M-7 6V-2L-9-2 0-9 9-2H7V6Z";
  el("path", { d: outline, transform: "translate(0 1)", fill: "#17323b", opacity: .3 }, art);
  el("path", { d: outline, fill: color, stroke: "#fff9e6", "stroke-width": 3, "stroke-linejoin": "round" }, art);
  el("path", { d: outline, fill: color, stroke: "#243e45", "stroke-width": 1, "stroke-linejoin": "round" }, art);
  el("path", { d: "M-8-2 0-8 8-2M-6-1H6", fill: "none", stroke: "#17333c", "stroke-width": 1.4, "stroke-linejoin": "round" }, art);
  el("path", { d: "M-5-3 0-7 5-3", fill: "none", stroke: "#fff8dc", "stroke-width": .7, opacity: .7 }, art);
  el("path", { d: "M-1.8 6V1H1.8V6M-5 0H-3V2H-5ZM3 0H5V2H3Z", fill: "#fff7d8", stroke: "#243e45", "stroke-width": .6 }, art);
  el("path", { d: "M-8 6H8", stroke: "#243e45", "stroke-width": 1.6, "stroke-linecap": "round" }, art);
  return piece;
}
function updateStationScale() {
  const view = mapViewSize(); if (!view) return;
  // 18 px wide at overview scale; proportional to the board when zoomed in.
  for (const art of $("board").querySelectorAll(".station-art")) art.setAttribute("transform", `scale(${Math.max(.8, view.scale)})`);
}
function renderBoard() {
  const svg = $("board");
  svg.replaceChildren();
  const el = svgElements(svg);
  drawMapBase(el, "board");
  const guides = el("g", { class: "rail-guides" });
  for (const r of game.routes) {
    const geometry = MAP_GEOMETRY[r.id];
    const owner = GameUI.routeOwner(game, r, seat), owned = owner !== null;
    const color = owned ? owner.color : C[r.color];
    const description = `${routeSummaryText(r)}${owned ? ` · ${owner.label} · Símbolo: ${owner.mark.name}` : ""}`;
    const group = el("g", {
      class: `route-group${owned ? " is-owned" : ""}${selected === r.id ? " is-selected" : ""}`,
      "data-route-id": r.id,
      "data-owner": owned ? r.owner : "",
      role: "button", tabindex: 0, "aria-label": description,
    });
    if (owned) group.style.setProperty("--owner-color", color);
    // A pale separation under each track makes geometric crossings unambiguous.
    el("path", { d: geometry.d, class: "route-separation", fill: "none", stroke: "#f2eddc", "stroke-width": 12, "stroke-linecap": "round" }, guides);
    el("path", { d: geometry.d, class: "route-guide", fill: "none", stroke: "#8c9991", "stroke-width": 0.8, opacity: 0.45 }, guides);
    if (owned) el("path", { d: geometry.d, class: "ownership-band", fill: "none", stroke: color, "stroke-width": 11.5, opacity: .3, "stroke-linecap": "round", "pointer-events": "none" }, group);
    geometry.cells.forEach((cell, i) => {
      const slot = el("g", {
        class: "train-slot", transform: `translate(${cell.x} ${cell.y}) rotate(${cell.angle})`,
        "data-angle": cell.angle,
      }, group);
      if (r.tunnel) el("path", {
        class: "tunnel-mark", d: "M-8-4.8V-6.2M-3-4.8V-6.2M2-4.8V-6.2M7-4.8V-6.2M-8 4.8V6.2M-3 4.8V6.2M2 4.8V6.2M7 4.8V6.2",
        stroke: "#384b4f", "stroke-width": 2, fill: "none",
      }, slot);
      el("rect", {
        class: "train-space", x: -cell.width / 2, y: -cell.height / 2,
        width: cell.width, height: cell.height, rx: 1.6,
        fill: owned ? "#f9f4e7" : color, stroke: selected === r.id ? "#db921e" : "#405351",
        "stroke-width": selected === r.id ? 2.2 : 0.9,
      }, slot);
      if (owned) {
        drawOwnedPiece(el, slot, cell, owner, "board");
      }
      else if (i < r.ferry) drawFerryGlyph(el, slot);
    });
    el("title", {}, group).textContent = description;
    el("path", {
      d: geometry.d, class: "route-hit", fill: "none", stroke: "transparent",
      "stroke-width": 11, "pointer-events": "stroke",
    }, group);
    const selectRoute = event => {
      selected = r.id;
      stationCity = null;
      showMapMenu(event, { routeId: r.id });
    };
    group.addEventListener("click", selectRoute);
    prioritizeCityLabels(group, [r.a, r.b]);
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRoute(event); }
    });
  }
  for (const [key, [x, y]] of Object.entries(RailMap.cities)) {
    const occupant = game.players.findIndex(p => p.placed.includes(key));
    const group = el("g", { transform: `translate(${x} ${y})`, class: "city-node", "data-city": key,
      role: "button", tabindex: 0, "aria-label": `${CITIES[key][2]}${occupant >= 0 ? ` · Estación de ${game.players[occupant].name}` : " · Ver ciudad"}` });
    el("circle", { r: 6.6, fill: "#fffdf1", opacity: 0.9 }, group);
    el("circle", {
      r: 4.4, fill: "#f9f4e6",
      stroke: stationCity === key ? "#bd6b38" : "#6b7972",
      "stroke-width": stationCity === key ? 2.3 : 1.3, class: "city-circle",
    }, group);
    el("title", {}, group).textContent = `${CITIES[key][2]}${occupant >= 0 ? ` · Estación de ${game.players[occupant].name}` : ""}`;
    const selectCity = event => {
      stationCity = key;
      selected = null;
      showMapMenu(event, { city: key });
    };
    group.addEventListener("click", selectCity);
    prioritizeCityLabels(group, [key]);
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCity(event); }
    });
    if (occupant >= 0) drawStation(el, group, GameUI.playerColor(game.players[occupant].color));
  }
  const names = el("g", { class: "city-names", "pointer-events": "none" });
  for (const key of Object.keys(RailMap.cities)) {
    const group = el("g", { "data-city-label": key }, names);
    el("line", { class: "city-leader", stroke: "#6e8078", "stroke-width": 0.8 }, group);
    el("text", { class: "city-label" }, group).textContent = CITIES[key][2];
  }
  updateStationScale();
  updateCityLabels();
  highlightPlayerRoutes();
}
function prioritizeCityLabels(element, cities) {
  for (const type of ["pointerenter", "focus"]) element.addEventListener(type, () => {
    labelPriority = cities;
    updateCityLabels();
  });
  for (const type of ["pointerleave", "blur"]) element.addEventListener(type, () => {
    labelPriority = [];
    updateCityLabels();
  });
}
function updateCityLabels() {
  const view = mapViewSize();
  if (!view) return;
  const viewport = $("mapscroll");
  const origin = { x: view.x, y: view.y };
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
  for (const player of game.players) for (const city of player.placed) {
    const [x, y] = screen(RailMap.cities[city]), scale = Math.max(.8 / view.scale, 1);
    obstacles.push({ x: x - 10 * scale, y: y - 11 * scale, width: 20 * scale, height: 20 * scale });
  }
  const chosenRoute = game?.routes.find(r => r.id === selected);
  const important = new Set([...labelPriority, ...(chosenRoute ? [chosenRoute.a, chosenRoute.b] : []), stationCity]);
  let displayed = entries;
  if (zoom < .75 || view.scale > 1.5) {
    // At overview scale, a few nearby labels are useful; a cloud of leaders isn't.
    displayed = GameUI.overviewLabels(entries, important);
    const keys = new Set(displayed.map(entry => entry.key));
    for (const entry of entries) if (!keys.has(entry.key)) groups.get(entry.key).style.display = "none";
  }
  const placements = RailMap.placeLabels(displayed, viewport.clientWidth, viewport.clientHeight, obstacles, { height: 18, baseline: 13 });
  for (const box of placements) {
    const g = groups.get(box.key), city = RailMap.cities[box.key], [sx, sy] = screen(city);
    const dx = box.x - sx, dy = box.y - sy;
    // Inverse camera scale: font, halo, label offsets and leaders stay in CSS px.
    g.setAttribute("transform", `translate(${city[0]} ${city[1]}) scale(${view.scale})`);
    const text = g.querySelector("text");
    text.setAttribute("x", dx);
    text.setAttribute("y", dy + 13);
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
function closeMapMenu() {
  $("mapMenu").classList.add("hidden");
  for (const route of $("board").querySelectorAll(".is-selected")) route.classList.remove("is-selected");
}
function showMapMenu(event, target) {
  event.stopPropagation();
  const sourceElement = event.currentTarget;
  closeMapMenu();
  const r = target.routeId === undefined ? null : game.routes.find(r => r.id === target.routeId);
  const stationOwner = target.city === undefined ? -1 : game.players.findIndex(p => p.placed.includes(target.city));
  const owner = r ? GameUI.routeOwner(game, r, seat) : stationOwner < 0 ? null : { seat: stationOwner, color: GameUI.playerColor(game.players[stationOwner].color), label: `Estación de ${game.players[stationOwner].name}` };
  const stationsLeft = game.players[seat].stations;
  const canBuild = !owner && amIUp() && !game.drawCount && (r || stationsLeft > 0);
  const title = r ? `${CITIES[r.a][2]} — ${CITIES[r.b][2]}` : CITIES[target.city][2];
  const detail = r ? `${routeRequirementText(r)}${r.tunnel ? " · Túnel" : ""}${r.ferry ? " · Ferri" : ""}`
    : stationsLeft > 0 ? `Estación · ${plural(4 - stationsLeft, "carta")} del mismo color` : "Ya construiste tus 3 estaciones";
  const menu = $("mapMenu");
  menu.innerHTML = `<button class="menu-close" aria-label="Cerrar menú">×</button><h3>${escapeHTML(title)}</h3>${owner
    ? `<p class="route-ownership"><span class="owner-seal">${playerInsignia(owner.seat)}</span><span>${escapeHTML(owner.label)}</span></p>`
    : `<p>${escapeHTML(detail)}</p>${canBuild ? `<button id="startBuild" class="primary full">${r ? "Construir" : "Construir estación"}</button>` : ""}`}`;
  if (owner) menu.style.setProperty("--owner-color", owner.color);
  else menu.style.removeProperty("--owner-color");
  menu.classList.remove("hidden");
  const stage = $("game").getBoundingClientRect(), source = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || source.x + source.width / 2, y = event.clientY || source.y + source.height / 2;
  menu.style.left = Math.max(8, Math.min(x - stage.x + 12, stage.width - menu.offsetWidth - 12)) + "px";
  menu.style.top = Math.max(8, Math.min(y - stage.y + 8, stage.height - menu.offsetHeight - 12)) + "px";
  event.currentTarget.classList.add("is-selected");
  menu.querySelector(".menu-close").onclick = () => { closeMapMenu(); sourceElement.focus({ preventScroll: true }); };
  if (!canBuild) { menu.querySelector(".menu-close").focus({ preventScroll: true }); return; }
  $("startBuild").onclick = () => {
    const result = GameUI.construction(game, seat, target);
    if (result.reason) { toast(result.reason); return; }
    dialogReturnFocus = document.querySelector(r ? `[data-route-id="${r.id}"]` : `[data-city="${target.city}"]`);
    buildTarget = target;
    uiDialog = "build";
    closeMapMenu();
    showBuildDialog();
  };
  $("startBuild").focus({ preventScroll: true });
}
function showBuildDialog() {
  const result = GameUI.construction(game, seat, buildTarget);
  if (result.reason) { closeOptionalDialog(); toast(result.reason); return; }
  const { route: r, options } = result;
  showDialog(r ? "Construir ruta" : "Construir estación",
    `<p>${escapeHTML(r ? routeSummaryText(r) : `Estación en ${CITIES[buildTarget.city][2]} · ${plural(result.cost, "carta")} del mismo color`)}</p>
    <label for="paycolor">Color de pago</label><select id="paycolor"></select>
    <label for="wildcount">Locomotoras a utilizar</label><select id="wildcount"></select>
    <div id="paymentPreview" class="payment-preview" aria-live="polite"></div>
    <p>${r?.tunnel ? "Puedes pagar el coste inicial. Se revelarán 3 cartas: si hay un suplemento, podrás pagarlo o desistir (esto termina tu turno)." : r?.ferry ? `El pago incluye al menos ${r.ferry} locomotora(s) obligatoria(s).` : "Las locomotoras pueden sustituir cartas de color."}</p>
    <button id="confirmBuild" class="primary full">${r?.tunnel ? "Intentar construir túnel" : "Confirmar construcción"}</button>
    <button id="cancelBuild" class="tertiary full">Cancelar</button>`, false, true);
  $("paycolor").innerHTML = [...new Set(options.map(o => o.color))].map(c => `<option value="${c}">${N[c]}</option>`).join("");
  const updatePreview = () => {
    const chosen = options.find(o => o.color === $("paycolor").value && o.wild === +$("wildcount").value);
    const preview = $("paymentPreview");
    preview.replaceChildren();
    if (chosen.regular) preview.appendChild(colorCard(chosen.color, chosen.regular));
    if (chosen.wild) preview.appendChild(colorCard("wild", chosen.wild));
    const caption = document.createElement("span");
    caption.textContent = `${result.cost} carta(s) en total${r ? ` · ${r.n} vagones` : ""}`;
    preview.appendChild(caption);
  };
  const updatePayment = () => {
    $("wildcount").innerHTML = options.filter(o => o.color === $("paycolor").value)
      .map(o => `<option value="${o.wild}">${o.wild} locomotora(s)</option>`).join("");
    updatePreview();
  };
  $("paycolor").onchange = updatePayment;
  $("wildcount").onchange = updatePreview;
  $("cancelBuild").onclick = closeOptionalDialog;
  $("confirmBuild").onclick = () => {
    if (buildSubmitting) return;
    const validation = GameUI.construction(game, seat, buildTarget);
    if (validation.reason) { toast(validation.reason); return; }
    if (!sock || sock.readyState !== WebSocket.OPEN) return error("Sin conexión.");
    buildSubmitting = true;
    $("confirmBuild").disabled = true;
    act(r ? "claim" : "station", { ...buildTarget, color: $("paycolor").value, wildCount: +$("wildcount").value });
  };
  updatePayment();
  $("paycolor").focus({ preventScroll: true });
}
$("drawblind").onclick = () => act("draw_train", { index: -1 });
$("drawtickets").onclick = () => act("draw_tickets");
$("pass").onclick = () => act("pass");
function showDialog(title, body, ticketDialog = false, dismissible = false) {
  closeMapMenu();
  $("overlay").classList.remove("hidden");
  $("dialog").classList.toggle("ticket-dialog", ticketDialog);
  $("dialog").classList.remove("tunnel-dialog", "results-dialog");
  $("dialog").setAttribute("aria-labelledby", "dialogTitle");
  $("dialog").innerHTML =
    `${dismissible ? '<button class="dialog-close" aria-label="Cerrar ventana">×</button>' : ""}<h2 id="dialogTitle" tabindex="-1">${title}</h2>${body}<p class="err" id="errorMsg"></p>`;
  if (dismissible) $("dialog").querySelector(".dialog-close").onclick = closeOptionalDialog;
  $("dialogTitle").focus({ preventScroll: true });
  updateDestinationSpotlight();
}
function closeOptionalDialog() {
  if (!uiDialog) return;
  if (game?.turnWaiting && game.current === seat && game.ticketOffer) return;
  const choosing = uiDialog === "tickets";
  const closingResults = uiDialog === "results";
  uiDialog = buildTarget = null;
  buildSubmitting = false;
  if (!choosing) pendingChoiceKey = null;
  $("overlay").classList.add("hidden");
  (dialogReturnFocus?.isConnected ? dialogReturnFocus : $(closingResults ? "viewResults" : "viewRoutes")).focus({ preventScroll: true });
  dialogReturnFocus = null;
  updateDestinationSpotlight();
}
function openRoutes(ticketId, source = $("viewRoutes")) {
  if (!game) return;
  uiDialog = "routes";
  pendingChoiceKey = null;
  dialogReturnFocus = source;
  showTicketDialog(game.tickets, 0, true);
  if (ticketId !== undefined) {
    ticketChoices = new Set(game.tickets.flatMap((t, i) => t.id === ticketId ? [i] : []));
    for (const input of $("dialog").querySelectorAll("input.keep")) input.checked = ticketChoices.has(+input.value);
    updateTicketSelection(game.tickets, 0);
  }
}
$("viewRoutes").onclick = () => openRoutes();
$("ticketList").onclick = event => {
  const row = event.target.closest("[data-destination]");
  if (row) openRoutes(+row.dataset.destination, row);
};
for (const type of ["pointerover", "pointerout", "focusin", "focusout"]) $("ticketList").addEventListener(type, event => {
  const row = event.target.closest("[data-destination]");
  if (!row || row.contains(event.relatedTarget)) return;
  const id = +row.dataset.destination;
  if (type === "pointerover") hoveredDestination = id;
  if (type === "pointerout") hoveredDestination = null;
  if (type === "focusin") focusedDestination = id;
  if (type === "focusout") focusedDestination = null;
  updateDestinationSpotlight();
});
function updateDestinationSpotlight() {
  for (const label of $("board").querySelectorAll("[data-city-label]")) label.style.removeProperty("opacity");
  let overlay = $("destinationSpotlight");
  if (!overlay) {
    overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.id = "destinationSpotlight"; overlay.setAttribute("aria-hidden", "true");
    $("mapscroll").appendChild(overlay);
  }
  const ticket = game?.tickets.find(t => t.id === (hoveredDestination ?? focusedDestination));
  const path = ticket ? game.ticketPaths?.find(p => p.id === ticket.id) : null;
  const selection = !uiDialog && $("overlay").classList.contains("hidden") && (ticket ? { endpoints: [ticket.a, ticket.b], routes: path?.routes || [], stationRoutes: path?.stationRoutes || [], stations: path?.stations || [] } : resultMapSelection);
  overlay.classList.toggle("is-visible", !!selection);
  if (!selection) return;
  const view = mapViewSize(); if (!view) return;
  const rect = $("mapscroll").getBoundingClientRect(), safe = mapSafeArea(rect);
  overlay.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`); overlay.replaceChildren();
  const el = svgElements(overlay);
  // The sidebar includes transparent headings/gaps: leave its entire column
  // untouched, not just its opaque cards.
  el("rect", { width: safe.x + safe.width + 8, height: rect.height, fill: "#102c38", opacity: .66 });
  const context = el("g", { transform: `scale(${1 / view.scale}) translate(${-view.x} ${-view.y})`, class: "completed-connection" });
  for (const id of selection.routes || []) {
    const geometry = MAP_GEOMETRY[id]; if (!geometry) continue;
    const borrowed = selection.stationRoutes?.includes(id);
    el("path", { d: geometry.d, class: "connection-halo", fill: "none", stroke: "#ffe08a", "stroke-width": 16, opacity: .85, "stroke-linecap": "round", ...(borrowed ? { "stroke-dasharray": "5 5" } : {}), "data-connection-route": id, "data-borrowed": !!borrowed }, context);
    const original = $("board").querySelector(`[data-route-id="${id}"]`);
    if (original) {
      const copy = original.cloneNode(true);
      copy.setAttribute("class", "connection-pieces");
      for (const node of [copy, ...copy.querySelectorAll("*")]) for (const attr of ["tabindex", "role", "data-route-id", "aria-label"]) node.removeAttribute(attr);
      copy.querySelector(".route-hit")?.remove(); context.appendChild(copy);
    }
  }
  for (const station of selection.stations || []) {
    const [x, y] = RailMap.cities[station.city];
    const marker = el("g", { transform: `translate(${x} ${y})`, "data-connection-station": station.city }, context);
    el("circle", { r: 12 * Math.max(.8, view.scale), fill: "#ffdd7c", opacity: .65 }, marker);
    drawStation(el, marker, GameUI.playerColor(game.players[station.seat].color), Math.max(.8, view.scale));
  }
  const placements = [];
  for (const key of new Set(selection.endpoints || [])) {
    $("board").querySelector(`[data-city-label="${key}"]`)?.style.setProperty("opacity", "0");
    const [wx, wy] = RailMap.cities[key];
    const p = GameUI.endpointPosition({ x: (wx - view.x) / view.scale, y: (wy - view.y) / view.scale }, safe);
    const marker = el("g", { class: "destination-beacon", "data-endpoint": key, "data-offscreen": p.outside });
    el("circle", { cx: p.x, cy: p.y, r: 13, fill: "#f9df8b", opacity: .2 }, marker);
    el("circle", { cx: p.x, cy: p.y, r: 8, fill: "#fff9df", stroke: "#e4bd59", "stroke-width": 2 }, marker);
    if (p.outside) el("path", { d: "M-2-3L2 0-2 3", fill: "none", stroke: "#24444e", "stroke-width": 1.7, transform: `translate(${p.x} ${p.y}) rotate(${p.angle})` }, marker);
    else el("circle", { cx: p.x, cy: p.y, r: 3.5, fill: "#24444e" }, marker);
    const label = el("text", { class: "destination-beacon-label" }, marker); label.textContent = CITIES[key][2];
    const width = label.getComputedTextLength();
    const x = Math.max(safe.x + 4, Math.min(p.x - width / 2, safe.x + safe.width - width - 4));
    let y = p.y + 28;
    if (y > safe.y + safe.height - 6) y = p.y - 18;
    if (placements.some(b => Math.abs(b.y - y) < 22 && x < b.x + b.width + 8 && x + width + 8 > b.x)) y = p.y - 18;
    label.setAttribute("x", x); label.setAttribute("y", y); placements.push({ x, y, width });
  }
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
  const viewing = uiDialog === "routes";
  const retained = !viewing && game.ticketOffer ? game.tickets.map((ticket, index) => ({ ticket, i: tickets.length + index, key: `owned-${ticket.id}`, active: retainedVisible.has(ticket.id), retained: true })) : [];
  const visible = [...tickets.map((ticket, i) => ({ ticket, i, key: i, active: ticketChoices.has(i) })), ...retained]
    .filter(entry => entry.active || preview === entry.key || viewing || entry.retained);
  const highlights = el("g", { class: "ticket-paths" });
  const occupied = el("g", { class: "ticket-occupied" });
  for (const route of game.routes.filter(r => r.owner !== null)) {
    const owner = GameUI.routeOwner(game, route, seat), geometry = MAP_GEOMETRY[route.id];
    const group = el("g", { opacity: route.owner === seat ? 1 : .3, "data-occupied-route": route.id }, occupied);
    el("title", {}, group).textContent = `${CITIES[route.a][2]} — ${CITIES[route.b][2]} · ${owner.name}`;
    el("path", { d: geometry.d, fill: "none", stroke: owner.color, "stroke-width": 11.5, opacity: .3, "stroke-linecap": "round" }, group);
    for (const cell of geometry.cells) {
      const slot = el("g", { transform: `translate(${cell.x} ${cell.y}) rotate(${cell.angle})` }, group);
      drawOwnedPiece(el, slot, cell, owner, "tickets");
    }
  }
  for (const [i, player] of game.players.entries()) for (const city of player.placed) {
    const [x, y] = RailMap.cities[city], group = el("g", { transform: `translate(${x} ${y})`, opacity: i === seat ? 1 : .55, "data-preview-station": city }, occupied);
    drawStation(el, group, GameUI.playerColor(player.color), .9);
    el("title", {}, group).textContent = `Estación de ${player.name} · ${CITIES[city][2]}`;
  }
  const endpoints = new Map();
  for (const { ticket, i, key, active } of visible) {
    const [x, y] = RailMap.cities[ticket.a], [xx, yy] = RailMap.cities[ticket.b];
    const strong = active || preview === key;
    const opacity = !strong ? .25 : preview !== null && preview !== key ? .5 : 1;
    const completed = GameUI.destinationStatus(game, ticket.id)?.completed;
    const path = completed ? game.ticketPaths?.find(p => p.id === ticket.id) : null;
    for (const routeId of path?.routes || []) {
      const borrowed = path.stationRoutes.includes(routeId);
      const trace = el("path", { d: MAP_GEOMETRY[routeId].d, fill: "none", stroke: borrowed ? "#c69643" : "#e7b639", "stroke-width": 15, opacity: opacity * .75, "stroke-linecap": "round", ...(borrowed ? { "stroke-dasharray": "4 4" } : {}), "data-completed-ticket": ticket.id, "data-path-route": routeId }, highlights);
      el("title", {}, trace).textContent = borrowed ? "Tramo prestado mediante estación" : "Conexión completada";
    }
    const g = el("g", {
      class: "ticket-connection", "data-ticket-index": i,
      opacity,
    });
    el("title", {}, g).textContent =
      `${CITIES[ticket.a][2]} → ${CITIES[ticket.b][2]} · ${ticket.p} puntos`;
    const line = { x1: x, y1: y, x2: xx, y2: yy, "stroke-linecap": "round" };
    if (!path?.routes.length) {
      el("line", { ...line, stroke: "#fffefa", "stroke-width": 6 }, g);
      el("line", {
      ...line, stroke: ticketColor(i), "stroke-width": 2.8,
      "stroke-dasharray": "6 6", class: "ticket-connector",
      }, g);
    }
    // A number as well as a color keeps overlapping destinations identifiable.
    const middle = path?.routes.length ? MAP_GEOMETRY[path.routes[Math.floor(path.routes.length / 2)]].cells : null;
    const mid = middle?.[Math.floor(middle.length / 2)];
    const mx = mid?.x ?? (x + xx) / 2, my = mid?.y ?? (y + yy) / 2;
    el("circle", { cx: mx, cy: my, r: 11, fill: ticketColor(i), stroke: "#fffefa", "stroke-width": 2 }, g);
    el("text", { x: mx, y: my + 4, "text-anchor": "middle", class: "ticket-map-number" }, g).textContent = i + 1;
    for (const city of strong ? [ticket.a, ticket.b] : []) {
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
      stroke: ticketColor(i), "stroke-width": 2.5, "data-ticket-index": i,
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
  $("ticketCount").textContent = min ? `${count} de ${tickets.length} seleccionados · mínimo ${min}` : `${count} de ${tickets.length} resaltados en el mapa`;
  if ($("keep")) $("keep").disabled = count < min;
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.classList.toggle("is-selected", ticketChoices.has(i));
    row.classList.toggle("is-preview", (hoveredTicket ?? focusedTicket) === i);
  }
  for (const row of $("dialog").querySelectorAll("[data-ticket-id]")) {
    const status = GameUI.destinationStatus(game, +row.dataset.ticketId);
    row.classList.toggle("is-complete", !!status?.completed);
    row.querySelector(".ticket-complete").textContent = status?.completed ? `✓ Completada${status.viaStation ? " · estación" : ""}` : "";
  }
  renderTicketMap(tickets);
  updateClocks();
}
function showTicketDialog(tickets, min, viewing = false) {
  const choosing = !viewing && !!game.ticketOffer;
  const draftKey = `rr-choice-${room}-${seat}-${choosing ? game.ticketOffer.id : "initial-" + tickets.map(t => t.id).join("-")}`;
  const waiting = choosing && game.turnWaiting && game.current === seat;
  const key = JSON.stringify([room, seat, viewing ? "view" : choosing ? game.ticketOffer.id : "initial", tickets.map(t => t.id)]);
  if (pendingChoiceKey === key && $("ticketMap") && $("dialog").dataset.waiting === String(waiting) && !$("overlay").classList.contains("hidden")) { updateTicketSelection(tickets, min); return; }
  if (pendingChoiceKey !== key) {
    ticketChoices = new Set(viewing ? tickets.map((_, i) => i) : []);
    retainedVisible = new Set();
    if (!viewing) {
      try { const draft = JSON.parse(localStorage.getItem(draftKey)); if (Array.isArray(draft)) ticketChoices = new Set(draft.filter(i => Number.isInteger(i) && tickets[i])); } catch (_) {}
    }
    pendingChoiceKey = key;
  }
  hoveredTicket = focusedTicket = null;
  showDialog(
    viewing ? "Tus rutas de destino" : game.phase === "initial" ? "Elige tus billetes iniciales" : "Nuevos billetes de destino",
    `<p class="ticket-intro">${viewing ? "Tus vías construidas y el recorrido de tus destinos completados. Resaltar no descarta billetes." : `Conserva al menos ${min} billete${min > 1 ? "s" : ""}. Tus destinos permanecerán secretos hasta el final.`}</p>
    ${!viewing ? `<div class="ticket-deadline"><strong data-clock="${choosing ? "offer" : "initial"}"></strong><span>${waiting ? "Primero elige tus billetes. Después tendrás 60 segundos completos para tu nuevo turno." : choosing ? "La partida continúa. Sin confirmar, conservarás 1 billete al azar." : "Todos eligen a la vez, con un minuto compartido. Sin confirmar, conservarás 2 billetes al azar."}</span>${choosing && !waiting ? '<button type="button" id="minimizeTickets">Elegir después ↗</button>' : ""}</div>` : ""}
    <div class="ticket-layout">
      <figure class="ticket-map-panel">
        <svg id="ticketMap" viewBox="${MAP_BOUNDS.x} ${MAP_BOUNDS.y} ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}" role="img" aria-label="Vista de los destinos seleccionados" aria-describedby="ticketMapCaption"></svg>
        <figcaption id="ticketMapCaption">Tus fichas siempre visibles · Dorado: conexión completada · Discontinuas: objetivos o tramos prestados</figcaption>
      </figure>
      <div class="ticket-options">
        <p class="ticket-options-title">${viewing ? "Tus destinos" : "Billetes para conservar"}</p>
        <p class="ticket-options-hint">Pasa el cursor para comparar. ${viewing ? "Marca los que quieras resaltar." : "Las casillas eligen qué conservar; confirma abajo."}</p>
        <div class="ticket-collections"><div class="ticket-choices">${tickets.map((t, i) => `
          <label class="choice ticket-choice" data-ticket-index="${i}" data-ticket-id="${t.id}">
            <input type="checkbox" class="keep" value="${i}" ${ticketChoices.has(i) ? "checked" : ""}>
            <span class="ticket-number" aria-hidden="true">${i + 1}</span>
            <span class="ticket-choice-text"><b>${escapeHTML(CITIES[t.a][2])} → ${escapeHTML(CITIES[t.b][2])}</b><small>${t.p} puntos ${t.long ? '<span class="longtag">LARGA</span>' : ""}</small><small class="ticket-complete"></small></span>
          </label>`).join("") || '<p>Todavía no has conservado billetes.</p>'}</div>
        ${choosing && game.tickets.length ? `<div class="retained-heading">Tus destinos actuales <small>Solo comparar</small></div><div class="retained-choices">${game.tickets.map((t,i) => `<div class="retained-choice" data-ticket-id="${t.id}" data-owned-ticket="${t.id}"><button class="ticket-eye" type="button" aria-pressed="${retainedVisible.has(t.id)}" aria-label="Resaltar ${escapeHTML(CITIES[t.a][2])} a ${escapeHTML(CITIES[t.b][2])}">◉</button><span class="ticket-number">${tickets.length+i+1}</span><span class="ticket-choice-text"><b>${escapeHTML(CITIES[t.a][2])} → ${escapeHTML(CITIES[t.b][2])}</b><small>${t.p} puntos</small><small class="ticket-complete"></small></span></div>`).join("")}</div>` : ""}</div>
        <div class="ticket-confirm">
          <p id="ticketCount" role="status" aria-live="polite"></p>
          ${viewing ? '<button class="secondary full" id="closeRoutes">Volver al mapa</button>' : '<button class="primary full" id="keep" aria-describedby="ticketCount">Conservar seleccionados</button>'}
        </div>
      </div>
    </div>`,
    true,
    viewing || (choosing && !waiting),
  );
  $("dialog").dataset.waiting = String(waiting);
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.style.setProperty("--ticket-color", ticketColor(i));
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) ticketChoices.add(i);
      else ticketChoices.delete(i);
      if (!viewing) localStorage.setItem(draftKey, JSON.stringify([...ticketChoices]));
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
  for (const [index, row] of [...$("dialog").querySelectorAll("[data-owned-ticket]")].entries()) {
    const id = +row.dataset.ownedTicket, key = `owned-${id}`, button = row.querySelector("button");
    row.style.setProperty("--ticket-color", ticketColor(tickets.length + index));
    button.onclick = () => { retainedVisible.has(id) ? retainedVisible.delete(id) : retainedVisible.add(id); button.setAttribute("aria-pressed", String(retainedVisible.has(id))); row.classList.toggle("is-highlighted", retainedVisible.has(id)); updateTicketSelection(tickets, min); };
    for (const type of ["mouseenter", "mouseleave", "focusin", "focusout"]) row.addEventListener(type, () => {
      if (type === "mouseenter") hoveredTicket = key;
      if (type === "mouseleave") hoveredTicket = null;
      if (type === "focusin") focusedTicket = key;
      if (type === "focusout") focusedTicket = null;
      updateTicketSelection(tickets, min);
    });
  }
  if ($("minimizeTickets")) $("minimizeTickets").onclick = closeOptionalDialog;
  if (viewing) $("closeRoutes").onclick = closeOptionalDialog;
  else $("keep").onclick = () => {
    if (ticketChoices.size < min) return;
    act(game.phase === "initial" ? "choose_initial" : "keep_tickets", {
      indexes: [...ticketChoices].sort((a, b) => a - b),
      ...(choosing ? { offerId: game.ticketOffer.id } : {}),
    });
  };
  updateTicketSelection(tickets, min);
  $("dialogTitle").tabIndex = -1;
  $("dialogTitle").focus({ preventScroll: true });
}
function renderDialog() {
  if (!game) return;
  const myTurn = game.current === seat;
  if (myTurn && game.turnWaiting && game.ticketOffer) { uiDialog = "tickets"; showTicketDialog(game.ticketOffer.tickets, 1); return; }
  if (game.phase === "finished" && (!resultsSeen || uiDialog === "results")) { showResults(); return; }
  const mandatory = (game.phase === "initial" && game.initial?.length) || (myTurn && game.phase === "tunnel");
  if (mandatory && uiDialog) { uiDialog = null; pendingChoiceKey = null; }
  if (uiDialog === "routes") { showTicketDialog(game.tickets, 0, true); return; }
  if (uiDialog === "tickets" && game.ticketOffer) { showTicketDialog(game.ticketOffer.tickets, 1); return; }
  if (uiDialog === "build") return;
  if (!game.ticketOffer && (!myTurn || game.phase !== "initial")) pendingChoiceKey = null;
  if (game.phase === "initial" && game.initial?.length) {
    showTicketDialog(game.initial, 2);
    return;
  }
  if (!myTurn) {
    $("overlay").classList.add("hidden");
    return;
  }
  if (game.phase === "closing") {
    $("overlay").classList.add("hidden");
    return;
  }
  if (game.phase === "tunnel") {
    if (game.tunnel) showTunnelDialog();
    return;
  }
  $("overlay").classList.add("hidden");
}

const cityName = city => CITIES[city]?.[2] || city;
const routeName = route => `${cityName(route.a)} — ${cityName(route.b)}`;
const signedPoints = points => points >= 0 ? `+${points}` : `−${Math.abs(points)}`;
function resultDetailHTML(result) {
  const d = result.details;
  if (!d) return '<p>Reinicia el servidor actualizado para consultar el desglose de esta partida.</p>';
  const inspect = (kind, index, label) => `<button type="button" class="result-inspect" data-result-seat="${result.seat}" data-result-kind="${kind}" data-result-index="${index}" title="Resaltar en el mapa">${escapeHTML(label)} <span aria-hidden="true">↗</span></button>`;
  const sum = (label, points) => `<h4><span>${label}</span><strong>${signedPoints(points)}</strong></h4>`;
  const maximumNames = d.express.tiedSeats.map(i => game.players[i].name).join(", ");
  return `${sum("Rutas construidas", result.route)}<ul class="score-lines">${d.routes.map((r,i) => `<li><div>${inspect("route", i, routeName(r))}<small>${r.length} vagones → ${r.points} puntos</small></div><strong>+${r.points}</strong></li>`).join("") || '<li>Ninguna ruta construida.</li>'}</ul>
    ${d.routeAdjustment ? `<p class="score-warning">Ajuste del registro guardado: ${signedPoints(d.routeAdjustment)} puntos. El contador de esta partida antigua no coincide con sus rutas en el tablero.</p>` : ""}
    ${sum("Billetes de destino", result.destination)}<ul class="score-lines">${d.destinations.map((t,i) => `<li class="${t.completed ? "score-positive" : "score-negative"}"><div>${inspect("destination", i, routeName(t))}<small>${t.completed ? `✓ Completado${t.stationRoutes.length ? " · mediante estación" : ""}` : "No completado · penalización"}</small></div><strong>${signedPoints(t.points)}</strong></li>`).join("") || '<li>No se conservaron billetes.</li>'}</ul>
    ${sum("Estaciones", result.stations)}<p class="score-explanation">${d.stations.unused} sin construir × 4 puntos = <b>${result.stations}</b>. Las estaciones construidas no suman puntos; pueden completar destinos tomando prestado un tramo rival.</p>
    <ul class="score-lines">${d.stations.placed.map((station,i) => { const route = game.routes.find(r => r.id === station.routeId); return `<li><div>${inspect("station", i, `Estación en ${cityName(station.city)}`)}<small>${route ? `Préstamo: ${escapeHTML(routeName(route))} · ${escapeHTML(game.players[route.owner].name)}` : "Sin tramo prestado en la asignación final"}</small></div><strong>0</strong></li>`; }).join("")}</ul>
    ${sum("European Express", result.express)}<p class="score-explanation">${d.express.routes.length ? inspect("express", 0, `Camino más largo: ${result.longest} vagones`) : "Sin vías construidas: 0 vagones"}<br>${d.express.cities.length ? escapeHTML(d.express.cities.map(cityName).join(" → ")) + ". " : ""}Se suman los vagones de un recorrido continuo, sin repetir tramos. No cuenta vías prestadas por estaciones.</p>
    <p class="score-explanation">${result.express ? (d.express.tiedSeats.length > 1 ? `Empate en el máximo (${d.express.maximum}): ${escapeHTML(maximumNames)}. Cada uno recibe +10.` : `Máximo de la partida (${d.express.maximum}): +10 puntos.`) : `Sin bonificación: el máximo es ${d.express.maximum}, de ${escapeHTML(maximumNames)}.`}</p>
    <div class="score-equation" aria-label="Suma final">${result.route} ${signedPoints(result.destination)} ${signedPoints(result.stations)} ${signedPoints(result.express)} = <strong>${result.score} puntos</strong></div>`;
}
function showResults() {
  if (game?.phase !== "finished") return;
  uiDialog = "results"; resultsSeen = true;
  hoveredDestination = focusedDestination = null;
  showDialog(game.earlyFinish ? "Prueba terminada anticipadamente" : "Fin de partida",
    `<p>${game.earlyFinish ? "Puntuación del estado actual: solo cuentan los billetes ya conservados." : "La partida ha terminado. Explora el tablero y comprueba cómo se obtuvo cada punto."}</p>
    <div class="results-list">${game.result.map((r,i) => `<section class="result-card" data-result-player="${r.seat}"><div class="result-heading">${playerAvatar(r.seat)}<div><b>${i+1}. ${escapeHTML(r.name)} ${r.winner ? "🏆" : ""}</b><small>Rutas ${r.route} · Destinos ${r.destination} · Estaciones ${r.stations} · Express ${r.express}</small></div><strong>${r.score}<small>puntos</small></strong></div><details data-score-seat="${r.seat}" ${expandedResults.has(r.seat) ? "open" : ""}><summary>Desglose de puntos</summary><div class="score-breakdown">${resultDetailHTML(r)}</div></details></section>`).join("")}</div>
    <p class="result-rules">Empates en la clasificación: más destinos completados, después más estaciones sin construir y finalmente la bonificación Express. Si persiste, se comparte la victoria.</p>
    <div class="result-actions"><button id="exploreMap" class="primary">Explorar mapa</button>${practiceMode ? '<button id="practiceHome" class="tertiary">Volver al inicio</button>' : '<button id="rematch" class="tertiary">Revancha</button><button id="multiplayerHome" class="tertiary">Volver al inicio</button>'}</div>`, false, true);
  $("dialog").classList.add("results-dialog");
  for (const card of $("dialog").querySelectorAll("[data-result-player]")) card.style.setProperty("--player-color", GameUI.playerColor(game.players[+card.dataset.resultPlayer].color));
  for (const details of $("dialog").querySelectorAll("[data-score-seat]")) details.ontoggle = () => {
    const i = +details.dataset.scoreSeat;
    details.open ? expandedResults.add(i) : expandedResults.delete(i);
  };
  for (const button of $("dialog").querySelectorAll("[data-result-kind]")) button.onclick = () => {
    const result = game.result.find(r => r.seat === +button.dataset.resultSeat), d = result.details;
    const i = +button.dataset.resultIndex, kind = button.dataset.resultKind;
    let selection;
    if (kind === "route") { const r = d.routes[i]; selection = { routes: [r.id], endpoints: [r.a,r.b], title: routeName(r) }; }
    if (kind === "destination") { const t = d.destinations[i]; selection = { ...t, endpoints: [t.a,t.b], title: `${routeName(t)} · ${t.completed ? "Completado" : "No completado"}` }; }
    if (kind === "station") { const s = d.stations.placed[i]; selection = { routes: s.routeId === null ? [] : [s.routeId], stationRoutes: [s.routeId], stations: [s], endpoints: [s.city], title: `Estación en ${cityName(s.city)}` }; }
    if (kind === "express") selection = { routes: d.express.routes, endpoints: d.express.cities.length ? [d.express.cities[0], d.express.cities.at(-1)] : [], title: `Camino más largo · ${d.express.length} vagones` };
    resultMapSelection = selection;
    $("resultContext").classList.remove("hidden");
    $("resultContext").querySelector("span").textContent = `${result.name} · ${selection.title}`;
    closeOptionalDialog();
  };
  $("exploreMap").onclick = closeOptionalDialog;
  if (practiceMode) $("practiceHome").onclick = () => send({ type: "leave_test" });
  else {
    $("multiplayerHome").onclick = () => send({ type: "leave" });
    $("rematch").onclick = () => send({ type: "rematch" });
  }
}
$("viewResults").onclick = showResults;
$("resultContext").querySelector("button").onclick = () => {
  resultMapSelection = null; $("resultContext").classList.add("hidden"); updateDestinationSpotlight();
};

function paymentDescription(payment) {
  return [payment.regular ? `${payment.regular} de color ${N[payment.color].toLowerCase()}` : "",
    payment.wild ? `${payment.wild} locomotora${payment.wild === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
}
function paymentIcons(payment) {
  return [[payment.color, payment.regular], ["wild", payment.wild]].filter(([, n]) => n).map(([color, n]) =>
    `<span class="payment-chip"><img src="assets/cards/${color}.svg" alt="${N[color]}" draggable="false"><strong>×${n}</strong></span>`).join('<span class="payment-plus" aria-hidden="true">+</span>');
}
function showTunnelDialog() {
  const t = game.tunnel, route = game.routes.find(r => r.id === t.routeId);
  const options = GameUI.tunnelPayments(game.hand, t);
  const count = t.surcharge;
  showDialog(`Túnel: ${count} carta${count === 1 ? "" : "s"} adicional${count === 1 ? "" : "es"}`,
    `<p class="tunnel-route">${escapeHTML(CITIES[route.a][2])} — ${escapeHTML(CITIES[route.b][2])}</p>
    <div class="tunnel-evidence"><section><h3>Cartas reveladas</h3><div id="revealed" class="tunnel-revealed"></div></section>
      <section class="tunnel-base"><h3>Pago base reservado</h3><div class="payment-icons" aria-label="${paymentDescription(t.base)}">${paymentIcons(t.base)}</div><p>Aún no se ha gastado.</p></section></div>
    <fieldset class="tunnel-payments"><legend>${options.length > 1 ? "¿Cómo pagas el suplemento?" : "Pago del suplemento"}</legend>
      ${options.length ? `<div class="tunnel-options">${options.map((option, i) => options.length === 1
        ? `<div class="tunnel-option single"><div class="payment-icons">${paymentIcons(option)}</div><span>${paymentDescription(option)}</span></div>`
        : `<label class="tunnel-option"><input type="radio" name="tunnelPayment" value="${option.wild}" ${i === 0 ? "checked" : ""}><span><span class="payment-icons">${paymentIcons(option)}</span><span class="payment-label">${paymentDescription(option)}</span></span></label>`).join("")}</div>`
        : `<p class="tunnel-insufficient">No tienes cartas suficientes para el suplemento después de reservar el pago base.</p>`}
    </fieldset>
    <p id="tunnelTotal" class="tunnel-total" aria-live="polite"></p>
    <button class="primary full" id="acceptTunnel" ${options.length ? "" : "disabled"}>Pagar suplemento y construir</button>
    <button class="tertiary full" id="declineTunnel">Desistir del túnel</button>
    <p class="tunnel-exit-note">Al desistir conservas tus cartas, pero termina tu turno.</p>`);
  $("dialog").classList.add("tunnel-dialog");
  for (const c of t.revealed) {
    const match = c === "wild" || (t.color !== "wild" && c === t.color);
    const item = document.createElement("div");
    item.className = `tunnel-reveal${match ? " is-match" : ""}`;
    item.appendChild(colorCard(c, null));
    const caption = document.createElement("span");
    caption.className = "reveal-effect";
    caption.textContent = match ? "+1" : "—";
    caption.setAttribute("aria-label", match ? "Añade una carta al suplemento" : "No añade suplemento");
    item.appendChild(caption);
    $("revealed").appendChild(item);
  }
  const chosen = () => options.length === 1 ? options[0]
    : options.find(option => option.wild === +document.querySelector('input[name="tunnelPayment"]:checked')?.value);
  const total = () => {
    const payment = chosen();
    $("tunnelTotal").textContent = payment ? `Total al construir: ${paymentDescription({ color: t.color, regular: t.base.regular + payment.regular, wild: t.base.wild + payment.wild })}.` : "";
  };
  document.querySelectorAll('input[name="tunnelPayment"]').forEach(input => input.addEventListener("change", total));
  total();
  const submit = type => {
    if ($("declineTunnel").disabled) return;
    const option = chosen();
    if (type === "pay_tunnel" && !option) return;
    $("acceptTunnel").disabled = $("declineTunnel").disabled = true;
    act(type, type === "pay_tunnel" ? { extraWild: option.wild } : {});
  };
  $("acceptTunnel").onclick = () => submit("pay_tunnel");
  $("declineTunnel").onclick = () => submit("decline_tunnel");
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
  panel.style.left = Math.max(8, Math.min(left, document.documentElement.clientWidth - panel.offsetWidth - 8)) + "px";
  panel.style.top = Math.max(8, Math.min(top, document.documentElement.clientHeight - panel.offsetHeight - 8)) + "px";
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

function mapSafeArea(rect) {
  const side = $("gameSidebar").getBoundingClientRect();
  const bottom = $("handdock").getBoundingClientRect();
  const top = $("boardtools").getBoundingClientRect().bottom - rect.top + 12;
  return {
    x: 16, y: top, width: side.left - rect.left - 32,
    height: bottom.top - rect.top - top - 12,
  };
}
function mapViewSize() {
  const rect = $("mapscroll").getBoundingClientRect(), { width, height } = rect;
  if (!width || !height) return null;
  return GameUI.camera(MAP_BOUNDS, { width, height }, mapSafeArea(rect), zoom, mapCenter);
}
function applyZoom() {
  const view = mapViewSize();
  if (!view) return;
  mapCenter = view.focus;
  $("board").setAttribute("viewBox",
    `${view.x} ${view.y} ${view.width} ${view.height}`);
  $("zoomlevel").textContent = Math.round(zoom * 100) + "%";
  $("zoomout").disabled = zoom <= GameUI.MIN_ZOOM;
  $("zoomin").disabled = zoom >= GameUI.MAX_ZOOM;
  $("mapscroll").classList.add("can-pan");
  updateStationScale();
  updateCityLabels();
  updateDestinationSpotlight();
  for (const flight of constructionFlights.values()) bindConstruction(flight);
}
function setZoom(next, clientX, clientY) {
  const before = mapViewSize();
  if (!before) return;
  closeMapMenu();
  const rect = $("mapscroll").getBoundingClientRect();
  const fx = clientX === undefined ? 0 : clientX - rect.left - before.sx;
  const fy = clientY === undefined ? 0 : clientY - rect.top - before.sy;
  zoom = Math.min(GameUI.MAX_ZOOM, Math.max(GameUI.MIN_ZOOM, next));
  const after = mapViewSize();
  mapCenter.x += fx * (before.scale - after.scale);
  mapCenter.y += fy * (before.scale - after.scale);
  applyZoom();
}
$("zoomin").onclick = () => setZoom(zoom + 0.25);
$("zoomout").onclick = () => setZoom(zoom - 0.25);
$("zoomfit").onclick = () => { closeMapMenu(); zoom = 1; mapCenter = { ...MAP_CENTER }; applyZoom(); };
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
  mapDrag = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    center: { ...mapCenter }, scale: mapViewSize().scale, moved: false,
  };
});
$("mapscroll").addEventListener("pointermove", (event) => {
  if (mapDrag?.id !== event.pointerId) return;
  const dx = event.clientX - mapDrag.x, dy = event.clientY - mapDrag.y;
  if (!mapDrag.moved && Math.hypot(dx, dy) < 5) return;
  closeMapMenu();
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
const cameraResize = new ResizeObserver(() => { closeMapMenu(); applyZoom(); layoutHand(); });
for (const id of ["mapscroll", "gameSidebar", "handdock"]) cameraResize.observe($(id));
$("expandboard").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast("Tu navegador no permite activar la pantalla completa."); }
};
document.addEventListener("fullscreenchange", () => {
  $("expandboard").setAttribute("aria-label", document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa");
  applyZoom();
});
document.addEventListener("pointerdown", event => {
  if (!event.target.closest("#mapMenu, .route-group, .city-node")) closeMapMenu();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (uiDialog) { e.preventDefault(); closeOptionalDialog(); }
    else if (!$("mapMenu").classList.contains("hidden")) {
      e.preventDefault(); closeMapMenu();
      const selector = stationCity ? `[data-city="${stationCity}"]` : `[data-route-id="${selected}"]`;
      $("board").querySelector(selector)?.focus({ preventScroll: true });
    }
  }
  if (e.key === "Tab" && !$("overlay").classList.contains("hidden")) {
    const focusable = [...$("dialog").querySelectorAll('button:not(:disabled), input, select, summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!first) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !$("dialog").contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }
});
setInterval(() => {
  if (sock?.readyState === WebSocket.OPEN && room) send({ type: "ping" });
}, 180000);
if (desiredRoom && localStorage.getItem(identityKey(desiredRoom))) {
  attempted = true;
}
connect();
