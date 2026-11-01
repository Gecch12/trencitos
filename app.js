"use strict";
const $ = (id) => document.getElementById(id);
const C = GameUI.ROUTE_COLORS;
const N = {
  red: I18n.t("Rojo"),
  blue: I18n.t("Azul"),
  green: I18n.t("Verde"),
  yellow: I18n.t("Amarillo"),
  black: I18n.t("Negro"),
  white: I18n.t("Blanco"),
  orange: I18n.t("Naranja"),
  purple: I18n.t("Morado"),
  wild: I18n.t("Locomotora"),
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
let homeMode = "create", homeBusy = false, lobbyStarted = false;
let preferredColor = localStorage.getItem("rr-color");
let account = null, shell = null;
const replayMode = location.pathname === "/replay";
let replayAt = null;
let spectating = false, roomCapacity = 5, roomVisibility = 'private';
let desiredWatch = new URLSearchParams(location.search).get('watch') || '';
if (!LobbyUI.isColor(preferredColor)) preferredColor = LobbyUI.PALETTE[0].color;
const MAP_BOUNDS = RailMap.bounds;
const MAP_GEOMETRY = RailMap.createNetwork(ROUTES);
const MAP_CENTER = { x: MAP_BOUNDS.x + MAP_BOUNDS.width / 2, y: MAP_BOUNDS.y + MAP_BOUNDS.height / 2 };
const TICKET_COLORS = ["#b48916", "#c64e48", "#357bb5", "#32815b"];
let zoom = 1,
  mapCenter = { ...MAP_CENTER };
let board3D = null, board3DLoading = false, board3DFailed = false;
let boardSpotlight = null;
let labelPriority = [];
let labelPlacements3D = new Map();
function boardUnavailable() {
  board3D?.dispose(); board3D = null; board3DFailed = true;
  $("mapscroll").classList.remove("board-ready");
  $("boardStatus").hidden = false;
  $("boardStatusText").textContent = I18n.t("No pudimos cargar el tablero 3D. Prueba a reintentarlo o recarga la página.");
  $("retryBoard").hidden = false;
  closeMapMenu();
}
async function initializeBoard3D() {
  if (board3DLoading || board3D) return;
  board3DLoading = true; board3DFailed = false;
  $("boardStatus").hidden = false; $("retryBoard").hidden = true;
  $("boardStatusText").textContent = I18n.t("Preparando el tablero…");
  try {
    const { createBoard3D } = await import("./board-3d.js");
    board3D = createBoard3D({ container: $("mapscroll"), map: RailMap, network: MAP_GEOMETRY, onFailure: boardUnavailable });
    $("board").setAttribute("preserveAspectRatio", "none");
    $("mapscroll").classList.add("board-ready"); $("boardStatus").hidden = true;
    labelPlacements3D.clear();
    if (game) renderBoard();
    applyZoom();
  } catch (error) {
    console.warn("Tablero 3D no disponible:", error.message); boardUnavailable();
  } finally { board3DLoading = false; }
}
let wagonPreview = null, wagonPreviewLoading = false;
function hideWagonPreview() {
  wagonPreview?.dispose(); wagonPreview = null; $("wagonPreview").hidden = true;
}
async function syncWagonPreview() {
  const inRoom = !!room && !lobbyStarted;
  if (game || (!inRoom && homeMode !== "practice")) { hideWagonPreview(); return; }
  const figure = $("wagonPreview"), anchor = $(inRoom ? "roomNote" : "createTest");
  if (figure.nextElementSibling !== anchor) anchor.before(figure);
  figure.hidden = false;
  if (wagonPreviewLoading) return;
  wagonPreviewLoading = true;
  try {
    const { createWagonPreview } = await import("./wagon-preview.js");
    if (game || (!room && homeMode !== "practice")) return;
    wagonPreview ||= createWagonPreview({ container: $("wagonPreviewStage"), onFailure: () => {
      wagonPreview?.dispose(); wagonPreview = null; $("wagonPreviewError").hidden = false;
    } });
    const description = wagonPreview.update(preferredColor);
    figure.dataset.model = description.model;
    $("wagonPreviewName").textContent = I18n.t(description.label);
    $("wagonPreviewStage").setAttribute("aria-label", I18n.t`${I18n.t(description.label)}, color ${I18n.t(LobbyUI.PALETTE.find(p => p.color === preferredColor)?.name)}`);
    $("wagonPreviewError").hidden = true;
  } catch (error) {
    $("wagonPreviewName").textContent = I18n.t("Tu selección"); $("wagonPreviewError").hidden = false;
    console.warn("Vista previa no disponible:", error.message);
  } finally { wagonPreviewLoading = false; }
}

let hoveredPlayer = null, focusedPlayer = null;
let displayedLogs = null;
let displayedHistoryKey = null;
let hoveredDestination = null, allDestinationsVisible = false;
let historyFollowing = true, lastDrawId = null;
let lastEffectId = null, serverOffset = 0, seenOfferId = null;
let waitingForGameStart = false;
let retainedVisible = new Set();
const effectTimers = new Set();
const cardFlights = new Set();
const constructionFlights = new Map();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let uiDialog = null, dialogReturnFocus = null, buildTarget = null, buildSubmitting = false;
let tunnelReveal = null;
let resultsSeen = false, resultMapSelection = null;
const expandedResults = new Set();
const resultViews = new Map();
let resultMapCleanup = null, resultCamera = null, resultCameraKey = "";
let toastTimer = null;
const ticketColor = i => TICKET_COLORS[i % TICKET_COLORS.length];
let pendingChoiceKey = null,
  ticketChoices = new Set(),
  hoveredTicket = null,
  desiredRoom = new URLSearchParams(location.search).get("room") || "";
desiredRoom = desiredRoom.trim().toUpperCase();
$("code").value = desiredRoom;
if (LobbyUI.isJoinCode(desiredRoom) && localStorage.getItem(identityKey(desiredRoom))) attempted = true;
const recoveryToken = new URLSearchParams(location.hash.slice(1)).get("recover");
let incomingRecovery = null;
if (recoveryToken && /^[a-f0-9]{48}$/.test(recoveryToken) && LobbyUI.isJoinCode(desiredRoom)) {
  desiredRoom = desiredRoom.toUpperCase();
  incomingRecovery = recoveryToken;
  attempted = true;
}
if (location.hash) history.replaceState(null, "", location.pathname + location.search);
const savedName = localStorage.getItem("rr-name");
$("nickname").value = savedName || I18n.t("Jugador");
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
  const online = sock?.readyState === WebSocket.OPEN && !sessionReplaced;
  $("connection").dataset.online = String(online);
  $("connection").classList.toggle("hidden", online);
  if (!online) homeBusy = false;
  syncHomeAvailability();
}
function send(obj) {
  if(replayMode)return;
  if (!sock || sock.readyState !== WebSocket.OPEN) {
    homeBusy = false; syncHomeAvailability();
    error(I18n.t("Sin conexión."));
    return;
  }
  sock.send(JSON.stringify(obj));
}
function error(s) {
  s = I18n.t(s);
  $("lobbyError").textContent = s;
  if ($("joinDialog").open) $("joinCodeError").textContent = s;
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
  message = I18n.t(message);
  cancelTunnelReveal();
  if (!spectating && !preserveIdentity && (room || desiredRoom)) localStorage.removeItem(identityKey(room || desiredRoom));
  spectating = false; desiredWatch = ''; roomCapacity = 5;
  room = desiredRoom = token = "";
  game = null;
  seat = -1;
  members = [];
  host = practiceMode = attempted = false;
  lobbyStarted = homeBusy = false;
  pendingAction = null; storagePaused = false;
  $("sessionControls").classList.add("hidden");
  $("sessionNotice").classList.add("hidden");
  selected = stationCity = null;
  zoom = 1;
  mapCenter = { ...MAP_CENTER };
  pendingChoiceKey = null;
  ticketChoices.clear();
  document.body.classList.remove("is-playing");
  setCompactPanel("map");
  uiDialog = buildTarget = null;
  resultsSeen = false; resultMapSelection = null; expandedResults.clear();
  resultViews.clear(); resultMapCleanup?.(); resultMapCleanup = null; resultCamera = null; resultCameraKey = "";
  $("resultContext").classList.add("hidden");
  buildSubmitting = false;
  closeMapMenu();
  displayedLogs = null;
  displayedHistoryKey = null;
  hoveredDestination = null; allDestinationsVisible = false;
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
  $("homeSetup").classList.remove("hidden");
  $("createCode").value = LobbyUI.randomCode();
  setHomeMode("create");
  renderHomeColors();
  $("lobbyError").textContent = message;
  history.replaceState(null, "", "/");
  status(sock?.readyState === WebSocket.OPEN ? I18n.t("● Conectado") : I18n.t("○ Desconectado"));
  shell?.reset();
  account?.listRooms().catch(() => {});
}
function connect() {
  if (sessionReplaced) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  sock = new WebSocket(proto + "//" + location.host + "/socket");
  status(I18n.t("Conectando…"));
  sock.onopen = () => {
    resendPending = true;
    lastDrawId = null; // The reconnect snapshot is not a new draw.
    lastEffectId = null;
    status(I18n.t("● Conectado"));
    send({type:'list_rooms'});
    if (desiredWatch) send({type:'spectate',code:desiredWatch});
    else if (attempted && desiredRoom) {
      let t = incomingRecovery || localStorage.getItem(identityKey(desiredRoom));
      send({
        type: "join",
        code: desiredRoom,
        token: t || undefined,
        name: $("nickname").value,
        color: preferredColor,
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
    if (m.type === 'directory') { shell?.receiveDirectory(m); return; }
    if (m.type === "error") {
      homeBusy = false; syncHomeAvailability();
      pendingAction = null;
      if (desiredWatch && !room) { desiredWatch=''; shell.watchUnavailable(); return; }
      if (!room && ["CODE_TAKEN", "INVALID_CODE", "ROOM_NOT_FOUND"].includes(m.code)) {
        attempted = false;
        if (m.code === "CODE_TAKEN") $("createCode").value = LobbyUI.randomCode();
        if (m.code === "ROOM_NOT_FOUND") setHomeMode("join");
        homeCodeError(homeMode === "create" ? "create" : "join", m.message);
        error(m.message);
        return;
      }
      if (["ROOM_NOT_FOUND", "INVALID_TOKEN"].includes(m.code)) {
        incomingRecovery = null;
        resetToLobby(m.message, m.code === "INVALID_TOKEN");
        return;
      }
      error(m.message);
      return;
    }
    if (m.type === "room_closed") {
      const wasWatching = spectating;
      resetToLobby(m.message || "", !!m.preserveIdentity);
      if (wasWatching && m.message) shell.watchUnavailable();
      return;
    }
    if (m.type === "session_replaced") {
      sessionReplaced = true; pendingAction = null;
      notice(I18n.t("Esta partida está abierta en otra pestaña. Aquí no tienes el control."), "takeOver");
      updateCompactStatus();
      return;
    }
    if (m.type === "storage") {
      storagePaused = m.paused;
      syncHomeAvailability();
      if (storagePaused) notice(m.requiresRestart
        ? I18n.t("Partida pausada por el guardado remoto. El administrador debe restablecer el servicio; conserva esta pestaña para reconectar.")
        : I18n.t("Partida pausada: el servidor no pudo guardar. No se aceptarán jugadas hasta recuperarlo."), m.requiresRestart ? null : "retrySave");
      else if (!sessionReplaced) $("sessionNotice").classList.add("hidden");
      updateCompactStatus();
      return;
    }
    if (m.type === "ack") {
      if (pendingAction?.id === m.id) pendingAction = null;
      return;
    }
    if (m.type === "lobby") {
      const enteringRoom = room !== m.code;
      homeBusy = false;
      lobbyStarted = !!m.started;
      $("lobbyError").textContent = "";
      if (!m.started) waitingForGameStart = true;
      room = m.code;
      spectating = !!m.spectator;
      desiredWatch = spectating ? room : '';
      roomCapacity = m.maxPlayers || 5; roomVisibility = m.visibility || 'private';
      desiredRoom = room;
      seat = m.seat;
      token = m.token;
      incomingRecovery = null;
      members = m.members;
      if (LobbyUI.isColor(members[seat]?.color)) {
        const colorChanged = preferredColor !== members[seat].color;
        preferredColor = members[seat].color;
        localStorage.setItem("rr-color", preferredColor);
        if (colorChanged) account?.changed();
      }
      host = m.host;
      practiceMode = !!m.practice;
      sessionSupported = m.sessionVersion >= 1;
      $("sessionControls").classList.toggle("hidden", spectating || practiceMode || !sessionSupported);
      $("reclaimControl").classList.toggle("hidden", !members[seat]?.autopilot);
      $("reclaimControl").disabled = !!members[seat]?.reclaim;
      $("reclaimControl").textContent = members[seat]?.reclaim ? I18n.t("Volverás en tu siguiente turno") : I18n.t("Recuperar control");
      if (!spectating) localStorage.setItem(identityKey(room), token);
      localStorage.setItem("rr-name", $("nickname").value);
      if (enteringRoom || m.started) history.replaceState(null, "", spectating ? '/rooms?watch='+room : "/rooms?room=" + room);
      renderLobby();
      shell?.joined();
      if (!spectating) account?.linkSeat();
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
      prepareTunnelReveal(effects);
      selected = null;
      stationCity = null;
      render();
      if (game.phase === "finished") cancelCardFlights();
      playEffects(effects);
      return;
    }
  };
  sock.onclose = () => {
    cancelTunnelReveal();
    cancelCardFlights();
    cancelConstruction();
    stopSounds();
    status(sessionReplaced ? I18n.t("Otra pestaña") : I18n.t("○ Desconectado"));
    updateCompactStatus();
    if (game) renderDialog();
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
  $("homeSetup").classList.add("hidden");
  $("roompanel").classList.remove("hidden");
  $("roomcode").textContent = room;
  $("roomCount").textContent = `${members.length}/${roomCapacity}`;
  $("members").innerHTML = members
    .map(
      (m, i) =>
        `<div class="member" data-member="${i}">${homeAvatarMarkup(m.bot || m.autopilot)}<div class="member-identity"><b>${escapeHTML(m.name)}</b><small>${[i === seat ? I18n.t("Tú") : "", m.host ? I18n.t("Anfitrión") : "", m.bot ? "Bot" : !m.connected ? I18n.t("Sin conexión · reserva 60 s") : "", I18n.t(LobbyUI.PALETTE.find(p => p.color === m.color)?.name || "")].filter(Boolean).join(" · ")}</small></div>${host && !lobbyStarted && i !== seat && !practiceMode ? I18n.t`<button class="member-remove" type="button" data-kick="${i}" aria-label="Retirar a ${escapeHTML(m.name)}" title="Retirar jugador">×</button>` : ""}</div>`,
    )
    .join("");
  $("members").querySelectorAll("[data-member]").forEach(row => applyPlayerAppearance(row, members[+row.dataset.member].color));
  $("members").querySelectorAll("[data-kick]").forEach(button => button.onclick = () => {
    if (confirm(I18n.t("¿Retirar a este participante de la sala?"))) send({ type: "kick", seat: +button.dataset.kick });
  });
  $("start").classList.toggle("hidden", practiceMode || !host || lobbyStarted);
  renderHomeColors();
  syncHomeAvailability();
  $("roomNote").textContent =
    practiceMode ? I18n.t("Sala de pruebas temporal · Tú y 3 bots.") :
      members.length < 2 ? I18n.t("Invita a alguien para empezar.") : members.some(m => !m.connected) ? I18n.t("Esperando a que todos estén conectados.") : host ? I18n.t("Todo listo. El primer turno se sortea al empezar.") : I18n.t("Esperando a que el anfitrión inicie la partida.");
  shell?.renderRoom();
}
function homeAvatarMarkup(bot = false) {
  if (bot) return `<span class="home-avatar is-bot" aria-hidden="true">${ShellIcons.svg('bot')}</span>`;
  return '<span class="home-avatar" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="5"/><path d="M7 27v-4a9 9 0 0 1 18 0v4Z"/></svg></span>';
}
function syncHomeAvailability() {
  const unavailable = homeBusy || sock?.readyState !== WebSocket.OPEN || sessionReplaced || storagePaused;
  for (const id of ["create", "join", "createTest"]) $(id).disabled = unavailable;
  for (const tab of document.querySelectorAll("[data-home-tab]")) tab.disabled = homeBusy;
  $("regenerateCode").disabled = homeBusy;
  $("createCode").readOnly = homeBusy;
  $("start").disabled = unavailable || members.length < 2 || members.some(m => !m.connected);
  $("roomColors").querySelectorAll("button").forEach(button => {
    button.disabled = unavailable || lobbyStarted || members.some((m, i) => i !== seat && m.color === button.dataset.color);
  });
  shell?.availability();
}
function homeCodeError(mode, message = "") {
  $(mode === "create" ? "createCodeError" : "joinCodeError").textContent = I18n.t(message);
  $(mode === "create" ? "createCode" : "code").setAttribute("aria-invalid", String(!!message));
}
function setHomeMode(mode, focus = false) {
  homeMode = mode;
  for (const tab of document.querySelectorAll("[data-home-tab]")) {
    const active = tab.dataset.homeTab === mode;
    tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !active;
    if (active && focus) tab.focus();
  }
  $("lobbyError").textContent = "";
  homeCodeError("create"); homeCodeError("join");
  syncWagonPreview();
}
function applyPlayerAppearance(element, color) {
  element.style.setProperty("--player-color", GameUI.playerColor(color));
  element.dataset.finish = GameUI.playerFinish(color);
}
function renderHomeColors() {
  applyPlayerAppearance($("homeAvatar"), preferredColor);
  $("chosenColorName").textContent = I18n.t(LobbyUI.PALETTE.find(p => p.color === preferredColor)?.name || "");
  $("practiceColorName").textContent = $("chosenColorName").textContent;
  for (const id of ["practiceColors", "roomColors"]) {
    const root = $(id), focused = root.contains(document.activeElement) ? document.activeElement.dataset.color : null;
    root.replaceChildren();
    for (const { color, name: sourceName } of LobbyUI.PALETTE) {
      const name = I18n.t(sourceName);
      const owner = id === "roomColors" && members.find((m, i) => i !== seat && m.color === color);
      const button = document.createElement("button"); button.type = "button"; button.dataset.color = color;
      button.dataset.finish = GameUI.playerFinish(color);
      button.style.setProperty("--choice-color", GameUI.playerColor(color));
      button.setAttribute("aria-label", owner ? I18n.t`${name}, ocupado por ${owner.name}` : name);
      button.title = owner ? `${name} · ${owner.name}` : name;
      button.setAttribute("aria-pressed", String(color === preferredColor));
      button.disabled = !!owner || (id === "roomColors" && lobbyStarted);
      if (color === preferredColor) button.innerHTML = '<span aria-hidden="true">✓</span>';
      button.onclick = () => {
        if (id === "roomColors") send({ type: "select_color", color });
        else { preferredColor = color; localStorage.setItem("rr-color", color); renderHomeColors(); account?.changed(); }
      };
      root.appendChild(button);
    }
    if (focused) root.querySelector(`[data-color="${focused}"]`)?.focus({ preventScroll: true });
  }
  syncHomeAvailability();
  syncWagonPreview();
}
function initializeHome() {
  $("createCode").value = LobbyUI.randomCode();
  setHomeMode(desiredRoom ? "join" : "create");
  renderHomeColors();
  const tabs = [...document.querySelectorAll("[data-home-tab]")];
  tabs.forEach((tab, i) => {
    tab.onclick = () => setHomeMode(tab.dataset.homeTab);
    tab.onkeydown = event => {
      const next = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); setHomeMode(tabs[next].dataset.homeTab, true);
    };
  });
  $("regenerateCode").onclick = () => { $("createCode").value = LobbyUI.randomCode(); homeCodeError("create"); };
  $("createCode").oninput = () => homeCodeError("create");
  $("code").oninput = () => homeCodeError("join");
  $("nickname").oninput = () => { localStorage.setItem("rr-name", $("nickname").value); account?.changed(); shell?.identity(); };
  $("nickname").onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); $(homeMode === "practice" ? "createTest" : homeMode === "join" ? "join" : "create").click(); } };
  $("leaveLobby").onclick = () => $("leaveRoom").click();
}
$("homeCreate").onsubmit = event => {
  event.preventDefault();
  if (homeBusy) return;
  if (room) return error(I18n.t("Ya perteneces a una sala."));
  const code = $("createCode").value.trim();
  if (!LobbyUI.isNewCode(code)) { homeCodeError("create", I18n.t("Usa entre 6 y 10 números, sin espacios.")); $("createCode").focus(); return; }
  attempted = false;
  homeBusy = true; syncHomeAvailability();
  send({ type: "create", name: $("nickname").value, code, color: preferredColor, visibility:'public', maxPlayers:5 });
};
$("createTest").onclick = () => {
  if (homeBusy) return;
  if (room) return error(I18n.t("Ya perteneces a una sala."));
  attempted = false;
  $("lobbyError").textContent = "";
  waitingForGameStart = true;
  homeBusy = true; syncHomeAvailability();
  send({ type: "create_test", name: $("nickname").value, color: preferredColor });
};
$("finishTest").onclick = () => send({ type: "finish_test" });
$("leaveTest").onclick = () => send({ type: "leave_test" });
$("homeJoin").onsubmit = event => {
  event.preventDefault();
  if (homeBusy) return;
  if (room) return error(I18n.t("Ya perteneces a una sala."));
  desiredRoom = $("code").value.trim().toUpperCase();
  if (!LobbyUI.isJoinCode(desiredRoom)) { homeCodeError("join", I18n.t("Introduce un código válido de 6 a 10 caracteres.")); $("code").focus(); return; }
  attempted = true;
  homeBusy = true; syncHomeAvailability();
  send({
    type: "join",
    code: desiredRoom,
    token: localStorage.getItem(identityKey(desiredRoom)) || undefined,
    name: $("nickname").value,
    color: preferredColor,
  });
};
$("start").onclick = () =>
  send({ type: "start" });
async function copyInvitation() {
  const url = location.origin + "/?room=" + room;
  try {
    await navigator.clipboard.writeText(url);
    $("copyLink").textContent = I18n.t("✓ Copiado");
    $("copyRoomInGame").textContent = I18n.t("✓ Copiado");
    setTimeout(() => {
      $("copyLink").textContent = I18n.t("Copiar invitación");
      $("copyRoomInGame").innerHTML = I18n.t("↗ <span>Invitar</span>");
    }, 2400);
  } catch {
    $("copyLink").textContent = url;
    prompt(I18n.t("Copia el enlace de tu sala"), url);
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
  try { await navigator.clipboard.writeText(url); toast(I18n.t("Enlace privado copiado. Guárdalo solo para ti.")); }
  catch { prompt(I18n.t("Tu enlace privado de recuperación (no lo compartas)"), url); }
};
$("rotateRecovery").onclick = () => {
  if (confirm(I18n.t("¿Invalidar el enlace privado anterior? Después copia y guarda el nuevo."))) send({ type: "rotate_token" });
};
$("reclaimControl").onclick = () => send({ type: "reclaim" });
$("leaveRoom").onclick = () => {
  if (spectating || !game || game.phase === "finished" || confirm(I18n.t("¿Salir de la partida? Un bot tomará tu puesto. Si todos salen, la partida se abandonará tras 60 segundos sin conexiones."))) send({ type: "leave" });
};
function act(type, other = {}) {
  if(replayMode)return;
  if (spectating) return;
  if (sessionReplaced || storagePaused || members[seat]?.autopilot) { error(I18n.t("No tienes el control de este puesto.")); return; }
  if (pendingAction) return;
  if (sock?.readyState !== WebSocket.OPEN) { error(I18n.t("Sin conexión.")); return; }
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
    b.setAttribute("aria-label", I18n.t`${N[c]}: ${count} carta${count === 1 ? "" : "s"}`);
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
    b.title = I18n.t("Robar carta ") + N[c];
    b.disabled = disabled;
    b.onclick = click;
  }
  return b;
}
function playerAvatar(index, compact = false) {
  const member = members[index];
  if (member?.bot || member?.autopilot) return `<span class="player-avatar is-bot${compact ? " history-avatar" : ""}" aria-hidden="true">${ShellIcons.svg('bot')}</span>`;
  return `<span class="player-avatar${compact ? " history-avatar" : ""}" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="5"/><path d="M7 27v-4a9 9 0 0 1 18 0v4Z"/></svg></span>`;
}
function render() {
  if (!game) return;
  hideWagonPreview();
  if (!board3D && !board3DLoading && !board3DFailed) initializeBoard3D();
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
        I18n.t`<div class="scorebadge ${i === game.current && ["play", "tunnel"].includes(game.phase) ? "active" : ""}" data-player="${i}" tabindex="0" aria-label="${escapeHTML(x.name)}. ${game.result?.find(r => r.seat === i)?.score ?? x.score} puntos, ${x.trains} vagones, ${x.stations} estaciones. Enfoca para resaltar sus rutas.">
          <div class="player-heading">${playerAvatar(i)}<div class="player-details"><b title="${escapeHTML(x.name)}">${escapeHTML(x.name)}</b><div class="player-status"><span class="player-turn-tag">EN TURNO</span><span class="player-state">${[i === seat ? I18n.t("Tú") : "", game.phase === "initial" ? (x.initialReady ? I18n.t("✓ Listo") : I18n.t("Eligiendo billetes")) : ""].filter(Boolean).join(" · ")}</span></div></div></div>
          <div class="player-metrics">${playerMetric("points", I18n.t("Puntos"), game.result?.find(r => r.seat === i)?.score ?? x.score)}${playerMetric("trains", I18n.t("Vagones"), x.trains)}${playerMetric("stations", I18n.t("Estaciones"), x.stations)}</div>
        </div>`,
    )
    .join("");
  hoveredPlayer = previousHover === undefined ? null : +previousHover;
  focusedPlayer = previousFocus === undefined ? null : +previousFocus;
  [...$("scores").children].forEach((badge, i) => {
    applyPlayerAppearance(badge, game.players[i].color);
    badge.addEventListener("pointerenter", () => { hoveredPlayer = i; highlightPlayerRoutes(); });
    badge.addEventListener("pointerleave", () => { hoveredPlayer = null; highlightPlayerRoutes(); });
    badge.addEventListener("focus", () => { focusedPlayer = i; highlightPlayerRoutes(); });
    badge.addEventListener("blur", () => { focusedPlayer = null; highlightPlayerRoutes(); });
    badge.setAttribute("role", "button");
    badge.onclick = () => {
      if (compactMedia.matches) { compactPlayer = i; updateCompactPlayer(); }
      else { focusedPlayer = i; highlightPlayerRoutes(); }
    };
    badge.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); badge.click(); }
    });
  });
  if (previousFocus !== undefined) $("scores").querySelector(`[data-player="${previousFocus}"]`)?.focus({ preventScroll: true });
  $("turntitle").textContent =
    game.phase === "finished"
      ? I18n.t("Partida terminada")
      : game.phase === "initial"
        ? I18n.t("Elección inicial")
        : active
          ? I18n.t("Tu turno")
          : I18n.t`Turno de ${game.players[game.current].name}`;
  $("roundStatus").textContent = game.phase === "finished" ? I18n.t("Final") : game.phase === "initial" ? I18n.t`${game.initialReadyCount}/${game.players.length} listos` : game.finalRemaining !== null ? I18n.t("Última ronda") : "";
  $("initialStatus").classList.toggle("hidden", game.phase !== "initial");
  $("initialStatusText").textContent = I18n.t`${game.initialReadyCount}/${game.players.length} listos · ${game.players[seat]?.initialReady ? I18n.t("Puedes explorar el mapa mientras esperas") : I18n.t("Todos eligen a la vez")}`;
  $("viewResults").classList.toggle("hidden", game.phase !== "finished");
  if (game.phase === "closing") $("roundStatus").innerHTML = I18n.t('Últimos billetes <span data-clock="closing"></span>');
  $("hand").innerHTML = "";
  for (const c of [...COLORS, "wild"]) {
    let n = game.hand.filter((x) => x === c).length;
    if (n) $("hand").appendChild(colorCard(c, n, null, false));
  }
  if (!game.hand.length) $("hand").innerHTML = I18n.t('<span class="smallmuted">Aún no tienes cartas de tren.</span>');
  $("handCount").textContent = I18n.t`${game.hand.length} cartas`;
  $("ticketTotal").textContent = game.tickets.length;
  renderDestinations();
  layoutHand();
  const blindDeck = $("drawblind");
  const visibleCards = Array.from({ length: 5 }, (_, i) => {
    const c = game.face[i];
    if (!c) { const empty = document.createElement("div"); empty.className = "empty-market-slot"; empty.setAttribute("aria-label", I18n.t("Sin carta disponible")); return empty; }
    const card = colorCard(c, null, () => act("draw_train", { index: i }), !drawAllowed() || (c === "wild" && game.drawCount === 1));
    card.dataset.marketIndex = i;
    card.title = I18n.t`Robar ${N[c]}${c === "wild" ? I18n.t(" · Consume los dos robos; no puede ser tu segunda carta") : ""}`;
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
    I18n.t`${game.deckCount} cartas ocultas · ${game.ticketDeckCount} destinos por robar`;
  $("drawstats").textContent = active ? `${game.drawCount}/2` : "";
  $("drawstats").setAttribute("aria-label", active ? I18n.t`${game.drawCount} de 2 robos usados` : "");
  $("pass").classList.toggle("hidden", !GameUI.canPass(game, seat, Object.keys(CITIES)));
  renderHistory();
  renderBoard();
  renderDialog();
  applyZoom();
  updateCompactStatus();
  updateCompactPlayer();
  updateClocks();
}
function updateClocks() {
  if (!game) return;
  const deadlines = { initial: game.initialDeadline, turn: game.turnDeadline, offer: game.ticketOffer?.deadline, waiting: game.waitingDeadline, closing: game.closingDeadline };
  for (const node of document.querySelectorAll("[data-clock]")) {
    const deadline = deadlines[node.dataset.clock], seconds = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - (replayAt ?? Date.now() + serverOffset)) / 1000)) : null;
    node.textContent = seconds === null ? "" : node.dataset.clockFormat === "timer" ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${seconds}s`;
    node.classList.toggle("clock-warning", seconds !== null && seconds <= 10);
    node.classList.toggle("clock-urgent", seconds !== null && seconds <= 5);
    node.setAttribute("aria-label", seconds === null ? "" : I18n.t`${seconds} segundos restantes`);
    if (node.id === "compactClock") {
      $("turnBanner").style.setProperty("--time-left", String(Math.min(1, (seconds || 0) / 60)));
      $("turnBanner").classList.toggle("is-warning", seconds !== null && seconds <= 10);
      $("turnBanner").classList.toggle("is-urgent", seconds !== null && seconds <= 5);
    }
  }
  if (tunnelReveal?.event.surcharge && game.turnDeadline - Date.now() - serverOffset <= 5000) finishTunnelReveal(true);
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
      applyPlayerAppearance(row, player.color);
      row.dataset.actor = entry.seat;
    }
    const text = document.createElement("span"); text.textContent = entry.message ? I18n.format(entry.message) : I18n.t(entry.text); row.appendChild(text);
    return row;
  }));
  if (!logs.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = I18n.t("Esperando el primer movimiento");
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
  if (!list.clientHeight) return; // Hidden panels must not change follow/reading state.
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
    else if (event.type === "build" && !event.deferredForTunnel) animateConstruction(event);
    else if (event.type === "turn" && event.seat === seat) playSound("bell");
  }
}
// Small original synthesized effects: no external audio, tracking or downloads.
let soundContext = null, muted = localStorage.getItem("rr-muted") === "true";
const soundNodes = new Set();
function soundLabel() {
  $("soundToggle").innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3Z"/>${muted ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;
  $("soundToggle").setAttribute("aria-pressed", String(!muted));
  $("soundToggle").title = muted ? I18n.t("Activar sonidos") : I18n.t("Silenciar sonidos");
  $("soundToggle").setAttribute("aria-label", I18n.t("Sonido"));
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
  let target = document.querySelector(targetSelector);
  if (compactMedia.matches) {
    const rect = target?.getBoundingClientRect();
    const area = own ? $("hand").getBoundingClientRect() : $("compactPlayers").getBoundingClientRect();
    if (!rect?.width || rect.left < area.left || rect.right > area.right || rect.top < area.top || rect.bottom > area.bottom)
      target = own ? $("handCount") : $("compactPlayers");
  }
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
  if (board3D) {
    if (reducedMotion.matches || document.hidden || !board3D.animateConstruction(event, () => { if (!document.hidden) playSound("build"); })) playSound("build");
    return;
  }
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
  board3D?.cancelAnimations();
  for (const flight of constructionFlights.values()) {
    clearTimeout(flight.timer); flight.animations.forEach(a => a.cancel()); flight.band?.style.removeProperty("opacity");
  }
  constructionFlights.clear();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) { finishTunnelReveal(true); cancelCardFlights(); cancelConstruction(); stopSounds(); } });
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) cancelConstruction(); });
window.addEventListener("resize", () => { cancelCardFlights(); cancelConstruction(); });
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) skipTunnelAnimation(); cancelCardFlights(); cancelConstruction(); });
function layoutHand() {
  const cards = [...$("hand").querySelectorAll(".traincard")];
  if (!cards.length) return;
  if (compactMedia.matches) { cards.forEach(card => { card.style.marginRight = "0"; }); return; }
  const width = cards[0].getBoundingClientRect().width;
  const available = $("hand").clientWidth - 12;
  const step = cards.length === 1 ? width : Math.min(width + 10, (available - width) / (cards.length - 1));
  cards.forEach((card, i) => { card.style.marginRight = i === cards.length - 1 ? "0" : `${step - width}px`; });
}
function renderDestinations() {
  const content = GameUI.destinationEntries(game, game.tickets).map(({ ticket: t }) => {
    const status = GameUI.destinationStatus(game, t.id);
    const hint = !status ? I18n.t("Progreso no disponible: el backend no envía este dato. Reinícialo al terminar la partida.") : status.completed ? status.viaStation ? I18n.t("Conectado usando una estación. Puntos al final de la partida.") : I18n.t("Conectado. Puntos al final de la partida.") : I18n.t("Destino pendiente");
    const number = GameUI.destinationNumber(game, t.id);
    return I18n.t`<button type="button" class="destination-row ${status?.completed ? "is-complete" : ""}" data-destination="${t.id}" title="${hint} · Ver en el mapa"><span class="ticket-number"><span class="sr-only">Destino </span>${number}</span><span class="destination-endpoints">${escapeHTML(CITIES[t.a][2])} <span aria-hidden="true">→</span> ${escapeHTML(CITIES[t.b][2])}</span><strong>${t.p}<span class="sr-only"> puntos</span></strong>${!status ? I18n.t('<span class="destination-unknown" aria-label="Progreso no disponible">?</span>') : status.completed ? I18n.t('<span class="destination-check" aria-label="Completado">✓</span>') : I18n.t('<span class="destination-pending" aria-label="Pendiente">·</span>')}</button>`;
  }).join("") || I18n.t('<p class="smallmuted">Elige tus billetes iniciales.</p>');
  // Keep the user's scroll position while bots act or a new card arrives.
  if ($("ticketList")._destinationHTML !== content) {
    const focus = document.activeElement.closest("#ticketList [data-destination]")?.dataset.destination;
    const top = $("ticketList").scrollTop;
    $("ticketList").innerHTML = content;
    $("ticketList")._destinationHTML = content;
    for (const row of $("ticketList").querySelectorAll("[data-destination]")) row.querySelector(".ticket-number").style.setProperty("--ticket-color", ticketColor(GameUI.destinationNumber(game, +row.dataset.destination) - 1));
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
  return n + " " + I18n.t(word + (n === 1 ? "" : "s"));
}
function routeRequirementText(r) {
  const base = r.n - r.ferry;
  if (r.color === "gray") {
    if (r.ferry) return `${base ? plural(base, "carta") + I18n.t(" de un mismo color + ") : ""}${plural(r.ferry, "locomotora")}`;
    return I18n.t`${plural(r.n, "carta")} de un mismo color`;
  }
  const colorName = N[r.color].toLowerCase();
  if (r.ferry) return `${base ? plural(base, "carta") + I18n.t(" de color ") + colorName + " + " : ""}${plural(r.ferry, "locomotora")}`;
  return I18n.t`${plural(r.n, "carta")} de color ${colorName}`;
}
function routeSummaryText(r) {
  const tags = [];
  if (r.tunnel) tags.push(I18n.t("Túnel"));
  if (r.ferry) tags.push(I18n.t("Ferri"));
  return I18n.t`${CITIES[r.a][2]} — ${CITIES[r.b][2]} · ${plural(r.n, "espacio")}${tags.length ? " · " + tags.join(" · ") : ""} · Requiere ${routeRequirementText(r)}`;
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
  const gold = el("linearGradient", { id: `${prefix}-gold-metal`, x1: "0%", y1: "0%", x2: "28%", y2: "100%" }, defs);
  for (const [offset, color] of [[0, "#815019"], [18, "#d5a43c"], [38, "#fff0ad"], [48, "#efcc6c"], [53, "#b48125"], [76, "#e8bd57"], [100, "#91601e"]])
    el("stop", { offset: `${offset}%`, "stop-color": color }, gold);
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
    [55, 392, I18n.t("ATLÁNTICO"), 13, -70],
    [346, 615, I18n.t("MEDITERRÁNEO"), 11, 0],
    [761, 473, I18n.t("MAR NEGRO"), 9, 0],
    [509, 101, I18n.t("BÁLTICO"), 8, -25],
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
function syncBoard3D() {
  if (!board3D || !game) return;
  const requested = hoveredPlayer ?? focusedPlayer;
  const highlight = requested !== null && game.routes.some(r => r.owner === requested) ? requested : null;
  const focus = document.activeElement.closest?.("#board [data-route-id]");
  const cityFocus = document.activeElement.closest?.("#board [data-city]");
  board3D.update({ routes: game.routes.map(({ id, owner, color, tunnel, ferry, a, b }) => ({ id, owner, color, tunnel, ferry, a, b })),
    players: game.players.map(p => ({ color: GameUI.playerColor(p.color), placed: [...p.placed] })),
    hiddenRoute: tunnelReveal?.build?.routeId ?? null, highlight, spotlight: boardSpotlight,
    selectedRoute: selected ?? (focus ? +focus.dataset.routeId : null), selectedCity: stationCity ?? cityFocus?.dataset.city ?? null,
    routeColors: C });
}
function highlightPlayerRoutes() {
  syncBoard3D();
  const requested = hoveredPlayer ?? focusedPlayer;
  const owner = requested !== null && game?.routes.some(r => r.owner === requested) ? requested : null;
  for (const group of $("board").querySelectorAll(".route-group")) {
    group.classList.toggle("owner-highlight", owner !== null && group.dataset.owner === String(owner));
    group.classList.toggle("owner-muted", owner !== null && group.dataset.owner !== String(owner));
  }
}
function drawOwnedPiece(el, slot, cell, owner, prefix) {
  const color = owner.color, x = (cell.width - 1.2) / 2, h = cell.height - 1;
  const gold = GameUI.playerFinish(color) === "gold";
  const top = -h / 2 - .5, bottom = h / 2 - .5;
  const piece = el("g", { class: "owned-piece", "pointer-events": "none", "aria-hidden": "true" }, slot);
  el("rect", { x: -x, y: top + 1.15, width: x * 2, height: h, rx: 1.2, fill: "#243b42", stroke: "#17313a", "stroke-width": .6 }, piece);
  const shape = `M${-x + 1} ${top}H${x - 1}L${x} ${top + 1}V${bottom - 1}L${x - 1} ${bottom}H${-x + 1}L${-x} ${bottom - 1}V${top + 1}Z`;
  el("path", { d: shape, fill: gold ? `url(#${prefix}-gold-metal)` : color, stroke: gold ? "#79501e" : "#344d50", "stroke-width": .4 }, piece);
  el("path", { d: shape, fill: `url(#${prefix}-piece-grain)`, opacity: gold ? .25 : 1 }, piece);
  el("path", { d: `M${-x + .8} ${bottom - 1}V${top + 1}H${x - .8}`, fill: "none", stroke: "#fff8d8", "stroke-opacity": .68, "stroke-width": .85 }, piece);
  el("path", { d: `M${-x + .8} ${bottom - .7}H${x - .8}V${top + 1}`, fill: "none", stroke: "#173640", "stroke-opacity": .6, "stroke-width": .8 }, piece);
  for (const gx of [-x + 3, x - 3]) {
    el("path", { d: `M${gx} ${top + 1.2}V${bottom - 1.1}`, stroke: "#172a30", "stroke-opacity": .5, "stroke-width": .9 }, piece);
    el("path", { d: `M${gx + .7} ${top + 1.2}V${bottom - 1.1}`, stroke: "#fffce5", "stroke-opacity": .65, "stroke-width": .55 }, piece);
  }
}
function drawStation(el, parent, color, scale = 1, prefix = "board") {
  const piece = el("g", { class: "station-piece", "pointer-events": "none" }, parent);
  const art = el("g", { class: "station-art", transform: `scale(${scale})` }, piece);
  const outline = "M-7 6V-2L-9-2 0-9 9-2H7V6Z";
  const finish = GameUI.playerFinish(color) === "gold" ? `url(#${prefix}-gold-metal)` : color;
  el("path", { d: outline, transform: "translate(0 1)", fill: "#17323b", opacity: .3 }, art);
  el("path", { d: outline, fill: color, stroke: "#fff9e6", "stroke-width": 3, "stroke-linejoin": "round" }, art);
  el("path", { d: outline, fill: finish, stroke: "#243e45", "stroke-width": 1, "stroke-linejoin": "round" }, art);
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
    const description = `${routeSummaryText(r)}${owned ? ` · ${owner.label}` : ""}`;
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
      ...(board3D && owned ? { transform: "translate(0 -3.8)" } : {}),
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
      role: "button", tabindex: 0, "aria-label": `${CITIES[key][2]}${occupant >= 0 ? I18n.t` · Estación de ${game.players[occupant].name}` : I18n.t(" · Ver ciudad")}` });
    if (board3D) el("circle", { r: occupant >= 0 ? 16 : 8, fill: "transparent", "pointer-events": "all", class: "city-hit" }, group);
    el("circle", { r: 6.6, fill: "#fffdf1", opacity: 0.9 }, group);
    el("circle", {
      r: 4.4, fill: "#f9f4e6",
      stroke: stationCity === key ? "#bd6b38" : "#6b7972",
      "stroke-width": stationCity === key ? 2.3 : 1.3, class: "city-circle",
    }, group);
    el("title", {}, group).textContent = `${CITIES[key][2]}${occupant >= 0 ? I18n.t` · Estación de ${game.players[occupant].name}` : ""}`;
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
    if (occupant >= 0) group.classList.add("has-station");
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
    if (board3D && type === "focus") {
      const safe = mapSafeArea($("mapscroll").getBoundingClientRect());
      const points = cities.map(key => RailMap.cities[key]);
      if (points.some(([x, y]) => { const p = board3D.project(x, y); return p.x < safe.x + 30 || p.x > safe.x + safe.width - 30 || p.y < safe.y + 30 || p.y > safe.y + safe.height - 30; })) {
        mapCenter = { x: points.reduce((n, p) => n + p[0], 0) / points.length, y: points.reduce((n, p) => n + p[1], 0) / points.length };
        applyZoom();
      }
    }
    updateCityLabels();
    syncBoard3D();
  });
  for (const type of ["pointerleave", "blur"]) element.addEventListener(type, () => {
    labelPriority = [];
    updateCityLabels();
    syncBoard3D();
  });
}
function updateCityLabels() {
  const view = mapViewSize();
  if (!view) return;
  const labelScale = GameUI.cityLabelScale(zoom), baseline = 13 * labelScale;
  const viewport = $("mapscroll");
  const labelArea = (board3D || compactMedia.matches) ? mapSafeArea(viewport.getBoundingClientRect(), true)
    : { x: 0, y: 0, width: viewport.clientWidth, height: viewport.clientHeight };
  const origin = { x: view.x, y: view.y };
  const screen = ([x, y]) => [(x - origin.x) / view.scale, (y - origin.y) / (view.scaleY || view.scale)];
  const entries = [];
  const groups = new Map();
  for (const g of $("board").querySelectorAll("[data-city-label]")) {
    const key = g.dataset.cityLabel, [x, y] = screen(RailMap.cities[key]);
    const visible = x >= labelArea.x && y >= labelArea.y && x <= labelArea.x + labelArea.width && y <= labelArea.y + labelArea.height;
    g.style.display = visible ? "" : "none";
    if (!visible) continue;
    groups.set(key, g);
    g.querySelector("text").style.fontSize = `${15 * labelScale}px`;
    entries.push({ key, x, y, width: g.querySelector("text").getComputedTextLength() });
  }
  const obstacles = MAP_GEOMETRY.flatMap(r => r.cells.map(cell => {
    const [x, y] = screen([cell.x, cell.y]), angle = cell.angle * Math.PI / 180;
    const width = (Math.abs(Math.cos(angle)) * cell.width + Math.abs(Math.sin(angle)) * cell.height) / view.scale;
    const height = (Math.abs(Math.sin(angle)) * cell.width + Math.abs(Math.cos(angle)) * cell.height) / (view.scaleY || view.scale);
    return { x: x - width / 2, y: y - height / 2, width, height };
  }));
  for (const player of game.players) for (const city of player.placed) {
    const [x, y] = screen(RailMap.cities[city]), scale = Math.max(.8 / view.scale, 1);
    obstacles.push({ x: x - 10 * scale, y: y - (board3D ? 20 : 11) * scale, width: 20 * scale, height: (board3D ? 29 : 20) * scale });
  }
  const chosenRoute = game?.routes.find(r => r.id === selected);
  const important = new Set([...labelPriority, ...(chosenRoute ? [chosenRoute.a, chosenRoute.b] : []), stationCity]);
  const destinations = new Set(board3D ? game.tickets.flatMap(t => [t.a, t.b]) : []);
  if (board3D) for (const entry of entries) entry.priority = important.has(entry.key) ? 3 : destinations.has(entry.key) ? 1 : 0;
  let displayed = entries;
  if (zoom < .75 || view.scale > 1.5) {
    // At overview scale, a few nearby labels are useful; a cloud of leaders isn't.
    displayed = GameUI.overviewLabels(entries, board3D ? new Set([...important, ...destinations]) : important);
    const keys = new Set(displayed.map(entry => entry.key));
    for (const entry of entries) if (!keys.has(entry.key)) groups.get(entry.key).style.display = "none";
  }
  const relative = item => ({ ...item, x: item.x - labelArea.x, y: item.y - labelArea.y });
  const placements = RailMap.placeLabels(displayed.map(relative), labelArea.width, labelArea.height, obstacles.map(relative), { height: 18 * labelScale, baseline },
    board3D ? { previous: labelPlacements3D, maxLeader: 36, hideColliding: true } : {});
  if (board3D) {
    const shown = new Set(placements.map(p => p.key));
    for (const entry of entries) if (!shown.has(entry.key)) groups.get(entry.key).style.display = "none";
  }
  for (const box of placements) {
    const g = groups.get(box.key), city = RailMap.cities[box.key], [sx, sy] = screen(city);
    const dx = box.x + labelArea.x - sx, dy = box.y + labelArea.y - sy;
    if (board3D) labelPlacements3D.set(box.key, { dx, dy });
    // Stable screen sizing at overview; type grows gently once zoom exceeds 2.5×.
    g.setAttribute("transform", `translate(${city[0]} ${city[1]}) scale(${view.scale} ${view.scaleY || view.scale})`);
    const text = g.querySelector("text");
    text.setAttribute("x", dx);
    text.setAttribute("y", dy + baseline);
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
  const owner = r ? GameUI.routeOwner(game, r, seat) : stationOwner < 0 ? null : { seat: stationOwner, color: GameUI.playerColor(game.players[stationOwner].color), label: I18n.t`Estación de ${game.players[stationOwner].name}` };
  const stationsLeft = game.players[seat]?.stations || 0;
  const canBuild = !owner && amIUp() && !game.drawCount && (r || stationsLeft > 0);
  const title = r ? `${CITIES[r.a][2]} — ${CITIES[r.b][2]}` : CITIES[target.city][2];
  const detail = r ? `${routeRequirementText(r)}${r.tunnel ? I18n.t(" · Túnel") : ""}${r.ferry ? I18n.t(" · Ferri") : ""}`
    : stationsLeft > 0 ? I18n.t`Estación · ${plural(4 - stationsLeft, "carta")} del mismo color` : I18n.t("Ya construiste tus 3 estaciones");
  const menu = $("mapMenu");
  menu.innerHTML = I18n.t`<button class="menu-close" aria-label="Cerrar menú">×</button><h3>${escapeHTML(title)}</h3>${owner
    ? `<p class="route-ownership"><span>${escapeHTML(owner.label)}</span></p>`
    : `<p>${escapeHTML(detail)}</p>${canBuild ? `<button id="startBuild" class="primary full">${r ? "Construir" : I18n.t("Construir estación")}</button>` : ""}`}`;
  if (owner) {
    menu.style.setProperty("--owner-color", owner.color);
    menu.style.setProperty("--owner-surface", GameUI.playerFinish(owner.color) === "gold" ? "var(--gold-metal)" : owner.color);
  } else {
    menu.style.removeProperty("--owner-color");
    menu.style.removeProperty("--owner-surface");
  }
  menu.classList.remove("hidden");
  const stage = $("game").getBoundingClientRect(), source = event.currentTarget.getBoundingClientRect();
  const x = event.clientX || source.x + source.width / 2, y = event.clientY || source.y + source.height / 2;
  const usable = compactMedia.matches ? mapSafeArea($("mapscroll").getBoundingClientRect()) : { x: 8, y: 8, width: stage.width - 20, height: stage.height - 20 };
  menu.style.left = Math.max(usable.x, Math.min(x - stage.x + 12, usable.x + usable.width - menu.offsetWidth)) + "px";
  menu.style.top = Math.max(usable.y, Math.min(y - stage.y + 8, usable.y + usable.height - menu.offsetHeight)) + "px";
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
  const groups = GameUI.paymentGroups(options);
  let group = groups[0], paymentIndex = 0;
  let chosen = group.options[0]; // Server-valid combinations, minimum wildcards first.
  showDialog(r ? I18n.t("Construir ruta") : I18n.t("Construir estación"),
    I18n.t`${dialogClockHTML()}<div class="build-content"><div class="build-summary"><strong>${escapeHTML(r ? routeName(r) : I18n.t`Estación en ${cityName(buildTarget.city)}`)}</strong>
    ${r ? I18n.t`<div class="build-track" aria-hidden="true">${'<i></i>'.repeat(r.n)}</div><span>${r.n} vagones · <b>+${GameUI.ROUTE_POINTS[r.n]} puntos</b>${r.tunnel ? I18n.t(" · Túnel") : r.ferry ? I18n.t(" · Ferri") : ""}</span>` : I18n.t`<span>Estación ${result.cost} de 3 · ${plural(result.cost, "carta")}</span>`}</div>
    <h3 class="payment-heading">${r?.tunnel ? I18n.t("Pagarás inicialmente") : I18n.t("Pagarás")}</h3>
    <div id="paymentPreview" class="payment-preview build-payment" aria-live="polite"></div>
    ${options.length > 1 ? I18n.t`<details class="change-payment"><summary>Cambiar cartas <small>Color y locomotoras</small></summary><div class="payment-controls">
      ${groups.length > 1 ? I18n.t`<fieldset class="payment-colors"><legend>Color de las cartas normales</legend><div class="payment-color-grid">${groups.map((g, i) => `<label class="payment-color"><input type="radio" name="buildColor" value="${g.color}" ${i === 0 ? "checked" : ""}><img src="assets/cards/${g.color}.svg" alt="" draggable="false"><span>${N[g.color]}<small>${plural(game.hand.filter(c => c === g.color).length, "disponible")}</small></span></label>`).join("")}</div></fieldset>` : ""}
      <div class="payment-wilds"><div><strong id="wildLabel">Locomotoras</strong><small>${plural(game.hand.filter(c => c === "wild").length, "disponible")}</small></div>
        <div class="wild-stepper" role="group" aria-labelledby="wildLabel" aria-describedby="wildHint"><button id="wildLess" type="button" aria-label="Usar una locomotora menos">−</button><output id="wildCount" aria-label="Locomotoras a utilizar">${chosen.wild}</output><button id="wildMore" type="button" aria-label="Usar una locomotora más">+</button></div>
      </div><p id="wildHint" class="wild-hint"></p>
    </div></details>` : ""}
    <p class="build-note">${r?.tunnel ? I18n.t("Revelaremos hasta 3 cartas del mazo. Cada coincidencia de color o locomotora añade 1 carta. Después podrás pagar el suplemento o desistir.") : r?.ferry ? I18n.t`Incluye al menos ${r.ferry} locomotora(s) obligatoria(s) para este ferry.` : I18n.t("Pago sugerido: utiliza la menor cantidad posible de locomotoras.")}</p>
    </div>
    <div class="dialog-actions"><button id="confirmBuild" class="primary full">${r?.tunnel ? I18n.t("Revelar cartas del túnel") : I18n.t("Pagar y construir")}</button>
    <button id="cancelBuild" class="tertiary full">Cancelar</button></div>`, false, true);
  $("dialog").classList.add("build-dialog");
  if (r) $("dialog").querySelector(".build-track").style.setProperty("--track-color", C[r.color]);
  const updatePreview = () => {
    const preview = $("paymentPreview");
    preview.replaceChildren();
    if (chosen.regular) preview.appendChild(colorCard(chosen.color, chosen.regular));
    if (chosen.wild) preview.appendChild(colorCard("wild", chosen.wild));
    const caption = document.createElement("span");
    caption.textContent = I18n.t`${paymentDescription(chosen)} · ${result.cost} en total`;
    preview.appendChild(caption);
    if ($("wildCount")) {
      $("wildCount").textContent = chosen.wild;
      $("wildLess").disabled = paymentIndex === 0;
      $("wildMore").disabled = paymentIndex === group.options.length - 1;
      const min = group.options[0].wild, max = group.options.at(-1).wild;
      $("wildHint").textContent = chosen.regular === 0 ? I18n.t("Solo locomotoras: no gastarás cartas de color.")
        : `${min === max ? I18n.t`Cantidad fija: ${min}` : I18n.t`Puedes usar de ${min} a ${max}`}.${r?.ferry ? I18n.t` Este ferry exige al menos ${r.ferry}.` : min ? I18n.t` Necesitas al menos ${min} para completar el pago.` : I18n.t(" Cada locomotora sustituye una carta de color.")}`;
    }
  };
  for (const input of document.querySelectorAll('[name="buildColor"]')) input.onchange = () => {
    group = groups.find(g => g.color === input.value);
    paymentIndex = 0; chosen = group.options[0]; updatePreview();
  };
  for (const [id, step] of [["wildLess", -1], ["wildMore", 1]]) if ($(id)) $(id).onclick = () => {
    paymentIndex = Math.max(0, Math.min(group.options.length - 1, paymentIndex + step));
    chosen = group.options[paymentIndex]; updatePreview();
  };
  $("cancelBuild").onclick = closeOptionalDialog;
  $("confirmBuild").onclick = () => {
    if (buildSubmitting) return;
    const validation = GameUI.construction(game, seat, buildTarget);
    if (validation.reason) { toast(validation.reason); return; }
    if (!validation.options.some(o => o.color === chosen.color && o.wild === chosen.wild && o.regular === chosen.regular)) return error(I18n.t("Ese pago ya no está disponible."));
    if (!sock || sock.readyState !== WebSocket.OPEN) return error(I18n.t("Sin conexión."));
    buildSubmitting = true;
    $("confirmBuild").disabled = true;
    act(r ? "claim" : "station", { ...buildTarget, color: chosen.color, wildCount: chosen.wild });
  };
  updatePreview();
  updateClocks();
}
function dialogClockHTML() {
  return game?.current === seat && ["play", "tunnel"].includes(game.phase) && !game.turnWaiting
    ? I18n.t('<div class="dialog-turn-clock">Tu turno <strong data-clock="turn" data-clock-format="timer"></strong></div>') : "";
}
$("drawblind").onclick = () => act("draw_train", { index: -1 });
$("drawtickets").onclick = () => act("draw_tickets");
$("pass").onclick = () => act("pass");
function showDialog(title, body, ticketDialog = false, dismissible = false) {
  resultMapCleanup?.(); resultMapCleanup = null;
  closeMapMenu();
  hoveredDestination = null;
  $("overlay").classList.remove("hidden");
  $("dialog").classList.toggle("ticket-dialog", ticketDialog);
  $("dialog").classList.remove("tunnel-dialog", "results-dialog", "build-dialog");
  delete $("dialog").dataset.tunnelReveal;
  delete $("dialog").dataset.tunnelDecision;
  $("dialog").setAttribute("aria-labelledby", "dialogTitle");
  $("dialog").innerHTML =
    `${dismissible ? I18n.t('<button class="dialog-close" aria-label="Cerrar ventana">×</button>') : ""}<h2 id="dialogTitle" tabindex="-1">${title}</h2>${body}<p class="err" id="errorMsg"></p>`;
  const clock = $("dialog").querySelector(".dialog-turn-clock");
  if (clock) {
    const heading = document.createElement("div"); heading.className = "dialog-heading";
    $("dialogTitle").before(heading); heading.append($("dialogTitle"), clock);
  }
  if (dismissible) $("dialog").querySelector(".dialog-close").onclick = closeOptionalDialog;
  $("dialogTitle").focus({ preventScroll: true });
  updateDestinationSpotlight();
}
function closeOptionalDialog() {
  if (!uiDialog) return;
  if (game?.turnWaiting && game.current === seat && game.ticketOffer) return;
  const choosing = uiDialog === "tickets";
  const closingResults = uiDialog === "results";
  if (closingResults) { resultMapCleanup?.(); resultMapCleanup = null; }
  const returningToMap = uiDialog === "routes" && compactMedia.matches;
  uiDialog = buildTarget = null;
  buildSubmitting = false;
  if (!choosing) pendingChoiceKey = null;
  $("overlay").classList.add("hidden");
  hoveredDestination = null;
  if (returningToMap) setCompactPanel("map");
  const returnTarget = returningToMap ? document.querySelector('[data-panel="map"]')
    : dialogReturnFocus?.isConnected ? dialogReturnFocus : $(closingResults ? "viewResults" : "viewRoutes");
  returnTarget.focus({ preventScroll: true });
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
for (const type of ["pointerover", "pointerout"]) $("ticketList").addEventListener(type, event => {
  // Touch browsers synthesize hover/focus around taps. Restored keyboard focus
  // should keep its outline without switching on a map preview.
  if (event.pointerType !== "mouse" || !matchMedia("(any-hover: hover)").matches || uiDialog) return;
  const row = event.target.closest("[data-destination]");
  if (!row || row.contains(event.relatedTarget)) return;
  const id = +row.dataset.destination;
  if (type === "pointerover") hoveredDestination = id;
  if (type === "pointerout" && hoveredDestination === id) hoveredDestination = null;
  updateDestinationSpotlight();
});
$("toggleDestinations").onclick = () => {
  if (!game?.tickets.length) return;
  allDestinationsVisible = !allDestinationsVisible;
  hoveredDestination = null;
  if (allDestinationsVisible) {
    resultMapSelection = null;
    $("resultContext").classList.add("hidden");
  }
  if (compactMedia.matches) setCompactPanel("map");
  updateDestinationSpotlight();
};
// Numbers belong to the ticket, not the city: a shared endpoint carries all of
// its badges. Wrap long collections so the labels remain inside the viewport.
function destinationBadgeSize(count) {
  return { width: Math.min(4, count) * 22, height: Math.ceil(count / 4) * 20 };
}
function drawDestinationBadges(el, parent, entries, x, y, scale = 1) {
  const size = destinationBadgeSize(entries.length);
  const group = el("g", { class: "destination-numbers", transform: `translate(${x} ${y}) scale(${scale})` }, parent);
  entries.forEach((entry, i) => {
    const rowCount = Math.min(4, entries.length - Math.floor(i / 4) * 4);
    const bx = (i % 4 - (rowCount - 1) / 2) * 22, by = Math.floor(i / 4) * 20;
    const badge = el("g", { "data-destination-number": entry.number, "data-completed": !!entry.completed }, group);
    el("rect", { x: bx - 10, y: by, width: 20, height: 18, rx: 5, fill: entry.completed ? "#f3d88d" : ticketColor(entry.number - 1), stroke: "#fff9e5", "stroke-width": 1.2 }, badge);
    el("text", { x: bx, y: by + 12.5, "text-anchor": "middle", fill: entry.completed ? "#3c351c" : "#fff", "font-size": 11, "font-weight": 800 }, badge).textContent = entry.number;
  });
  return size;
}
function updateDestinationSpotlight() {
  const toggle = $("toggleDestinations");
  toggle.disabled = !game?.tickets.length;
  toggle.setAttribute("aria-pressed", String(allDestinationsVisible && !toggle.disabled));
  toggle.title = toggle.disabled ? I18n.t("Conserva billetes para resaltar tus destinos") : allDestinationsVisible ? I18n.t("Ocultar mis destinos") : I18n.t("Resaltar mis destinos");
  for (const label of $("board").querySelectorAll("[data-city-label]")) label.style.removeProperty("opacity");
  let overlay = $("destinationSpotlight");
  if (!overlay) {
    overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.id = "destinationSpotlight"; overlay.setAttribute("aria-hidden", "true");
    $("mapscroll").appendChild(overlay);
  }
  const selection = !uiDialog && $("overlay").classList.contains("hidden") &&
    GameUI.destinationSpotlightSelection(game, hoveredDestination, allDestinationsVisible, resultMapSelection);
  boardSpotlight = selection ? {
    routes: selection.routes || [], stationRoutes: selection.stationRoutes || [],
    stations: selection.stations || [], endpoints: selection.endpoints || [],
  } : null;
  syncBoard3D();
  overlay.classList.toggle("is-visible", !!selection);
  overlay.classList.toggle("is-overview", !!selection?.overview);
  overlay.replaceChildren();
  if (!selection) return;
  // The spotlight supplies endpoint labels; hide all base names and leaders.
  for (const label of $("board").querySelectorAll("[data-city-label]")) label.style.opacity = "0";
  const view = mapViewSize(); if (!view) return;
  const rect = $("mapscroll").getBoundingClientRect(), safe = mapSafeArea(rect);
  overlay.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  const el = svgElements(overlay);
  // Only readable endpoint labels/numbers belong above the Three.js scene.
  const labels = new Map(), endpoints = [];
  for (const key of new Set(selection.endpoints || [])) {
    const [wx, wy] = RailMap.cities[key];
    const p = GameUI.endpointPosition({ x: (wx - view.x) / view.scale, y: (wy - view.y) / (view.scaleY || view.scale) }, safe);
    const marker = el("g", { class: "destination-beacon", "data-endpoint": key, "data-offscreen": p.outside });
    el("circle", { cx: p.x, cy: p.y, r: 13, fill: "#f9df8b", opacity: .2 }, marker);
    el("circle", { cx: p.x, cy: p.y, r: 8, fill: "#fff9df", stroke: "#e4bd59", "stroke-width": 2 }, marker);
    if (p.outside) el("path", { d: "M-2-3L2 0-2 3", fill: "none", stroke: "#24444e", "stroke-width": 1.7, transform: `translate(${p.x} ${p.y}) rotate(${p.angle})` }, marker);
    else el("circle", { cx: p.x, cy: p.y, r: 3.5, fill: "#24444e" }, marker);
    const label = el("text", { class: "destination-beacon-label" }, marker); label.textContent = CITIES[key][2];
    label.style.fontSize = `${15 * GameUI.cityLabelScale(zoom)}px`;
    const numbers = (selection.destinations || []).filter(t => t.a === key || t.b === key);
    const badges = destinationBadgeSize(numbers.length);
    endpoints.push({ key, x: p.x - safe.x, y: p.y - safe.y, width: Math.max(label.getComputedTextLength(), badges.width) });
    labels.set(key, { label, marker, numbers, badges });
  }
  // Use the same collision-aware placement as the base map, now in screen
  // coordinates so many destinations stay readable at any zoom level.
  const labelScale = GameUI.cityLabelScale(zoom);
  const badgeHeight = Math.max(0, ...[...labels.values()].map(l => l.badges.height));
  for (const box of RailMap.placeLabels(endpoints, safe.width, safe.height, [], { height: badgeHeight + 18 * labelScale, baseline: badgeHeight + 14 * labelScale })) {
    const { label, marker, numbers } = labels.get(box.key);
    const x = safe.x + box.x + box.width / 2, y = safe.y + box.y;
    label.setAttribute("text-anchor", "middle"); label.setAttribute("x", x);
    label.setAttribute("y", y + badgeHeight + 14 * labelScale);
    drawDestinationBadges(el, marker, numbers, x, y);
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

  const preview = hoveredTicket;
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
    drawStation(el, group, GameUI.playerColor(player.color), .9, "tickets");
    el("title", {}, group).textContent = I18n.t`Estación de ${player.name} · ${CITIES[city][2]}`;
  }
  const endpoints = new Map();
  for (const { ticket, i, key, active } of visible) {
    const number = GameUI.destinationNumber(game, ticket.id, i), color = ticketColor(number - 1);
    const [x, y] = RailMap.cities[ticket.a], [xx, yy] = RailMap.cities[ticket.b];
    const strong = active || preview === key;
    const opacity = !strong ? .25 : preview !== null && preview !== key ? .5 : 1;
    const completed = GameUI.destinationStatus(game, ticket.id)?.completed;
    const path = completed ? game.ticketPaths?.find(p => p.id === ticket.id) : null;
    for (const routeId of path?.routes || []) {
      const borrowed = path.stationRoutes.includes(routeId);
      const trace = el("path", { d: MAP_GEOMETRY[routeId].d, fill: "none", stroke: borrowed ? "#c69643" : "#e7b639", "stroke-width": 15, opacity: opacity * .75, "stroke-linecap": "round", ...(borrowed ? { "stroke-dasharray": "4 4" } : {}), "data-completed-ticket": ticket.id, "data-path-route": routeId }, highlights);
      el("title", {}, trace).textContent = borrowed ? I18n.t("Tramo prestado mediante estación") : I18n.t("Conexión completada");
    }
    const g = el("g", {
      class: "ticket-connection", "data-ticket-index": i,
      opacity,
    });
    el("title", {}, g).textContent =
      I18n.t`${CITIES[ticket.a][2]} → ${CITIES[ticket.b][2]} · ${ticket.p} puntos`;
    const line = { x1: x, y1: y, x2: xx, y2: yy, "stroke-linecap": "round" };
    if (!path?.routes.length) {
      el("line", { ...line, stroke: "#fffefa", "stroke-width": 6 }, g);
      el("line", {
      ...line, stroke: color, "stroke-width": 2.8,
      "stroke-dasharray": "6 6", class: "ticket-connector",
      }, g);
    }
    // A number as well as a color keeps overlapping destinations identifiable.
    const middle = path?.routes.length ? MAP_GEOMETRY[path.routes[Math.floor(path.routes.length / 2)]].cells : null;
    const mid = middle?.[Math.floor(middle.length / 2)];
    const mx = mid?.x ?? (x + xx) / 2, my = mid?.y ?? (y + yy) / 2;
    const marker = el("g", { class: "ticket-map-marker", transform: `translate(${mx} ${my})` }, g);
    el("circle", { r: 11, fill: color, stroke: "#fffefa", "stroke-width": 2 }, marker);
    el("text", { y: 4, "text-anchor": "middle", class: "ticket-map-number" }, marker).textContent = number;
    for (const city of strong ? [ticket.a, ticket.b] : []) {
      if (!endpoints.has(city)) endpoints.set(city, []);
      endpoints.get(city).push({ number, completed: !!completed });
    }
  }
  for (const [city, indexes] of endpoints) {
    const [x, y] = RailMap.cities[city], name = CITIES[city][2];
    const g = el("g", { class: "ticket-endpoint", "data-city": city });
    el("circle", { cx: x, cy: y, r: 5, fill: "#fffefa", stroke: "#24495a", "stroke-width": 1.3 }, g);
    g.dataset.destinations = JSON.stringify(indexes);
    el("circle", { cx: x, cy: y, r: 8, fill: "none", stroke: "#d5af55", "stroke-width": 2.5 }, g);
    const offset = LABEL_OFFSETS[city] || [0, -19];
    const radius = 8 + (indexes.length - 1) * 4;
    el("text", {
      x, y: y + (offset[1] > 0 ? radius + 17 : -radius - 7),
      "text-anchor": "middle", class: "ticket-city-label",
    }, g).textContent = name;
  }
  layoutTicketMapLabels();
}
function layoutTicketMapLabels() {
  const svg = $("ticketMap");
  if (!svg || !svg.clientWidth || !svg.clientHeight) return;
  const scale = Math.max(MAP_BOUNDS.width / svg.clientWidth, MAP_BOUNDS.height / svg.clientHeight);
  for (const marker of svg.querySelectorAll(".ticket-map-marker")) {
    marker.querySelector("circle").setAttribute("r", 8 * scale);
    marker.querySelector("circle").setAttribute("stroke-width", 1.5 * scale);
    const text = marker.querySelector("text");
    text.style.fontSize = `${10 * scale}px`;
    text.setAttribute("y", 3.5 * scale);
  }
  const ox = (svg.clientWidth - MAP_BOUNDS.width / scale) / 2, oy = (svg.clientHeight - MAP_BOUNDS.height / scale) / 2;
  const groups = [...svg.querySelectorAll(".ticket-endpoint")];
  let badgeHeight = 0;
  const labels = groups.map(group => {
    group.querySelector(".destination-numbers")?.remove();
    const key = group.dataset.city, [x, y] = RailMap.cities[key], text = group.querySelector(".ticket-city-label");
    const badges = destinationBadgeSize(JSON.parse(group.dataset.destinations).length);
    badgeHeight = Math.max(badgeHeight, badges.height);
    text.style.fontSize = `${11 * scale}px`; text.style.strokeWidth = `${3 * scale}px`;
    text.setAttribute("text-anchor", "start");
    return { key, x: ox + (x - MAP_BOUNDS.x) / scale, y: oy + (y - MAP_BOUNDS.y) / scale, width: Math.max(text.getComputedTextLength() / scale, badges.width) };
  });
  const placements = RailMap.placeLabels(labels, svg.clientWidth, svg.clientHeight, [], { height: badgeHeight + 14, baseline: badgeHeight + 11 });
  for (const place of placements) {
    const group = groups.find(g => g.dataset.city === place.key), text = group.querySelector(".ticket-city-label");
    const x = MAP_BOUNDS.x + (place.x + place.width / 2 - ox) * scale, y = MAP_BOUNDS.y + (place.y - oy) * scale;
    text.setAttribute("text-anchor", "middle"); text.setAttribute("x", x);
    text.setAttribute("y", y + (badgeHeight + 11) * scale);
    drawDestinationBadges(svgElements(svg), group, JSON.parse(group.dataset.destinations), x, y, scale);
  }
}
function updateTicketSelection(tickets, min) {
  const count = ticketChoices.size;
  $("ticketCount").textContent = min ? I18n.t`${count} de ${tickets.length} seleccionados · mínimo ${min}` : I18n.t`${count} de ${tickets.length} resaltados en el mapa`;
  if ($("keep")) $("keep").disabled = count < min;
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.classList.toggle("is-selected", ticketChoices.has(i));
    row.classList.toggle("is-preview", hoveredTicket === i);
  }
  for (const row of $("dialog").querySelectorAll("[data-ticket-id]")) {
    const status = GameUI.destinationStatus(game, +row.dataset.ticketId);
    row.classList.toggle("is-complete", !!status?.completed);
    row.querySelector(".ticket-complete").textContent = status?.completed ? I18n.t`✓ Completada${status.viaStation ? I18n.t(" · estación") : ""}` : "";
  }
  // Owned tickets may complete while this dialog is open. Reorder their rows,
  // never the offered tickets or their submitted indexes, and preserve focus.
  const reorder = (container, owned) => {
    if (!container) return;
    const rows = GameUI.destinationEntries(game, owned).map(({ ticket }) => container.querySelector(`[data-ticket-id="${ticket.id}"]`));
    if (rows.some((row, i) => row !== container.children[i])) {
      const focus = container.contains(document.activeElement) ? document.activeElement : null;
      container.append(...rows);
      focus?.focus({ preventScroll: true });
    }
  };
  if (uiDialog === "routes") reorder($("dialog").querySelector(".ticket-choices"), tickets);
  reorder($("dialog").querySelector(".retained-choices"), game.tickets);
  renderTicketMap(tickets);
  updateClocks();
}
function bindTicketPreview(row, key, tickets, min) {
  // Touch can leave synthesized hover and focus behind after a tap. Neither
  // should override the checkbox. Keyboard focus remains a CSS-only outline.
  row.addEventListener("pointerenter", event => {
    if (event.pointerType !== "mouse" || !matchMedia("(any-hover: hover)").matches) return;
    hoveredTicket = key;
    updateTicketSelection(tickets, min);
  });
  row.addEventListener("pointerleave", () => {
    if (hoveredTicket !== key) return;
    hoveredTicket = null;
    updateTicketSelection(tickets, min);
  });
  row.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" || hoveredTicket === null) return;
    hoveredTicket = null;
    updateTicketSelection(tickets, min);
  });
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
  hoveredTicket = null;
  showDialog(
    viewing ? I18n.t("Tus rutas de destino") : game.phase === "initial" ? I18n.t("Elige tus billetes iniciales") : I18n.t("Nuevos billetes de destino"),
    I18n.t`<p class="ticket-intro">${viewing ? I18n.t("Tus vías construidas y el recorrido de tus destinos completados. Resaltar no descarta billetes.") : I18n.t`Conserva al menos ${min} billete${min > 1 ? "s" : ""}. Tus destinos permanecerán secretos hasta el final.`}</p>
    ${!viewing ? `<div class="ticket-deadline"><strong data-clock="${choosing ? "offer" : "initial"}"></strong><span>${waiting ? I18n.t("Primero elige tus billetes. Después tendrás 60 segundos completos para tu nuevo turno.") : choosing ? I18n.t("La partida continúa. Sin confirmar, conservarás 1 billete al azar.") : I18n.t("Todos eligen a la vez, con un minuto compartido. Sin confirmar, conservarás 2 billetes al azar.")}</span>${choosing && !waiting ? I18n.t('<button type="button" id="minimizeTickets">Elegir después ↗</button>') : ""}</div>` : ""}
    <div class="ticket-layout">
      <figure class="ticket-map-panel">
        <svg id="ticketMap" viewBox="${MAP_BOUNDS.x} ${MAP_BOUNDS.y} ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}" role="img" aria-label="Vista de los destinos seleccionados" aria-describedby="ticketMapCaption"></svg>
        <figcaption id="ticketMapCaption">Tus fichas siempre visibles · Dorado: conexión completada · Discontinuas: objetivos o tramos prestados</figcaption>
      </figure>
      <div class="ticket-options">
        <p class="ticket-options-title">${viewing ? I18n.t("Tus destinos") : I18n.t("Billetes para conservar")}</p>
        <p class="ticket-options-hint">${viewing ? I18n.t("Toca los billetes que quieras resaltar.") : I18n.t("Toca para comparar y elegir qué conservar; confirma abajo.")}</p>
        <div class="ticket-collections"><div class="ticket-choices">${tickets.map((t, i) => I18n.t`
          <label class="choice ticket-choice" data-ticket-index="${i}" data-ticket-id="${t.id}">
            <input type="checkbox" class="keep" value="${i}" ${ticketChoices.has(i) ? "checked" : ""}>
            <span class="ticket-number"><span class="sr-only">Destino </span>${GameUI.destinationNumber(game, t.id, i)}</span>
            <span class="ticket-choice-text"><b>${escapeHTML(CITIES[t.a][2])} → ${escapeHTML(CITIES[t.b][2])}</b><small>${t.p} puntos ${t.long ? I18n.t('<span class="longtag">LARGA</span>') : ""}</small><small class="ticket-complete"></small></span>
          </label>`).join("") || I18n.t('<p>Todavía no has conservado billetes.</p>')}</div>
        ${choosing && game.tickets.length ? I18n.t`<div class="retained-heading">Tus destinos actuales <small>Solo comparar</small></div><div class="retained-choices">${game.tickets.map(t => I18n.t`<div class="retained-choice" data-ticket-id="${t.id}" data-owned-ticket="${t.id}"><button class="ticket-eye" type="button" aria-pressed="${retainedVisible.has(t.id)}" aria-label="Resaltar ${escapeHTML(CITIES[t.a][2])} a ${escapeHTML(CITIES[t.b][2])}">◉</button><span class="ticket-number"><span class="sr-only">Destino </span>${GameUI.destinationNumber(game, t.id)}</span><span class="ticket-choice-text"><b>${escapeHTML(CITIES[t.a][2])} → ${escapeHTML(CITIES[t.b][2])}</b><small>${t.p} puntos</small><small class="ticket-complete"></small></span></div>`).join("")}</div>` : ""}</div>
        <div class="ticket-confirm">
          <p id="ticketCount" role="status" aria-live="polite"></p>
          ${viewing ? I18n.t('<button class="secondary full" id="closeRoutes">Volver al mapa</button>') : I18n.t('<button class="primary full" id="keep" aria-describedby="ticketCount">Conservar seleccionados</button>')}
        </div>
      </div>
    </div>`,
    true,
    viewing || (choosing && !waiting),
  );
  $("dialog").dataset.waiting = String(waiting);
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.style.setProperty("--ticket-color", ticketColor(GameUI.destinationNumber(game, tickets[i].id, i) - 1));
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) ticketChoices.add(i);
      else ticketChoices.delete(i);
      hoveredTicket = null;
      if (!viewing) localStorage.setItem(draftKey, JSON.stringify([...ticketChoices]));
      updateTicketSelection(tickets, min);
    });
    bindTicketPreview(row, i, tickets, min);
  }
  for (const row of $("dialog").querySelectorAll("[data-owned-ticket]")) {
    const id = +row.dataset.ownedTicket, key = `owned-${id}`, button = row.querySelector("button");
    row.style.setProperty("--ticket-color", ticketColor(GameUI.destinationNumber(game, id) - 1));
    button.onclick = () => { retainedVisible.has(id) ? retainedVisible.delete(id) : retainedVisible.add(id); hoveredTicket = null; button.setAttribute("aria-pressed", String(retainedVisible.has(id))); row.classList.toggle("is-highlighted", retainedVisible.has(id)); updateTicketSelection(tickets, min); };
    bindTicketPreview(row, key, tickets, min);
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
  if(replayMode){if(uiDialog==="results")showResults();else if(uiDialog==="routes")showTicketDialog(game.tickets,0,true);else $("overlay").classList.add("hidden");return;}
  if (tunnelReveal) { showTunnelReveal(); return; }
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
  if (!d) return I18n.t('<p>Reinicia el servidor actualizado para consultar el desglose de esta partida.</p>');
  const view = resultView(result.seat);
  const categories = [["routes", I18n.t("Rutas"), result.route], ["destinations", I18n.t("Destinos"), result.destination],
    ["stations", I18n.t("Estaciones"), result.stations], ["express", I18n.t("Camino más largo"), result.express]];
  return I18n.t`<div class="score-categories" role="tablist" aria-label="Puntos de ${escapeHTML(result.name)}">${categories.map(([key, label, points]) =>
    `<button type="button" role="tab" id="score-tab-${result.seat}-${key}" data-score-category="${key}" aria-selected="${view.category === key}" aria-controls="score-panel-${result.seat}" tabindex="${view.category === key ? 0 : -1}"><span>${label}</span><strong>${signedPoints(points)}</strong></button>`).join("")}</div>
    <div id="score-panel-${result.seat}" class="score-panel" role="tabpanel" aria-labelledby="score-tab-${result.seat}-${view.category}"></div>`;
}
function resultView(playerSeat) {
  if (!resultViews.has(playerSeat)) resultViews.set(playerSeat, { category: "routes", index: null, expressSeat: playerSeat, list: false, expanded: false });
  return resultViews.get(playerSeat);
}
function resultChoice(index, label, points, selected, extra = "", className = "") {
  return `<button type="button" class="score-choice ${className}" data-score-choice="${index}" aria-pressed="${selected}"><span>${label}${extra ? `<small>${extra}</small>` : ""}</span>${points === null ? "" : `<strong>${signedPoints(points)}</strong>`}</button>`;
}
function renderResultPanel(result) {
  resultMapCleanup?.(); resultMapCleanup = null;
  const panel = $(`score-panel-${result.seat}`); if (!panel || !result.details) return;
  const d = result.details, view = resultView(result.seat), category = view.category;
  panel.classList.toggle("is-map-expanded", view.expanded);
  panel.setAttribute("aria-labelledby", `score-tab-${result.seat}-${category}`);
  let title, total, content = "", caption = "", empty = "";
  if (category === "routes") {
    title = I18n.t("Rutas construidas"); total = signedPoints(result.route);
    const chosen = d.routes[view.index];
    caption = chosen ? I18n.t`${routeName(chosen)} · ${chosen.length} vagones · +${chosen.points} puntos` : I18n.t("Toca los puntos de un tramo");
    empty = d.routes.length ? "" : I18n.t("Sin rutas construidas");
    if (empty) caption = "";
    content = I18n.t`<details class="score-route-list" ${view.list ? "open" : ""}><summary>Ver lista · ${d.routes.length} tramos</summary><div class="score-choice-list">${d.routes.map((r, i) => resultChoice(i, escapeHTML(routeName(r)), r.points, view.index === i, I18n.t`${r.length} vagones`)).join("")}</div></details>`;
    if (empty) content = "";
    if (d.routeAdjustment) content += I18n.t`<p class="score-warning">Ajuste de partida antigua: ${signedPoints(d.routeAdjustment)}. El registro guardado difiere del mapa.</p>`;
  } else if (category === "destinations") {
    title = I18n.t("Billetes de destino"); total = signedPoints(result.destination);
    const index = view.index ?? 0, t = d.destinations[index];
    caption = t ? `${routeName(t)} · ${t.completed ? I18n.t("Completado") : I18n.t("No completado")}${t.stationRoutes.length ? I18n.t(" · vía estación") : ""}` : I18n.t("Sin billetes de destino");
    empty = t ? "" : I18n.t("Sin billetes de destino");
    content = `<div class="score-choice-list">${d.destinations.map((t, i) => resultChoice(i,
      `<span class="score-status" aria-label="${t.completed ? I18n.t("Completado") : I18n.t("No completado")}">${t.completed ? "✓" : "✕"}</span> ${escapeHTML(routeName(t))}`,
      t.points, index === i, t.stationRoutes.length ? I18n.t("Vía estación") : "", t.completed ? "score-positive" : "score-negative")).join("")}</div>`;
  } else if (category === "stations") {
    title = I18n.t("Estaciones"); total = signedPoints(result.stations);
    const station = d.stations.placed[view.index], route = station && game.routes.find(r => r.id === station.routeId);
    caption = station ? route ? I18n.t`Préstamo: ${routeName(route)} · ${game.players[route.owner].name}` : I18n.t`Estación en ${cityName(station.city)}` : I18n.t("Estaciones construidas");
    empty = d.stations.placed.length ? "" : I18n.t("Sin estaciones construidas");
    content = I18n.t`<p class="score-station-count">${d.stations.unused} sin construir × 4</p><div class="score-choice-list">${d.stations.placed.map((s, i) => resultChoice(i, I18n.t`Estación en ${escapeHTML(cityName(s.city))}`, null, view.index === i)).join("")}</div>`;
  } else {
    title = I18n.t("Camino más largo"); total = signedPoints(result.express);
    const compared = game.result.find(r => r.seat === view.expressSeat) || result;
    caption = I18n.t`${compared.name} · ${compared.longest} vagones`;
    empty = compared.details?.express.routes.length ? "" : I18n.t("Sin vías construidas");
    const standings = GameUI.resultStandings(game);
    content = I18n.t`<div class="score-choice-list score-trail-ranking" aria-label="Comparación de caminos más largos">${standings.map(r =>
      I18n.t`<button type="button" class="score-choice" data-express-seat="${r.seat}" aria-pressed="${r.seat === compared.seat}"><span class="score-trail-place">${standings.findIndex(p => p.longest === r.longest) + 1}</span>${playerAvatar(r.seat)}<span class="score-trail-name">${escapeHTML(r.name)}<small>${r.longest} vagones</small></span>${r.express ? I18n.t`<strong class="score-bonus" aria-label="Bonificación: ${r.express} puntos">+${r.express}</strong>` : I18n.t('<span class="score-no-bonus">—<span class="sr-only"> Sin bonificación</span></span>')}</button>`).join("")}</div>`;
  }
  panel.innerHTML = I18n.t`<div class="score-section-heading"><h3>${title}</h3><strong>${total}</strong></div>
    <div class="score-detail-layout ${category === "routes" ? "score-detail-routes" : ""}">
    <figure class="score-map-panel"><div class="score-map-stage"><svg id="scoreMap" role="group" aria-label="Mapa: ${escapeHTML(title)} de ${escapeHTML(result.name)}" tabindex="0"></svg>${empty ? `<span class="score-map-empty">${empty}</span>` : ""}<button type="button" class="score-map-expand" aria-label="${view.expanded ? "Reducir" : "Ampliar"} mapa" aria-pressed="${view.expanded}" title="${view.expanded ? "Reducir" : "Ampliar"} mapa">⛶</button></div><figcaption aria-live="polite">${escapeHTML(caption)}</figcaption></figure>
    <div class="score-side-detail">${content}</div></div>`;
  for (const button of panel.querySelectorAll("[data-score-choice]")) button.onclick = () => {
    view.index = +button.dataset.scoreChoice; renderResultPanel(result);
    panel.querySelector(`[data-score-choice="${view.index}"]`)?.focus({ preventScroll: true });
  };
  for (const button of panel.querySelectorAll("[data-express-seat]")) {
    applyPlayerAppearance(button, game.players[+button.dataset.expressSeat].color);
    button.onclick = () => { view.expressSeat = +button.dataset.expressSeat; renderResultPanel(result); panel.querySelector(`[data-express-seat="${view.expressSeat}"]`).focus({ preventScroll: true }); };
  }
  const list = panel.querySelector(".score-route-list");
  if (list) list.ontoggle = () => { view.list = list.open; };
  panel.querySelector(".score-map-expand").onclick = event => {
    const expanded = panel.classList.toggle("is-map-expanded");
    view.expanded = expanded;
    event.currentTarget.setAttribute("aria-pressed", String(expanded));
    event.currentTarget.setAttribute("aria-label", expanded ? I18n.t("Reducir mapa") : I18n.t("Ampliar mapa"));
    event.currentTarget.title = expanded ? I18n.t("Reducir mapa") : I18n.t("Ampliar mapa");
  };
  renderResultMap(result, GameUI.resultSelection(game, result.seat, category, view.index, view.expressSeat));
}
function showResults() {
  if (game?.phase !== "finished") return;
  const signature = JSON.stringify([game.result, game.players.map(p => p.color)]);
  if (uiDialog === "results" && $("dialog")._resultSignature === signature && $("dialog").querySelector(".results-scroll") && !$("overlay").classList.contains("hidden")) return;
  if (!resultsSeen) expandedResults.add(game.result.find(r => r.seat === seat)?.seat ?? game.result[0].seat);
  uiDialog = "results"; resultsSeen = true;
  hoveredDestination = null;
  showDialog(game.earlyFinish ? I18n.t("Prueba terminada anticipadamente") : I18n.t("Fin de partida"),
    I18n.t`<div class="results-scroll">${game.earlyFinish ? I18n.t('<p class="score-preview-note">Estado actual · Solo billetes conservados</p>') : ""}
    <div class="results-list">${game.result.map((r,i) => I18n.t`<details class="result-card" data-result-player="${r.seat}" data-score-seat="${r.seat}" ${expandedResults.has(r.seat) ? "open" : ""}><summary class="result-heading">${playerAvatar(r.seat)}<span class="result-player-name"><b>${i+1}. ${escapeHTML(r.name)} ${r.winner ? '<span aria-label="Ganador">🏆</span>' : ""}</b><small>Ver desglose <span class="result-chevron" aria-hidden="true">⌄</span></small></span><strong>${r.score}<small>puntos</small></strong></summary><div class="score-breakdown">${resultDetailHTML(r)}</div></details>`).join("")}</div>
    <details class="result-rules"><summary>¿Cómo se resuelven los empates?</summary><p>Más destinos completados, después más estaciones sin construir y finalmente la bonificación de camino más largo. Si persiste, se comparte la victoria.</p></details></div>
    <div class="result-actions"><button id="exploreMap" class="primary">Explorar mapa</button>${practiceMode ? I18n.t('<button id="practiceHome" class="tertiary">Volver al inicio</button>') : I18n.t('<button id="rematch" class="tertiary">Revancha</button><button id="multiplayerHome" class="tertiary">Volver al inicio</button>')}</div>`, false, true);
  $("dialog").classList.add("results-dialog");
  $("dialog")._resultSignature = signature;
  const heading = document.createElement("div"); heading.className = "results-header";
  $("dialog").prepend(heading); heading.append($("dialogTitle"), $("dialog").querySelector(".dialog-close"));
  $("dialog").querySelector(".results-scroll").append($("errorMsg"));
  for (const card of $("dialog").querySelectorAll("[data-result-player]")) applyPlayerAppearance(card, game.players[+card.dataset.resultPlayer].color);
  for (const details of $("dialog").querySelectorAll("[data-score-seat]")) {
    const playerSeat = +details.dataset.scoreSeat, result = game.result.find(r => r.seat === playerSeat);
    details.querySelector(".result-heading").onclick = event => {
      event.preventDefault(); const open = !details.open;
      resultMapCleanup?.(); resultMapCleanup = null; expandedResults.clear();
      for (const other of $("dialog").querySelectorAll("[data-score-seat]")) {
        other.open = other === details && open; other.querySelector(".score-panel")?.replaceChildren();
      }
      if (open) { expandedResults.add(playerSeat); renderResultPanel(result); }
    };
    const tabs = [...details.querySelectorAll("[data-score-category]")];
    for (const tab of tabs) {
      tab.onclick = () => {
        const view = resultView(playerSeat); view.category = tab.dataset.scoreCategory; view.index = null;
        for (const other of tabs) { other.setAttribute("aria-selected", String(other === tab)); other.tabIndex = other === tab ? 0 : -1; }
        renderResultPanel(result);
      };
      tab.onkeydown = event => {
        const index = tabs.indexOf(tab), target = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (target !== null) { event.preventDefault(); tabs[target].focus(); tabs[target].click(); }
      };
    }
    if (details.open) renderResultPanel(result);
  }
  $("exploreMap").onclick = closeOptionalDialog;
  if (practiceMode) $("practiceHome").onclick = () => send({ type: "leave_test" });
  else {
    $("multiplayerHome").onclick = () => send({ type: "leave" });
    $("rematch").hidden = spectating;
    $("rematch").onclick = () => { if (!spectating) send({ type: "rematch" }); };
  }
}
function renderResultMap(result, selection) {
  const svg = $("scoreMap"); if (!svg || !selection) return;
  const view = resultView(result.seat), prefix = `score-${result.seat}`;
  if (view.category === "express") svg.setAttribute("aria-label", I18n.t`Mapa: Camino más largo de ${game.players[selection.seat].name}`);
  const key = `${result.seat}:${view.category}:${view.category === "routes" ? "all" : view.category === "express" ? view.expressSeat : view.index}`;
  const points = [...selection.routes.flatMap(id => MAP_GEOMETRY[id]?.points || []), ...selection.endpoints.map(id => RailMap.cities[id])];
  const bounds = points.length ? { x: Math.min(...points.map(p => p[0])) - 65, y: Math.min(...points.map(p => p[1])) - 55,
    width: Math.max(220, Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) + 130),
    height: Math.max(160, Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])) + 110) } : MAP_BOUNDS;
  if (key !== resultCameraKey || !resultCamera) {
    resultCameraKey = key; resultCamera = { zoom: 1, center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } };
  }
  const el = svgElements(svg), world = el("g"), worldEl = svgElements(world);
  drawMapBase(worldEl, prefix);
  const routeGroups = new Map();
  for (const id of selection.routes) {
    const route = game.routes.find(r => r.id === id), geometry = MAP_GEOMETRY[id];
    if (!route || !geometry) continue;
    const owner = GameUI.routeOwner(game, route, result.seat), borrowed = selection.stationRoutes.includes(id);
    if (!owner) continue;
    const group = el("g", { class: "score-map-route", "data-score-route": id, "data-borrowed": borrowed }, world);
    const halo = el("path", { d: geometry.d, fill: "none", stroke: "#edc25b", "stroke-width": 17, opacity: selection.highlighted.includes(id) ? .8 : 0,
      "stroke-linecap": "round", ...(borrowed ? { "stroke-dasharray": "5 5" } : {}) }, group);
    el("path", { d: geometry.d, fill: "none", stroke: owner.color, "stroke-width": 9, opacity: .22 }, group);
    for (const cell of geometry.cells) drawOwnedPiece(el, el("g", { transform: `translate(${cell.x} ${cell.y}) rotate(${cell.angle})` }, group), cell, owner, prefix);
    el("title", {}, group).textContent = `${routeName(route)} · ${owner.name}`;
    routeGroups.set(id, halo);
  }
  if (selection.incomplete && selection.endpoints.length === 2) {
    const [a, b] = selection.endpoints.map(id => RailMap.cities[id]);
    el("path", { d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, fill: "none", stroke: "#ae6455", "stroke-width": 2, "stroke-dasharray": "5 6", "data-incomplete-destination": true }, world);
  }
  const cityKeys = new Set([...selection.endpoints, ...selection.routes.flatMap(id => {
    const r = game.routes.find(r => r.id === id); return r ? [r.a, r.b] : [];
  })]);
  const junctions = new Set([...cityKeys].filter(city => selection.routes.filter(id => {
    const route = game.routes.find(r => r.id === id); return route && [route.a, route.b].includes(city);
  }).length !== 2));
  for (const city of cityKeys) {
    const [x, y] = RailMap.cities[city];
    el("circle", { cx: x, cy: y, r: 4, fill: "#fffaf0", stroke: "#657d7c", "stroke-width": 1.3 }, world);
  }
  for (const station of selection.stations) {
    const [x, y] = RailMap.cities[station.city];
    const marker = el("g", { transform: `translate(${x} ${y})`, "data-score-station": station.city }, world);
    drawStation(el, marker, GameUI.playerColor(game.players[station.seat].color), 1.25, prefix);
  }
  const labels = el("g", { class: "score-map-labels" });
  let camera, frame = null, gesture = null, dragged = false, down = null;
  const pointers = new Map();
  function chooseRoute(index) {
    const route = result.details.routes[index]; if (!route) return;
    view.index = index;
    for (const [id, halo] of routeGroups) halo.setAttribute("opacity", id === route.id ? ".85" : "0");
    svg.closest("figure").querySelector("figcaption").textContent = I18n.t`${routeName(route)} · ${route.length} vagones · +${route.points} puntos`;
    for (const node of svg.closest(".score-panel").querySelectorAll("[data-score-choice], [data-score-badge]"))
      node.setAttribute("aria-pressed", String(+(node.dataset.scoreChoice ?? node.dataset.scoreBadge) === index));
    schedule();
  }
  function refreshCamera() {
    const width = svg.clientWidth, height = svg.clientHeight; if (!width || !height) return false;
    camera = GameUI.camera(bounds, { width, height }, { x: 18, y: 18, width: Math.max(1, width - 36), height: Math.max(1, height - 36) }, resultCamera.zoom, resultCamera.center);
    resultCamera.center = camera.focus;
    return true;
  }
  function paint() {
    frame = null;
    if (!refreshCamera()) return;
    const width = svg.clientWidth, height = svg.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    world.setAttribute("transform", `scale(${1 / camera.scale}) translate(${-camera.x} ${-camera.y})`);
    const focused = document.activeElement?.dataset?.scoreBadge;
    labels.replaceChildren();
    const entries = [], nodes = new Map();
    const screen = (x, y) => ({ x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale });
    const onScreen = p => p.x > 12 && p.y > 12 && p.x < width - 12 && p.y < height - 12;
    for (const city of cityKeys) {
      // Point badges are the primary information here. At overview scale, keep
      // only terminals/junctions and the selected route's cities; zoom restores all.
      const chosen = result.details.routes[view.index];
      if (view.category === "routes" && resultCamera.zoom < 1.7 && !junctions.has(city) && ![chosen?.a, chosen?.b].includes(city)) continue;
      const p = screen(...RailMap.cities[city]); if (!onScreen(p)) continue;
      const text = el("text", { class: "score-city-name", "pointer-events": "none" }, labels); text.textContent = cityName(city);
      entries.push({ key: `city-${city}`, ...p, width: text.getComputedTextLength() + 4 });
      nodes.set(`city-${city}`, { node: text, p });
    }
    for (const badge of selection.badges) {
      const geometry = MAP_GEOMETRY[badge.routeId], point = RailMap.pointAt(geometry, geometry.length / 2), p = screen(...point);
      if (!onScreen(p)) continue;
      const route = result.details.routes[badge.index];
      const group = el("g", { class: "score-point-badge", "data-score-badge": badge.index, role: "button", tabindex: "0",
        "aria-pressed": view.index === badge.index, "aria-label": I18n.t`${routeName(route)}: ${badge.points} puntos, ${route.length} vagones` }, labels);
      el("rect", { x: -3, y: -5, width: 42, height: 32, fill: "transparent" }, group);
      el("rect", { width: 36, height: 22, rx: 8, class: "score-point-pill" }, group);
      el("text", { x: 18, y: 15, "text-anchor": "middle" }, group).textContent = `+${badge.points}`;
      group.onclick = () => { if (!dragged) chooseRoute(badge.index); };
      group.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); chooseRoute(badge.index); } };
      entries.push({ key: `route-${badge.routeId}`, ...p, width: 36 }); nodes.set(`route-${badge.routeId}`, { node: group, p });
    }
    for (const place of RailMap.placeLabels(entries, width, height, [], { height: 22, baseline: 16 })) {
      const { node, p } = nodes.get(place.key);
      if (place.key.startsWith("city-")) {
        node.setAttribute("x", place.x + 2); node.setAttribute("y", place.y + 15);
        if (Math.hypot(place.x + place.width / 2 - p.x, place.y + 11 - p.y) > 26) {
          const leader = el("path", { d: `M${p.x} ${p.y}L${place.x + place.width / 2} ${place.y + 11}`, class: "score-point-leader" }, labels);
          labels.insertBefore(leader, labels.firstChild);
        }
      }
      else {
        const leader = el("path", { d: `M${p.x} ${p.y}L${place.x + 18} ${place.y + 11}`, class: "score-point-leader" }, labels);
        labels.insertBefore(leader, labels.firstChild);
        node.setAttribute("transform", `translate(${place.x} ${place.y})`);
      }
    }
    if (focused !== undefined) labels.querySelector(`[data-score-badge="${focused}"]`)?.focus({ preventScroll: true });
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(paint); }
  function pointerPoint(event) { const r = svg.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function startGesture() {
    const ps = [...pointers.values()];
    if (!ps.length || !refreshCamera()) { gesture = null; return; }
    const midpoint = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    gesture = { zoom: resultCamera.zoom, center: { ...resultCamera.center }, scale: camera.scale,
      midpoint: { x: midpoint.x - camera.sx, y: midpoint.y - camera.sy },
      distance: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : null };
  }
  svg.onpointerdown = event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, pointerPoint(event));
    if (pointers.size === 1) { dragged = false; down = pointerPoint(event); }
    else dragged = true;
    // Capture only after movement, so a tap still reaches its SVG point badge.
    startGesture();
  };
  svg.onpointermove = event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const p = pointerPoint(event); pointers.set(event.pointerId, p);
    if (down && Math.hypot(p.x - down.x, p.y - down.y) > 5) dragged = true;
    if (dragged && !svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
    const ps = [...pointers.values()];
    const midpoint = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    const offset = { x: midpoint.x - camera.sx, y: midpoint.y - camera.sy };
    if (ps.length > 1 && gesture.distance !== null) {
      const distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const z = Math.max(1, Math.min(6, gesture.zoom * distance / Math.max(1, gesture.distance)));
      resultCamera = GameUI.pinchTransform(gesture, gesture.distance * z / gesture.zoom, offset);
    } else resultCamera.center = { x: gesture.center.x + (gesture.midpoint.x - offset.x) * gesture.scale, y: gesture.center.y + (gesture.midpoint.y - offset.y) * gesture.scale };
    schedule();
  };
  const endPointer = event => { pointers.delete(event.pointerId); if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); startGesture(); };
  svg.onpointerup = endPointer; svg.onpointercancel = endPointer;
  svg.onlostpointercapture = event => { if (event.target === svg && pointers.has(event.pointerId)) { pointers.delete(event.pointerId); startGesture(); } };
  function zoomAt(nextZoom, p) {
    // Wheel events can arrive before the scheduled paint. Always anchor against
    // the latest camera, not the scale from the previous rendered frame.
    if (!refreshCamera()) return;
    const next = Math.max(1, Math.min(6, nextZoom)), offset = { x: p.x - camera.sx, y: p.y - camera.sy };
    resultCamera = GameUI.zoomTransform({ zoom: resultCamera.zoom, center: resultCamera.center, scale: camera.scale, midpoint: offset }, next, offset);
    schedule();
  }
  function resetCamera() {
    resultCamera = { zoom: 1, center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } };
    schedule();
  }
  const wheel = event => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1);
    zoomAt(resultCamera.zoom * Math.exp(-pixels * .002), pointerPoint(event));
  };
  svg.addEventListener("wheel", wheel, { passive: false });
  svg.ondblclick = event => { event.preventDefault(); if (resultCamera.zoom > 1) resetCamera(); else zoomAt(2, pointerPoint(event)); };
  svg.onkeydown = event => {
    if (event.target !== svg || !camera) return;
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (steps[event.key]) { event.preventDefault(); const [x, y] = steps[event.key]; resultCamera.center.x += x * 50 * camera.scale; resultCamera.center.y += y * 50 * camera.scale; schedule(); }
    if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); zoomAt(resultCamera.zoom * (event.key === "-" ? .8 : 1.25), { x: camera.sx, y: camera.sy }); }
    if (event.key === "Home") { event.preventDefault(); resetCamera(); }
  };
  const observer = new ResizeObserver(schedule); observer.observe(svg); paint();
  resultMapCleanup = () => { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); svg.removeEventListener("wheel", wheel); pointers.clear(); };
}
$("viewResults").onclick = showResults;
$("resultContext").querySelector("button").onclick = () => {
  resultMapSelection = null; $("resultContext").classList.add("hidden"); updateDestinationSpotlight();
};

function paymentDescription(payment) {
  return [payment.regular ? I18n.t`${payment.regular} de color ${N[payment.color].toLowerCase()}` : "",
    payment.wild ? I18n.t`${payment.wild} locomotora${payment.wild === 1 ? "" : "s"}` : ""].filter(Boolean).join(" + ");
}
function paymentIcons(payment) {
  return [[payment.color, payment.regular], ["wild", payment.wild]].filter(([, n]) => n).map(([color, n]) =>
    `<span class="payment-chip"><img src="assets/cards/${color}.svg" alt="${N[color]}" draggable="false"><strong>×${n}</strong></span>`).join('<span class="payment-plus" aria-hidden="true">+</span>');
}
// Presentation only: the server has already drawn these exact cards. A zero
// surcharge still advances its turn immediately; only our build effect waits.
function prepareTunnelReveal(events) {
  if (tunnelReveal?.event.surcharge && game.tunnel?.revealId !== tunnelReveal.event.id) cancelTunnelReveal();
  // A completed tunnel's evidence outlives turn changes, including a fast round
  // returning to us. This is local presentation; the server keeps playing.
  const event = events.find(e => e.type === "tunnel_reveal" && e.seat === seat);
  if (!event) return;
  cancelTunnelReveal();
  const build = events.find(e => e.type === "build" && e.seat === seat && e.routeId === event.routeId && e.id > event.id);
  if (build) build.deferredForTunnel = true;
  tunnelReveal = { event, build, shown: 0, timer: null, started: false, finished: false };
  uiDialog = buildTarget = null;
}
function syncTunnelMask() {
  syncBoard3D();
  $("board").querySelectorAll(".awaiting-tunnel-reveal").forEach(node => node.classList.remove("awaiting-tunnel-reveal"));
  if (tunnelReveal?.build) constructionTarget(tunnelReveal.build)?.classList.add("awaiting-tunnel-reveal");
}
function cancelTunnelReveal() {
  if (!tunnelReveal) return;
  clearTimeout(tunnelReveal.timer);
  tunnelReveal = null;
  syncTunnelMask();
}
function tunnelCardMatch(color, paymentColor) { return color === "wild" || (paymentColor !== "wild" && color === paymentColor); }
function showTunnelReveal() {
  const sequence = tunnelReveal, t = sequence.event;
  if ($("dialog").dataset.tunnelReveal === String(t.id)) return;
  const route = game.routes.find(r => r.id === t.routeId);
  showDialog(I18n.t("Comprobando el túnel…"), I18n.t`${dialogClockHTML()}<p class="tunnel-route">${escapeHTML(routeName(route))}</p>
    <p>Revelamos hasta 3 cartas. Cada ${t.paymentColor === "wild" ? I18n.t("locomotora") : I18n.t`carta de color ${N[t.paymentColor].toLowerCase()} o locomotora`} añade una carta al pago.</p>
    <div id="tunnelSequence" class="tunnel-sequence">${t.revealed.map((_, i) => I18n.t`<div class="tunnel-reveal" data-reveal-slot="${i}"><img class="tunnel-card-back" src="assets/cards/back.svg" alt="Carta ${i + 1} sin revelar"><span class="reveal-effect">${i + 1}</span></div>`).join("")}</div>
    <p id="tunnelRevealStatus" class="tunnel-total" role="status">0 de ${t.revealed.length} reveladas · Suplemento: 0</p>
    <button id="skipTunnelReveal" class="tertiary full">Omitir animación</button>`);
  $("dialog").classList.add("tunnel-dialog");
  $("dialog").dataset.tunnelReveal = String(t.id);
  $("skipTunnelReveal").onclick = () => sequence.finished ? finishTunnelReveal(true) : skipTunnelAnimation();
  if (sequence.started) return;
  sequence.started = true;
  if (document.hidden) { finishTunnelReveal(true); return; }
  const instant = reducedMotion.matches || !t.revealed.length || (t.surcharge && game.turnDeadline - Date.now() - serverOffset <= 5000);
  sequence.timer = setTimeout(instant ? skipTunnelAnimation : revealNextTunnelCard, instant ? 0 : 700);
}
function showNextTunnelCard(sequence, animate) {
  const { event: t } = sequence;
  if (sequence.shown >= t.revealed.length) return;
  const i = sequence.shown++;
  const slot = $("tunnelSequence")?.querySelector(`[data-reveal-slot="${i}"]`);
  if (slot) {
    const match = tunnelCardMatch(t.revealed[i], t.paymentColor);
    slot.replaceChildren(colorCard(t.revealed[i], null));
    slot.classList.toggle("is-match", match);
    const effect = document.createElement("span"); effect.className = "reveal-effect"; effect.textContent = match ? "+1" : "—";
    slot.append(effect);
    if (animate && !reducedMotion.matches && !document.hidden) {
      slot.animate([{ transform: "translateY(-16px) rotateY(-85deg)", opacity: .4 }, { transform: "translateY(0) rotateY(0)", opacity: 1 }], { duration: 500, easing: "ease-in-out" });
      playSound("card");
    }
    const surcharge = t.revealed.slice(0, sequence.shown).filter(c => tunnelCardMatch(c, t.paymentColor)).length;
    $("tunnelRevealStatus").textContent = I18n.t`${sequence.shown} de ${t.revealed.length} reveladas · Suplemento: ${surcharge}`;
  }
}
function revealNextTunnelCard() {
  const sequence = tunnelReveal;
  if (!sequence || sequence.finished) return;
  showNextTunnelCard(sequence, true);
  // Leave the third card time to land and be read before showing the decision.
  sequence.timer = setTimeout(sequence.shown < sequence.event.revealed.length ? revealNextTunnelCard : () => finishTunnelReveal(), 700);
}
function skipTunnelAnimation() {
  const sequence = tunnelReveal;
  if (!sequence || sequence.finished) return;
  clearTimeout(sequence.timer);
  sequence.instant = true;
  // Skipping motion must not skip the evidence, especially with no surcharge:
  // there is no subsequent payment dialog to display those cards again.
  while (sequence.shown < sequence.event.revealed.length) showNextTunnelCard(sequence, false);
  finishTunnelReveal();
}
function finishTunnelReveal(skip = false) {
  const sequence = tunnelReveal;
  if (!sequence) return;
  clearTimeout(sequence.timer);
  const { event: t, build } = sequence;
  // Keep all evidence on screen for the payment decision, including when skipped.
  if (t.surcharge || skip) {
    cancelTunnelReveal();
    renderDialog();
    if (build) animateConstruction(build);
    return;
  }
  sequence.finished = true;
  $("dialogTitle").textContent = I18n.t("Túnel construido");
  $("tunnelRevealStatus").textContent = I18n.t("Sin coste adicional. Solo se paga el coste inicial.");
  $("skipTunnelReveal").textContent = I18n.t("Volver al mapa");
  // Instant reveals still need time to read all three cards and the outcome.
  sequence.timer = setTimeout(() => finishTunnelReveal(true), sequence.instant ? 2100 : 700);
}
function showTunnelDialog() {
  const t = game.tunnel, route = game.routes.find(r => r.id === t.routeId);
  const key = JSON.stringify([t.revealId, t.routeId, t.revealed, game.hand]);
  if ($("dialog").dataset.tunnelDecision === key && !$("overlay").classList.contains("hidden")) return;
  const options = GameUI.tunnelPayments(game.hand, t);
  const count = t.surcharge;
  showDialog(I18n.t`Túnel: ${count} carta${count === 1 ? "" : "s"} adicional${count === 1 ? "" : "es"}`,
    I18n.t`${dialogClockHTML()}<p class="tunnel-route">${escapeHTML(CITIES[route.a][2])} — ${escapeHTML(CITIES[route.b][2])}</p>
    <div class="tunnel-evidence"><section><h3>Cartas reveladas</h3><div id="revealed" class="tunnel-revealed"></div></section>
      <section class="tunnel-base"><h3>Pago base reservado</h3><div class="payment-icons" aria-label="${paymentDescription(t.base)}">${paymentIcons(t.base)}</div><p>Aún no se ha gastado.</p></section></div>
    <fieldset class="tunnel-payments"><legend>${options.length > 1 ? I18n.t("¿Cómo pagas el suplemento?") : I18n.t("Pago del suplemento")}</legend>
      ${options.length ? `<div class="tunnel-options">${options.map((option, i) => options.length === 1
        ? `<div class="tunnel-option single"><div class="payment-icons">${paymentIcons(option)}</div><span>${paymentDescription(option)}</span></div>`
        : `<label class="tunnel-option"><input type="radio" name="tunnelPayment" value="${option.wild}" ${i === 0 ? "checked" : ""}><span><span class="payment-icons">${paymentIcons(option)}</span><span class="payment-label">${paymentDescription(option)}</span></span></label>`).join("")}</div>`
        : I18n.t`<p class="tunnel-insufficient">No tienes cartas suficientes para el suplemento después de reservar el pago base.</p>`}
    </fieldset>
    <p id="tunnelTotal" class="tunnel-total" aria-live="polite"></p>
    <div class="dialog-actions"><button class="primary full" id="acceptTunnel" ${options.length ? "" : "disabled"}>Pagar suplemento y construir</button>
    <button class="tertiary full" id="declineTunnel">Desistir del túnel</button></div>
    <p class="tunnel-exit-note">Al desistir conservas tus cartas, pero termina tu turno.</p>`);
  $("dialog").classList.add("tunnel-dialog");
  $("dialog").dataset.tunnelDecision = key;
  for (const c of t.revealed) {
    const match = c === "wild" || (t.color !== "wild" && c === t.color);
    const item = document.createElement("div");
    item.className = `tunnel-reveal${match ? " is-match" : ""}`;
    item.appendChild(colorCard(c, null));
    const caption = document.createElement("span");
    caption.className = "reveal-effect";
    caption.textContent = match ? "+1" : "—";
    caption.setAttribute("aria-label", match ? I18n.t("Añade una carta al suplemento") : I18n.t("No añade suplemento"));
    item.appendChild(caption);
    $("revealed").appendChild(item);
  }
  const chosen = () => options.length === 1 ? options[0]
    : options.find(option => option.wild === +document.querySelector('input[name="tunnelPayment"]:checked')?.value);
  const total = () => {
    const payment = chosen();
    $("tunnelTotal").textContent = payment ? I18n.t`Total al construir: ${paymentDescription({ color: t.color, regular: t.base.regular + payment.regular, wild: t.base.wild + payment.wild })}.` : "";
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
    ? I18n.t("Reconectando… La sala se elimina tras 30 s de desconexión.")
    : finished ? I18n.t("Prueba finalizada · Puedes iniciar otra partida.")
    : I18n.t("Tú + 3 bots · 0,8–1 s por acción");
}

// Reparent existing controls rather than duplicate state/listeners on rotation.
const compactMedia = matchMedia("(max-width: 1100px), (max-height: 600px)");
let compactPanel = "map", compactPlayer = null, compactHistoryTop = 0;
const compactSections = {
  cards: [document.querySelector(".game .sidepanel")],
  destinations: [document.querySelector(".dockdestinations")],
  history: [document.querySelector(".history-panel")],
};
const compactHand = document.querySelector(".dockmain"), compactPlayers = document.querySelector(".players-panel"), turnBanner = $("turnBanner");
let announcedTurn = null;
const compactHomes = [...Object.values(compactSections).flat(), compactHand, compactPlayers, turnBanner].map(node => {
  const anchor = document.createComment("responsive panel home");
  node.before(anchor);
  return { node, anchor };
});
function syncCompactControls() {
  // Native hidden also protects desktop if the responsive stylesheet is delayed
  // or unavailable. Use the same breakpoint that reparents the actual panels.
  $("compactHud").hidden = $("compactPlayers").hidden = !compactMedia.matches;
  $("compactPractice").classList.toggle("hidden", !compactMedia.matches || !practiceMode);
}
function setCompactPanel(next = compactPanel) {
  syncCompactControls();
  hoveredDestination = null;
  const followHistory = historyFollowing;
  if ($("history").clientHeight) compactHistoryTop = $("history").scrollTop;
  compactPanel = next;
  for (const { node, anchor } of compactHomes) {
    if (compactMedia.matches && (node === compactHand || node === compactPlayers || node === turnBanner)) continue;
    if (node.previousSibling !== anchor) anchor.after(node);
  }
  if (compactMedia.matches) {
    if (compactHand.parentElement !== $("compactHand")) $("compactHand").append(compactHand);
    if (compactPlayers.parentElement !== $("compactPlayers")) $("compactPlayers").append(compactPlayers);
    if (turnBanner.parentElement !== $("compactTurnHome")) $("compactTurnHome").append(turnBanner);
  }
  const open = compactMedia.matches && next !== "map";
  if (open) $("compactPanel").append(...compactSections[next]);
  $("compactPanel").classList.toggle("hidden", !open);
  $("compactPanel").setAttribute("aria-label", { cards: I18n.t("Cartas para robar"), destinations: I18n.t("Tus destinos"), history: I18n.t("Historial") }[next] || I18n.t("Panel de juego"));
  $("game").dataset.compactPanel = compactMedia.matches ? next : "map";
  for (const button of document.querySelectorAll("[data-panel]")) button.setAttribute("aria-pressed", String(button.dataset.panel === next));
  $("practiceControls").classList.remove("is-open");
  $("compactPractice").setAttribute("aria-expanded", "false");
  compactPlayer = null;
  updateCompactPlayer();
  closeMapMenu();
  if (game) {
    updateCompactStatus();
    layoutHand(); applyZoom();
    if ($("history").clientHeight) $("history").scrollTop = followHistory ? $("history").scrollHeight : compactHistoryTop;
    updateHistoryScroll();
  }
}
function updateCompactStatus() {
  syncCompactControls();
  if (!game) return;
  const controlled = sock?.readyState === WebSocket.OPEN && !sessionReplaced && !storagePaused && !members[seat]?.autopilot;
  const state = GameUI.turnPresentation(game, seat, controlled);
  if (spectating && game.phase !== 'finished') state.hint = I18n.t('Observando la partida');
  if ($("compactTurn").textContent !== state.title) $("compactTurn").textContent = state.title;
  if ($("turnHint").textContent !== state.hint) $("turnHint").textContent = state.hint;
  turnBanner.classList.toggle("is-mine", state.mine);
  $("compactClock").dataset.clock = state.clock || "";
  $("compactClock").classList.toggle("hidden", !state.clock);
  const key = `${room}-${seat}-${game.turnSerial}`;
  if (state.mine && announcedTurn !== key) {
    announcedTurn = key;
    if (!reducedMotion.matches) turnBanner.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.25)", offset: .3 }, { filter: "brightness(1)" }], { duration: 1100 });
  }
  const reminder = compactMedia.matches && GameUI.needsSecondDraw(game, seat, compactPanel, controlled);
  document.querySelector('[data-panel="cards"]').classList.toggle("needs-draw", reminder);
  $("compactPlayers").style.setProperty("--player-count", game.players.length);
}
function updateCompactPlayer() {
  const player = game?.players[compactPlayer], detail = $("compactPlayerDetail");
  detail.classList.toggle("hidden", !player || !compactMedia.matches);
  if (player) detail.querySelector("span").textContent = I18n.t`${player.name}${compactPlayer === seat ? I18n.t(" · Tú") : ""} — ${game.result?.find(r => r.seat === compactPlayer)?.score ?? player.score} puntos · ${player.trains} vagones · ${player.stations} estaciones${members[compactPlayer]?.autopilot ? I18n.t(" · Bot de reemplazo") : ""}`;
}
$("compactPlayerDetail").querySelector("button").onclick = () => { compactPlayer = null; updateCompactPlayer(); };
for (const button of document.querySelectorAll("[data-panel]")) button.onclick = () => setCompactPanel(compactPanel === button.dataset.panel ? "map" : button.dataset.panel);
$("compactPractice").onclick = () => {
  const open = $("practiceControls").classList.toggle("is-open");
  $("compactPractice").setAttribute("aria-expanded", String(open));
};
compactMedia.addEventListener("change", () => setCompactPanel());
setCompactPanel();

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

function mapSafeArea(rect, forCamera = false) {
  if (compactMedia.matches) {
    const panel = $("compactPanel").getBoundingClientRect(), hud = $("compactHud").getBoundingClientRect();
    const open = !$("compactPanel").classList.contains("hidden"), beside = rect.width >= 700;
    return GameUI.safeArea({ width: rect.width, height: rect.height }, {
      top: Math.max($("boardtools").getBoundingClientRect().bottom, $("compactPlayers").getBoundingClientRect().bottom) - rect.top + 8,
      right: open && beside ? rect.right - panel.left + 8 : 8,
      // Phone sheets overlay the board: opening one must not shrink Europe
      // into a tiny thumbnail. Menus/spotlights still use the uncovered area.
      bottom: rect.bottom - (open && !beside && !forCamera ? panel.top : hud.top) + 8,
    });
  }
  const side = $("gameSidebar").getBoundingClientRect();
  const bottom = $("turnBanner").getBoundingClientRect();
  const top = $("boardtools").getBoundingClientRect().bottom - rect.top + 12;
  return {
    x: 16, y: top, width: side.left - rect.left - 32,
    height: bottom.top - rect.top - top - 12,
  };
}
function mapViewSize() {
  const rect = $("mapscroll").getBoundingClientRect(), { width, height } = rect;
  if (!width || !height) return null;
  return BoardCamera.view(MAP_BOUNDS, { width, height }, mapSafeArea(rect, true), zoom, mapCenter, GameUI.camera);
}
function applyZoom() {
  const view = mapViewSize();
  if (!view) return;
  mapCenter = view.focus;
  board3D?.resize(view);
  $("board").setAttribute("viewBox",
    `${view.x} ${view.y} ${view.width} ${view.height}`);
  $("mapscroll").classList.add("can-pan");
  updateStationScale();
  updateCityLabels();
  updateDestinationSpotlight();
  for (const flight of constructionFlights.values()) bindConstruction(flight);
  syncTunnelMask();
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
  mapCenter.y += fy * ((before.scaleY || before.scale) - (after.scaleY || after.scale));
  applyZoom();
}
$("mapscroll").addEventListener("wheel", (event) => {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
  const delta = Math.max(-200, Math.min(200, event.deltaY * unit));
  setZoom(zoom * Math.exp(-delta * 0.002), event.clientX, event.clientY);
}, { passive: false });

let mapDrag = null, mapPinch = null, suppressMapClick = false;
const mapPointers = new Map();
$("mapscroll").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const dismissedPanel = compactMedia.matches && compactPanel !== "map";
  if (dismissedPanel) setCompactPanel("map");
  mapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (mapPointers.size >= 2) {
    const [a, b] = [...mapPointers.values()];
    const rect = event.currentTarget.getBoundingClientRect(), view = mapViewSize();
    mapPinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, scale: view.scale, scaleY: view.scaleY || view.scale, center: { ...mapCenter },
      midpoint: { x: (a.x + b.x) / 2 - rect.left - view.sx, y: (a.y + b.y) / 2 - rect.top - view.sy } };
    mapDrag = null; suppressMapClick = true;
    event.currentTarget.classList.remove("is-panning");
    for (const id of mapPointers.keys()) event.currentTarget.setPointerCapture(id);
    closeMapMenu();
    return;
  }
  suppressMapClick = dismissedPanel;
  mapDrag = {
    id: event.pointerId, x: event.clientX, y: event.clientY,
    center: { ...mapCenter }, scale: mapViewSize().scale, scaleY: mapViewSize().scaleY || mapViewSize().scale, moved: false, dismissedPanel,
  };
});
$("mapscroll").addEventListener("pointermove", (event) => {
  if (mapPointers.has(event.pointerId)) mapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (mapPinch && mapPointers.size >= 2) {
    const [a, b] = [...mapPointers.values()];
    const rect = event.currentTarget.getBoundingClientRect(), view = mapViewSize();
    const next = GameUI.pinchTransform(mapPinch, Math.hypot(a.x - b.x, a.y - b.y), {
      x: (a.x + b.x) / 2 - rect.left - view.sx, y: (a.y + b.y) / 2 - rect.top - view.sy,
    });
    next.center.y = mapPinch.center.y + (next.center.y - mapPinch.center.y) * mapPinch.scaleY / mapPinch.scale;
    zoom = next.zoom; mapCenter = next.center;
    applyZoom();
    return;
  }
  if (mapDrag?.id !== event.pointerId) return;
  const dx = event.clientX - mapDrag.x, dy = event.clientY - mapDrag.y;
  if (!mapDrag.moved && Math.hypot(dx, dy) < 5) return;
  closeMapMenu();
  // Leave ordinary taps on the route/city. Once dragging starts, capture once
  // on the viewport; the old SVG target will emit a bubbling capture-loss event.
  if (!mapDrag.moved) event.currentTarget.setPointerCapture(event.pointerId);
  mapDrag.moved = true;
  event.currentTarget.classList.add("is-panning");
  mapCenter.x = mapDrag.center.x - dx * mapDrag.scale;
  mapCenter.y = mapDrag.center.y - dy * mapDrag.scaleY;
  applyZoom();
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"])
  $("mapscroll").addEventListener(type, (event) => {
    // Losing implicit capture on an SVG child is a transfer, not a finished
    // gesture. Only the viewport's own capture loss may terminate its drag.
    if (type === "lostpointercapture" && event.target !== event.currentTarget) return;
    if (type === "pointerleave" && event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!mapPointers.has(event.pointerId)) return;
    mapPointers.delete(event.pointerId);
    if (mapPinch) {
      suppressMapClick = true;
      if (mapPointers.size < 2) {
        mapPinch = null;
        const remaining = [...mapPointers.entries()][0];
        mapDrag = remaining ? { id: remaining[0], ...remaining[1], center: { ...mapCenter }, scale: mapViewSize().scale, scaleY: mapViewSize().scaleY || mapViewSize().scale, moved: true, dismissedPanel: true } : null;
        event.currentTarget.classList.toggle("is-panning", !!mapDrag);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (mapDrag?.id !== event.pointerId) return;
    suppressMapClick = mapDrag.moved || mapDrag.dismissedPanel || type === "pointercancel";
    mapDrag = null;
    event.currentTarget.classList.remove("is-panning");
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  });
$("mapscroll").addEventListener("click", (event) => {
  if (compactMedia.matches && compactPanel !== "map") setCompactPanel("map");
  if (!suppressMapClick || event.detail === 0) return;
  suppressMapClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);
const cameraResize = new ResizeObserver(() => { closeMapMenu(); applyZoom(); layoutHand(); if (game && $("ticketMap")) renderTicketMap(uiDialog === "routes" ? game.tickets : game.ticketOffer?.tickets || game.initial || []); });
for (const id of ["mapscroll", "gameSidebar", "handdock", "turnBanner", "compactPanel", "compactHud", "compactPlayers", "boardtools"]) cameraResize.observe($(id));
function updateFullscreenControl() {
  const available = !!document.fullscreenElement ||
    (document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function");
  $("expandboard").classList.toggle("hidden", !available);
  $("expandboard").setAttribute("aria-label", document.fullscreenElement ? I18n.t("Salir de pantalla completa") : I18n.t("Pantalla completa"));
}
updateFullscreenControl();
$("expandboard").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    updateFullscreenControl();
    toast(I18n.t("No se pudo activar la pantalla completa en este momento."));
  }
};
document.addEventListener("fullscreenchange", () => {
  updateFullscreenControl();
  applyZoom();
});
window.addEventListener("pageshow", updateFullscreenControl);
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
initializeHome();
account = AccountUI.create({
  selection:()=>({nickname:$("nickname").value,color:preferredColor}),
  currentSeat:()=>room?{code:room,token,practice:practiceMode}:null,
  applyProfile(profile) {
    $("nickname").value=profile.nickname; preferredColor=profile.color;
    localStorage.setItem("rr-name",profile.nickname);localStorage.setItem("rr-color",profile.color);renderHomeColors();
    shell?.identity();
  },
});
shell = AppShell.create({
  state:()=>({room,game,members,host,seat,spectator:spectating,maxPlayers:roomCapacity,visibility:roomVisibility,started:lobbyStarted,
    busy:homeBusy || sock?.readyState !== WebSocket.OPEN || sessionReplaced || storagePaused}),
  send, saveProfile:name=>account.updateNickname(name),
  joinRoom(code) { $('code').value=code; $('homeJoin').requestSubmit(); },
  watchRoom(code) {
    if (room) { error(I18n.t('Sal de tu sala antes de observar otra partida.')); return; }
    desiredWatch=code; send({type:'spectate',code});
  },
  leaveRoom:()=>send({type:'leave'}),
});
if(replayMode){
  document.body.classList.add('is-replaying');
  HistoryUI.replay(new URLSearchParams(location.search).get('id')||'',(view,recordedMembers,context)=>{
    game=view;members=recordedMembers;seat=context.seat;sessionSupported=true;replayAt=context.at;spectating=seat===-1;resultsSeen=true;uiDialog=null;
    displayedHistoryKey=null;document.body.classList.toggle('is-spectating',spectating);
    $('sessionControls').classList.add('hidden');$('connection').classList.add('hidden');
    render();
  });
}else connect();

$("retryBoard").onclick = initializeBoard3D;
$("mapscroll").tabIndex = 0;
$("mapscroll").setAttribute("aria-label", I18n.t("Mapa: flechas para mover, más y menos para zoom, Inicio para centrar"));
$("mapscroll").addEventListener("keydown", event => {
  if (!game || event.altKey || event.ctrlKey || event.metaKey) return;
  const v = mapViewSize();
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault(); closeMapMenu();
    mapCenter.x += (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0) * 50 * v.scale;
    mapCenter.y += (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0) * 50 * (v.scaleY || v.scale);
    applyZoom();
  } else if (["+", "=", "-", "Home"].includes(event.key)) {
    event.preventDefault();
    if (event.key === "Home") { zoom = 1; mapCenter = { ...MAP_CENTER }; applyZoom(); }
    else setZoom(zoom * (event.key === "-" ? .8 : 1.25));
  }
});
