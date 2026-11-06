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
  wild: I18n.t("Comodín"),
};
// Keep decoded public artwork for this page. HTTP assets are no-store, so a
// disposable preload alone cannot guarantee a new color paints without a fetch.
const cardArtwork = new Map();
const cardArtworkReady = Promise.all([...Object.keys(N), "back"].map(async color => {
  try {
    const response = await fetch(`assets/cards/${color}.svg`);
    if (!response.ok) return;
    const image = new Image();image.src = URL.createObjectURL(await response.blob());
    await image.decode();cardArtwork.set(color, image);
  } catch { /* The normal public URL remains available if preloading fails. */ }
}));
const cardImageSource = color => cardArtwork.get(color)?.src || `assets/cards/${color}.svg`;
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
let pendingDraw = null, queuedDraw = null;
let drawFeedbackSupported = false;
let drawPipelineSupported = false;
const inflightDraws = new Map(), drawPresentations = new Map(), handledDrawEvents = new Set();
let lastDrawLaunch = 0;
let homeMode = "create", homeBusy = false, lobbyStarted = false;
let preferredColor = localStorage.getItem("rr-color");
let secondaryColor=localStorage.getItem("rr-secondary-color")||null, selectedAvatar=localStorage.getItem("rr-avatar")||"person", publicUsername=null;
// The preview follows the latest click; profile/room colors stay authoritative.
let pendingRoomColor = null, colorRequest = null;
const previewColor = () => pendingRoomColor || (room && !lobbyStarted ? members[seat]?.color : null) || preferredColor;
function cancelRoomColor() {
  const pending = pendingRoomColor !== null;
  pendingRoomColor = colorRequest = null;
  if (pending) renderHomeColors();
}
function flushRoomColor() {
  if (colorRequest || !pendingRoomColor) return;
  if (pendingRoomColor === members[seat]?.color) { cancelRoomColor(); return; }
  colorRequest = pendingRoomColor;
  send({ type: "select_color", color: colorRequest });
}
function selectRoomColor(color) {
  if (!room || lobbyStarted || storagePaused || sessionReplaced || sock?.readyState !== WebSocket.OPEN) return;
  pendingRoomColor = color;
  renderHomeColors();
  flushRoomColor();
}
let account = null, shell = null;
const replayMode = location.pathname === "/replay";
let replayAt = null;
let replayMotion = false, replaySpeed = 1;
let wagonSeed = '';
let spectating = false, roomCapacity = 5, roomVisibility = 'private', roomTiming = GameTiming.normalize();
let roomMapRef = MapOptions.reference(MapOptions.options[0]);
let desiredWatch = new URLSearchParams(location.search).get('watch') || '';
if (!ProfileRules.avatars.includes(selectedAvatar)) selectedAvatar="person";
if (!LobbyUI.isColor(preferredColor)) preferredColor = LobbyUI.PALETTE[0].color;
const presentationResolver = MatchPresentation.create();
let matchContext = null, boardMap = RailMap, gameRules = MatchPresentation.legacyRules;
let MAP_BOUNDS = boardMap.bounds, MAP_GEOMETRY = [];
const geometryFor = id => matchContext?.geometryFor(id);
const ticketIdFromDom = value => matchContext?.ticketIdFromDom(value);
const routeIdFromDom = value => matchContext?.routeIdFromDom(value);
let MAP_CENTER = { x: MAP_BOUNDS.x + MAP_BOUNDS.width / 2, y: MAP_BOUNDS.y + MAP_BOUNDS.height / 2 };
const TICKET_COLORS = ["#b48916", "#c64e48", "#357bb5", "#32815b"];
let zoom = 1,
  mapCenter = { ...MAP_CENTER };
let board3D = null, board3DLoading = false, board3DFailed = false;
let boardSpotlight = null;
let labelPriority = [];
let labelPlacements3D = new Map();
function useMatchDefinition(view, definition, options) {
  let next;
  try { next = presentationResolver.resolve(view, definition, options); }
  catch (failure) {
    cancelConstruction(); cancelTunnelReveal(); cancelCardFlights(); stopSounds(); closeMapMenu();
    disposeTicketMap(); $("tunnelBoardNotice").hidden = true;
    board3D?.dispose(); board3D = null; matchContext = null; game = null;
    $("board").replaceChildren(); $("game").classList.add("hidden");
    $("dialog").innerHTML = `<h2>${I18n.t("Mapa no disponible")}</h2><p>${escapeHTML(I18n.t(failure.message))}</p><button id="unsupportedMapHome">${I18n.t("Volver al inicio")}</button>`;
    $("unsupportedMapHome").onclick = () => location.assign("/");
    $("overlay").classList.remove("hidden");
    throw failure;
  }
  if (next === matchContext) return;
  clearTableFocus(false); cancelConstruction(); cancelTunnelReveal(); closeMapMenu(); disposeTicketMap();
  ticketMapCameraKey = null; ticketPlans.clear();
  board3D?.dispose(); board3D = null; board3DFailed = false;
  $("mapscroll").classList.remove("board-ready");
  matchContext = next; boardMap = next.layout; gameRules = next.rules; MAP_GEOMETRY = next.network;
  MAP_BOUNDS = boardMap.bounds; MAP_CENTER = {x:MAP_BOUNDS.x + MAP_BOUNDS.width / 2,y:MAP_BOUNDS.y + MAP_BOUNDS.height / 2};
  zoom = 1; mapCenter = {...MAP_CENTER}; selected = stationCity = null;
  labelPriority = []; labelPlacements3D.clear();
  hoveredDestination = null; allDestinationsVisible = false; resultMapSelection = null; boardSpotlight = null;
  retainedVisible.clear(); ticketChoices.clear(); pendingChoiceKey = null; seenOfferId = null;
  resultMapCleanup?.(); resultMapCleanup = null; resultCamera = null; resultCameraKey = "";
  $("ticketList")._destinationHTML = null;
}
function boardUnavailable() {
  board3D?.dispose(); board3D = null; board3DFailed = true;
  $("mapscroll").classList.remove("board-ready");
  $("boardStatus").hidden = false;
  $("boardStatusText").textContent = I18n.t("No pudimos cargar el tablero 3D. Prueba a reintentarlo o recarga la página.");
  $("retryBoard").hidden = false;
  closeMapMenu();
}
async function initializeBoard3D() {
  if (board3DLoading || board3D || !game || !matchContext) return;
  board3DLoading = true; board3DFailed = false;
  $("boardStatus").hidden = false; $("retryBoard").hidden = true;
  $("boardStatusText").textContent = I18n.t("Preparando el tablero…");
  try {
    const { createBoard3D } = await import("./board-3d.js");
    if (!game || !matchContext) return;
    board3D = createBoard3D({ container: $("mapscroll"), map: boardMap, network: MAP_GEOMETRY, onFailure: boardUnavailable });
    $("board").setAttribute("preserveAspectRatio", "none");
    $("mapscroll").classList.add("board-ready"); $("boardStatus").hidden = true;
    labelPlacements3D.clear();
    if (game) renderBoard();
    applyZoom();
  } catch (error) {
    console.warn("Tablero 3D no disponible:", error.message); boardUnavailable();
  } finally { board3DLoading = false; }
}
let wagonPreview = null, wagonPreviewLoading = false, wagonCollection = null;
function hideWagonPreview() {
  wagonPreview?.dispose(); wagonPreview = null; $("wagonPreview").hidden = true;
  $("wagonCollectionDialog").close();
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
    wagonPreview ||= createWagonPreview({ container: $("wagonPreviewStage"), translate: text => I18n.t(text), onFailure: () => {
      wagonPreview?.dispose(); wagonPreview = null; $("wagonPreviewError").hidden = false;
    } });
    const color = previewColor(), description = wagonPreview.update(color);
    figure.dataset.model = description.model;
    $("wagonPreviewName").textContent = I18n.t(description.label);
    $("openWagonCollection").textContent = I18n.t(description.variantCount === 6 ? "Ver los 6 vagones" : "Ver detalle");
    if (wagonCollection) {
      wagonCollection.update(color);
      $("wagonCollectionDescription").textContent = I18n.t(description.label);
    }
    $("wagonPreviewStage").setAttribute("aria-label", I18n.t`${I18n.t(description.label)}, color ${I18n.t(LobbyUI.colorName(color))}`);
    $("wagonPreviewError").hidden = true;
  } catch (error) {
    $("wagonPreviewError").hidden = false;
    console.warn("Vista previa no disponible:", error.message);
  } finally { wagonPreviewLoading = false; }
}

$("wagonCollectionDialog").addEventListener('close', () => {
  wagonCollection?.dispose(); wagonCollection = null;
});
$("openWagonCollection").onclick = async () => {
  const dialog = $("wagonCollectionDialog");
  dialog.showModal(); $("wagonCollectionError").hidden = true;
  try {
    const { createWagonPreview } = await import("./wagon-preview.js");
    if (!dialog.open) return;
    wagonCollection ||= createWagonPreview({container:$("wagonCollectionStage"),gallery:true,translate:text=>I18n.t(text),onFailure:()=>{
      wagonCollection?.dispose(); wagonCollection=null; $("wagonCollectionError").hidden=false;
    }});
    const description=wagonCollection.update(previewColor());
    $("wagonCollectionDescription").textContent=I18n.t(description.label);
  } catch(error) { $("wagonCollectionError").hidden=false; }
};

let hoveredPlayer = null, focusedPlayer = null;
let displayedLogs = null;
let displayedHistoryKey = null;
let hoveredDestination = null, allDestinationsVisible = false;
let historyFollowing = true, lastDrawId = null, historyUnreadCount = 0;
let marketRefresh = null;
const pendingMarketRefreshes = [];
let lastEffectId = null, serverOffset = 0, seenOfferId = null;
let waitingForGameStart = false;
let retainedVisible = new Set();
const effectTimers = new Set();
const cardFlights = new Set();
const constructionFlights = new Map();
let constructionFocus=null,constructionFocusTimer=null,constructionWasBusy=false;
let tableFocus = null, tableFocusTimer = null;
const constructionBusy=()=>!replayMode&&!!game?.construction&&Date.now()+serverOffset<game.construction.until;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let uiDialog = null, dialogReturnFocus = null, buildTarget = null, buildSubmitting = false;
let tunnelReveal = null;
let ticketMapView = null, ticketMapLoadingNode = null, ticketMapCamera = null, ticketMapCameraKey = null;
let pinnedTicket = null, ticketPlans = new Map(), ticketMapShaded = true;
function disposeTicketMap() { ticketMapView?.dispose(); ticketMapView = null; ticketMapLoadingNode = null; }

let resultsSeen = false, resultMapSelection = null;
const expandedResults = new Set();
const resultViews = new Map();
let resultMapCleanup = null, resultCamera = null, resultCameraKey = "";
let resultScrollCleanup = null;
let toastTimer = null;
const ticketColor = i => TICKET_COLORS[i % TICKET_COLORS.length];
let pendingChoiceKey = null,
  ticketChoices = new Set(),
  hoveredTicket = null,
  desiredRoom = new URLSearchParams(location.search).get("room") || "";
if (new URLSearchParams(location.search).get('auth') === 'ok') {
  const returnRoom = sessionStorage.getItem('rr-account-return-room');
  sessionStorage.removeItem('rr-account-return-room');
  if (!desiredRoom && LobbyUI.isJoinCode(returnRoom)) desiredRoom = returnRoom;
}
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
function toast(message, duration = 4000) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), duration);
}
function identityKey(code) {
  return "rr-room-" + code;
}
function resetToLobby(message = "", preserveIdentity = false) {
  pendingRoomColor = colorRequest = null;
  message = I18n.t(message);
  cancelTunnelReveal(); disposeTicketMap();
  board3D?.setTunnelCards(null, cardArtwork); $("tunnelBoardNotice").hidden = true;
  if (!spectating && !preserveIdentity && (room || desiredRoom)) localStorage.removeItem(identityKey(room || desiredRoom));
  if (!preserveIdentity && localStorage.getItem("rr-practice-room") === (room || desiredRoom)) localStorage.removeItem("rr-practice-room");
  spectating = false; desiredWatch = ''; roomCapacity = 5;
  room = desiredRoom = token = "";
  game = null;
  seat = -1;
  members = [];
  host = practiceMode = attempted = false;
  lobbyStarted = homeBusy = false;
  pendingAction = null; storagePaused = false;
  inflightDraws.clear();handledDrawEvents.clear();
  document.body.classList.remove("is-confirming-action");
  $("sessionControls").open = false;
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
  historyUnreadCount = 0; updateHistoryUnread();
  clearTableFocus(false);
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
const resumedRooms = new Set();
let resolvingJoin = false;
function syncRecoveryControls() {
  $("privateSession").hidden = spectating || practiceMode || !sessionSupported || !!account?.ownsCurrentSeat();
}
async function joinDesiredRoom(automatic = false) {
  if (resolvingJoin || sessionReplaced || !desiredRoom) return;
  resolvingJoin = true;
  const code = desiredRoom, connection = sock;
  try {
    let credential = room === code && token ? token : incomingRecovery || localStorage.getItem(identityKey(code));
    if (!automatic || !resumedRooms.has(code)) {
      const recovered = await account.resumeSeat(code,credential);
      resumedRooms.add(code);
      if (recovered) { credential = recovered.token; incomingRecovery = credential; attempted = true; }
    }
    if (connection !== sock || code !== desiredRoom || sessionReplaced || sock.readyState !== WebSocket.OPEN) return;
    if (automatic && !attempted) return;
    send({type:'join',code,token:credential || undefined,name:$("nickname").value,color:preferredColor,secondaryColor,avatar:selectedAvatar,...(credential?{}:await account.joinData())});
  } catch (failure) { homeBusy = false;syncHomeAvailability();error(failure.message); }
  finally {
    resolvingJoin = false;
    if (connection !== sock && sock?.readyState === WebSocket.OPEN && !sessionReplaced) joinDesiredRoom(automatic);
  }
}
function connect() {
  if (sessionReplaced) return;
  sock = TrencitosConnection.socket();
  status(I18n.t("Conectando…"));
  sock.onopen = async () => {
    resendPending = true;
    lastDrawId = null;
    lastEffectId = null;
    status(I18n.t("● Conectado"));
    send({type:'list_rooms',compactMessages:2});
    if (desiredWatch) send({type:'spectate',code:desiredWatch});
    else if (desiredRoom) await joinDesiredRoom(true);
  };
  const receive = m => {
    if (m.type === 'directory') { shell?.receiveDirectory(m); return; }
    if (m.type === "error") {
      if (m.id && inflightDraws.has(m.id)) {
        settleDrawRequest(m.id, true);
        if (game) { renderHand();renderMarket(); }
        error(m.message);return;
      }
      // Color rejections settle the in-flight choice, preserving a newer click.
      if (colorRequest && ["COLOR_TAKEN", "INVALID_COLOR"].includes(m.code)) {
        if (pendingRoomColor === colorRequest) pendingRoomColor = null;
        colorRequest = null;
        renderHomeColors();
        flushRoomColor();
      } else cancelRoomColor();
      homeBusy = false; syncHomeAvailability();
      pendingAction = null;document.body.classList.remove("is-confirming-action");
      inflightDraws.clear();
      cancelDrawFeedback();
      if (game) renderMarket();
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
      inflightDraws.clear();
      cancelDrawFeedback();document.body.classList.remove("is-confirming-action");
      if (game) renderMarket();
      cancelRoomColor();
      notice(I18n.t("Esta partida está abierta en otra pestaña. Aquí no tienes el control."), "takeOver");
      updateCompactStatus();
      return;
    }
    if (m.type === "storage") {
      storagePaused = m.paused;
      if (storagePaused) { cancelDrawFeedback(); if (game) renderMarket(); }
      if (storagePaused) cancelRoomColor();
      syncHomeAvailability();
      if (storagePaused) notice(m.requiresRestart
        ? I18n.t("Partida pausada por el guardado remoto. El administrador debe restablecer el servicio; conserva esta pestaña para reconectar.")
        : I18n.t("Partida pausada: el servidor no pudo guardar. No se aceptarán jugadas hasta recuperarlo."), m.requiresRestart ? null : "retrySave");
      else if (!sessionReplaced) $("sessionNotice").classList.add("hidden");
      updateCompactStatus();
      return;
    }
    if (m.type === "ack") {
      if (inflightDraws.has(m.id)) {
        confirmDrawFeedback(m);
        if (game) { renderHand();renderMarket(); }
        return;
      }
      if (pendingAction?.id === m.id) {
        if (["choose_initial", "keep_tickets"].includes(pendingAction.action.type)) playSound("pen-sign");
        pendingAction = null;document.body.classList.remove("is-confirming-action");
        confirmDrawFeedback(m);
        if(game)renderMarket();
      }
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
      roomCapacity = m.maxPlayers || 5; roomVisibility = m.visibility || 'private'; roomTiming = GameTiming.normalize(m.timing);
      roomMapRef = m.mapRef || MapOptions.reference(MapOptions.options[0]);
      desiredRoom = room;
      seat = m.seat;
      token = m.token;
      incomingRecovery = null;
      members = m.members;
      if (enteringRoom || lobbyStarted || spectating) pendingRoomColor = colorRequest = null;
      if (colorRequest === members[seat]?.color) {colorRequest=null;if(pendingRoomColor===members[seat]?.color)pendingRoomColor=null;}
      $('abandonRoom').hidden=spectating||practiceMode||!m.started;
      $('commitmentNotice').textContent=I18n.t(m.commitment?.disabled?'Puedes salir sin penalización por abandono.':m.commitment?.eligible?'Compromiso: tienes 120 segundos para reconectarte.':'Esta partida no afecta tu Compromiso.');
      host = m.host;
      practiceMode = !!m.practice;
      sessionSupported = m.sessionVersion >= 1;
      drawFeedbackSupported = m.drawFeedbackVersion === 1;
      drawPipelineSupported = m.drawPipelineVersion === 1;
      syncRecoveryControls();
      $("leaveRoom").hidden = spectating;
      $("reclaimControl").classList.toggle("hidden", !members[seat]?.autopilot);
      $("reclaimControl").disabled = !!members[seat]?.reclaim;
      $("reclaimControl").textContent = members[seat]?.reclaim ? I18n.t("Volverás en tu siguiente turno") : I18n.t("Recuperar control");
      if (!spectating) localStorage.setItem(identityKey(room), token);
      if (!spectating && (practiceMode || m.started && members.filter(member=>!member.bot).length===1 && members.some(member=>member.bot))) localStorage.setItem("rr-practice-room", room);
      localStorage.setItem("rr-name", $("nickname").value);
      if (enteringRoom || m.started) history.replaceState(null, "", spectating ? '/rooms?watch='+room : "/rooms?room=" + room);
      renderLobby();
      flushRoomColor();
      shell?.joined();
      if (!spectating) account?.linkSeat();
      if (resendPending) {
        resendPending = false;
        if (inflightDraws.size) for (const draw of inflightDraws.values()) send(draw.command);
        else if (pendingAction) send(pendingAction);
      }
      return;
    }
    if (m.type === "state") {
      try { useMatchDefinition(m.game, m.definition); } catch { return; }
      const effects = prepareEffects(m.game), oldTurn = game?.turnSerial, oldOffer = game?.ticketOffer;
      if (oldOffer && oldOffer.id !== m.game.ticketOffer?.id) localStorage.removeItem(`rr-choice-${room}-${seat}-${oldOffer.id}`);
      if (game?.initial && !m.game.initial) localStorage.removeItem(`rr-choice-${room}-${seat}-initial-${game.initial.map(t => t.id).join("-")}`);
      if (game?.phase === 'finished' && m.game.phase === 'initial') handledDrawEvents.clear();
      game = m.game;
      revealPendingDraw(m.drawReceipts);
      wagonSeed = room;
      prepareMarketRefresh(effects);
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
  sock.onmessage = event => {
    let message;
    try { message=JSON.parse(event.data); } catch { return; }
    if(message?.type==='batch'&&Array.isArray(message.messages)){
      for(const item of message.messages)if(item&&typeof item==='object')receive(item);
    }else if(message&&typeof message==='object')receive(message);
  };
  sock.onclose = () => {
    cancelRoomColor();
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
        `<div class="member" data-member="${i}">${homeAvatarMarkup(m.bot || m.autopilot,m.avatar)}<div class="member-identity"><button type="button" class="player-profile-trigger" data-player-profile="${i}" title="${escapeHTML(m.displayName||m.name)}">${escapeHTML(m.name)}</button><small>${[i === seat ? I18n.t("Tú") : "", m.host ? I18n.t("Anfitrión") : "", m.bot ? "Bot" : !m.connected ? I18n.t("Sin conexión · reserva 60 s") : "", I18n.t(LobbyUI.colorName(m.color))].filter(Boolean).join(" · ")}</small></div>${host && !lobbyStarted && i !== seat && !practiceMode ? I18n.t`<button class="member-remove" type="button" data-kick="${i}" aria-label="Retirar a ${escapeHTML(m.name)}" title="Retirar jugador">×</button>` : ""}</div>`,
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
function homeAvatarMarkup(bot = false,avatar = selectedAvatar) {
  if (bot) return `<span class="home-avatar is-bot" aria-hidden="true">${ShellIcons.svg('bot')}</span>`;
  if(avatar==='capybara')return '<span class="home-avatar" aria-hidden="true"><img src="/assets/avatars/capybara.png" alt="" /></span>';
  return '<span class="home-avatar" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="5"/><path d="M7 27v-4a9 9 0 0 1 18 0v4Z"/></svg></span>';
}
function syncHomeAvailability() {
  const unavailable = homeBusy || sock?.readyState !== WebSocket.OPEN || sessionReplaced || storagePaused;
  for (const id of ["create", "join", "createTest"]) $(id).disabled = unavailable;
  const savedPractice = localStorage.getItem("rr-practice-room");
  $("resumePractice").hidden = !LobbyUI.isJoinCode(savedPractice) || !localStorage.getItem(identityKey(savedPractice));
  $("resumePractice").disabled = unavailable;
  for (const tab of document.querySelectorAll("[data-home-tab]")) tab.disabled = homeBusy;
  $("regenerateCode").disabled = homeBusy;
  $("createCode").readOnly = homeBusy;
  $("start").disabled = unavailable || pendingRoomColor !== null || members.length < 2 || members.some(m => !m.connected);
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
  const selectedColor = previewColor();
  applyPlayerAppearance($("homeAvatar"), selectedColor);
  $("chosenColorName").textContent = I18n.t(LobbyUI.colorName(selectedColor));
  $("practiceColorName").textContent = $("chosenColorName").textContent;
  $("roomColors").setAttribute("aria-busy", String(pendingRoomColor !== null));
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
      button.setAttribute("aria-pressed", String(color === selectedColor));
      button.disabled = !!owner || (id === "roomColors" && lobbyStarted);
      if (color === selectedColor) button.innerHTML = '<span aria-hidden="true">✓</span>';
      button.onclick = () => {
        if (id === "roomColors") selectRoomColor(color);
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
$("homeCreate").onsubmit = async event => {
  event.preventDefault();
  if (homeBusy) return;
  if (room) return error(I18n.t("Ya perteneces a una sala."));
  const code = $("createCode").value.trim();
  if (!LobbyUI.isNewCode(code)) { homeCodeError("create", I18n.t("Usa entre 6 y 10 números, sin espacios.")); $("createCode").focus(); return; }
  attempted = false;
  homeBusy = true; syncHomeAvailability();
  try{send({type:'create',name:$('nickname').value,code,color:preferredColor,secondaryColor,avatar:selectedAvatar,visibility:'public',maxPlayers:5,...await account.joinData()});}catch(failure){homeBusy=false;syncHomeAvailability();error(failure.message);}
};
$("createTest").onclick = async () => {
  if (homeBusy) return;
  if (room) return error(I18n.t("Ya perteneces a una sala."));
  attempted = false;
  $("lobbyError").textContent = "";
  waitingForGameStart = true;
  homeBusy = true; syncHomeAvailability();
  try{send({type:'create_test',name:$('nickname').value,color:preferredColor,secondaryColor,avatar:selectedAvatar,...await account.joinData()});}catch(failure){homeBusy=false;waitingForGameStart=false;syncHomeAvailability();error(failure.message);}
};
$("resumePractice").onclick = () => {
  if (homeBusy || room) return;
  desiredRoom = localStorage.getItem("rr-practice-room") || "";
  if (!LobbyUI.isJoinCode(desiredRoom)) return;
  attempted = true; homeBusy = true; syncHomeAvailability();
  joinDesiredRoom();
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
  joinDesiredRoom();
};
$("start").onclick = () =>
  send({ type: "start" });
async function copyInvitation() {
  const url = TrencitosConnection.publicUrl("/?room=" + room);
  try {
    await navigator.clipboard.writeText(url);
    $("copyLink").textContent = I18n.t("✓ Copiado");
    toast(I18n.t("Enlace de invitación copiado"), 2200);
    setTimeout(() => {
      $("copyLink").textContent = I18n.t("Copiar invitación");
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
  resumedRooms.delete(room);
  $("sessionNotice").classList.add("hidden"); connect();
};
$("retrySave").onclick = () => send({ type: "retry_save" });
$("copyRecovery").onclick = async () => {
  const url = TrencitosConnection.publicUrl("/?room=" + room + "#recover=" + encodeURIComponent(token));
  try { await navigator.clipboard.writeText(url); toast(I18n.t("Enlace privado copiado. Guárdalo solo para ti.")); }
  catch { prompt(I18n.t("Tu enlace privado de recuperación (no lo compartas)"), url); }
};
$("rotateRecovery").onclick = () => {
  if (confirm(I18n.t("¿Invalidar el enlace privado anterior? Después copia y guarda el nuevo."))) send({ type: "rotate_token" });
};
$("reclaimControl").onclick = () => send({ type: "reclaim" });
document.addEventListener('click',event=>{const trigger=event.target.closest('[data-player-profile]');if(!trigger)return;event.stopPropagation();const member=members[Number(trigger.dataset.playerProfile)];if(member)ProfileUI.openPlayer(member);});
$('abandonRoom').onclick=()=>{if(confirm(I18n.t(game?.commitment?.disabled?'¿Abandonar definitivamente? No podrás recuperar el puesto. No habrá penalización de Compromiso.':'¿Abandonar definitivamente? No podrás recuperar el puesto y perderás un punto de Compromiso si la penalización está activa.')))send({type:'abandon'});};
$("leaveRoom").onclick = () => {
  if (practiceMode) { if (game?.phase === "finished" || confirm(I18n.t("¿Abandonar esta partida de práctica?"))) send({type:"leave_test"}); return; }
  if (spectating || !game || game.phase === "finished" || confirm(I18n.t("¿Salir temporalmente? Un bot tomará tu puesto. Tienes 120 segundos para reconectarte mientras la penalización siga activa."))) send({ type: "leave" });
};
function commandId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
    Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
function act(type, other = {}, preparedDraw = null) {
  if(constructionBusy())return;
  if (type === "draw_train" && marketRefresh) return;
  if(replayMode)return;
  if (spectating) return;
  if (sessionReplaced || storagePaused || members[seat]?.autopilot) { error(I18n.t("No tienes el control de este puesto.")); return; }
  if (sock?.readyState !== WebSocket.OPEN) { error(I18n.t("Sin conexión.")); return; }
  if (pendingAction) {
    if (type === "draw_train" && pendingDraw && !pendingDraw.cancelled && !queuedDraw &&
        DrawIntent.canQueue(pendingDraw.intent, game, other.index)) {
      queuedDraw = { id: commandId(), intent: DrawIntent.create(game, seat, other.index, gameRules.trainCards.drawsPerTurn), order: 2 };
      drawPresentations.set(queuedDraw.id, queuedDraw);
      queuedDraw.flight = startDrawFeedback(queuedDraw);
      if (drawPipelineSupported) {
        queuedDraw.command = { type: 'action', id: queuedDraw.id, revision: pendingDraw.intent.revision,
          after: pendingDraw.id, action: { type: 'draw_train', ...other } };
        inflightDraws.set(queuedDraw.id, queuedDraw);send(queuedDraw.command);
      }
      renderHand();
      renderMarket();
    }
    return;
  }
  if (queuedDraw && !preparedDraw) return;
  // Let an already running older server finish its games before it is restarted.
  if (!sessionSupported) { send({ type: "action", action: { type, ...other } }); return; }
  const id = preparedDraw?.id || commandId();
  if (type === "draw_train" && drawFeedbackSupported) {
    const intent = DrawIntent.create(game, seat, other.index, gameRules.trainCards.drawsPerTurn);
    if (!intent) return;
    pendingDraw = preparedDraw || { intent, id, order: 1 };
    pendingDraw.intent = intent;
    drawPresentations.set(id, pendingDraw);
    if (!preparedDraw) pendingDraw.flight = startDrawFeedback(pendingDraw);
  }
  pendingAction = { type: "action", id, revision: game.revision, action: { type, ...other },
    ...(type === 'draw_train' && drawPipelineSupported ? { chainDraws: true } : {}) };
  if (pendingDraw?.id === id) { pendingDraw.command = pendingAction;inflightDraws.set(id, pendingDraw);renderHand(); }
  document.body.classList.add("is-confirming-action");
  renderMarket();
  send(pendingAction);
}
function amIUp() {
  return !constructionBusy() && !sessionReplaced && !storagePaused && sock?.readyState === WebSocket.OPEN && !members[seat]?.autopilot && game && game.current === seat && game.phase === "play" && !game.turnWaiting;
}
function drawAllowed(index) {
  if (marketRefresh || !amIUp() || queuedDraw) return false;
  if (pendingAction) return !!pendingDraw && !pendingDraw.cancelled && DrawIntent.canQueue(pendingDraw.intent, game, index);
  return !!DrawIntent.create(game, seat, index, gameRules.trainCards.drawsPerTurn);
}
function colorCard(c, count, click, disabled) {
  const b = document.createElement(click ? "button" : "div");
  b.className = "traincard suit-" + c;
  const image = document.createElement("img");
  image.src = cardImageSource(c);
  image.dataset.cardColor = c;
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
function pendingHandDraws() {
  const valid = DrawIntent.pending(game, pendingDraw?.intent, queuedDraw?.intent);
  return [pendingDraw, queuedDraw].filter(draw => draw && !draw.cancelled && draw.landed && draw.intent.color && valid.includes(draw.intent)).map(draw => draw.intent);
}
function displayedHandCount(index) {
  return index === seat ? displayedHand().length + pendingHandDraws().length : game.players[index].handCount;
}
function displayedHand() {
  const hand = [...game.hand];
  for (const draw of drawPresentations.values()) {
    if (draw.event && !draw.landed && !draw.cancelled) {
      const index = hand.indexOf(draw.event.color);if (index >= 0) hand.splice(index, 1);
    }
  }
  return hand;
}
function renderHand() {
  if (!game) return;
  const pending = pendingHandDraws(), confirmed = displayedHand(), colors = [...gameRules.colors, "wild"];
  const groups = colors.map(color => ({ color,
    confirmed: confirmed.filter(c => c === color).length,
    pending: pending.filter(draw => draw.color === color).length,
    arriving: [...drawPresentations.values()].some(draw => !draw.landed && !draw.cancelled && (draw.flight?.landing || draw.replay) && (draw.event?.color || draw.intent.color) === color),
  }));
  const hand = $("hand"), key = JSON.stringify([I18n.language, groups]);
  if (hand._cardsKey !== key) {
    const before = new Map([...hand.querySelectorAll('.traincard')].map(card => [card, card.getBoundingClientRect()]));
    for (const card of before.keys()) { card._layoutMotion?.cancel(); card._layoutMotion = null; }
    hand._cardsKey = key;
    const kept = new Set();
    for (const group of groups) {
      const count = group.confirmed + group.pending;
      if (!count && !group.arriving) continue;
      let card = hand.querySelector(`.suit-${group.color}`);
      if (!card) card = colorCard(group.color, count, null, false);
      const label = I18n.t`${N[group.color]}: ${count} carta${count === 1 ? "" : "s"}`;
      card.querySelector('img').alt = N[group.color];
      card.querySelector('.cardcount').lastChild.textContent = String(count);
      card.title = `${N[group.color]} · ${count}`;
      card.setAttribute('aria-label', label);
      card.classList.toggle("is-pending", group.pending > 0);
      card.classList.toggle('is-arriving', !count);
      if (!count) card.setAttribute('aria-hidden','true'); else card.removeAttribute('aria-hidden');
      card.setAttribute('aria-busy', String(group.pending > 0));
      if (group.pending) {
        const pendingLabel = I18n.t`${group.pending} carta(s) pendiente(s) de confirmación`;
        card.title += ` · ${pendingLabel}`;
        card.setAttribute('aria-label', `${label} · ${pendingLabel}`);
      }
      kept.add(card); hand.appendChild(card);
    }
    for (const child of [...hand.children]) if (!kept.has(child)) child.remove();
    if (!hand.children.length) hand.innerHTML = I18n.t('<span class="smallmuted">Aún no tienes cartas de tren.</span>');
    layoutHand();
    if (!reducedMotion.matches && !document.hidden && (!replayMode || replayMotion)) for (const card of kept) {
      const old = before.get(card), rect = card.getBoundingClientRect();
      if (!rect.width) continue;
      const frames = old ? [
        {transform:`translate(${old.x-rect.x}px,${old.y-rect.y}px) scale(${old.width/rect.width},${old.height/rect.height})`},
        {transform:'none'},
      ] : [{opacity:0,transform:'translateY(8px) scale(.94)'},{opacity:1,transform:'none'}];
      card._layoutMotion = card.animate(frames,{duration:230/(replayMode?replaySpeed:1),easing:'cubic-bezier(.2,.7,.2,1)'});
    }
  }
  const count = confirmed.length + pending.length;
  $("handCount").textContent = I18n.t`${count} cartas`;
  hand.setAttribute("aria-busy", String(pending.length > 0 || drawPresentations.size > 0));
  const ownMetric = $("scores").querySelector(`[data-player="${seat}"] [data-metric="cards"]`);
  if (ownMetric) {
    const label = `${I18n.t("Cartas en mano")}: ${count}`;
    ownMetric.querySelector("strong").textContent = count;
    ownMetric.title = label; ownMetric.setAttribute("aria-label", label);
    const player = game.players[seat];
    ownMetric.closest("[data-player]").setAttribute("aria-label", I18n.t`${player.name}. ${playerScore(seat)} puntos, ${count} cartas, ${player.trains} vagones, ${player.stations} estaciones. Enfoca para resaltar sus rutas.`);
  }
  layoutHand();
  updateCompactPlayer();
}
function playerAvatar(index, compact = false, actor = null) {
  const member = members[index];
  if (actor===null ? member?.bot || member?.autopilot : ['bot','replacement'].includes(actor)) return `<span class="player-avatar is-bot${compact ? " history-avatar" : ""}" aria-hidden="true">${ShellIcons.svg('bot')}</span>`;
  if(member?.avatar==='capybara')return `<span class="player-avatar${compact?" history-avatar":""}" aria-hidden="true"><img src="/assets/avatars/capybara.png" alt="" /></span>`;
  return `<span class="player-avatar${compact ? " history-avatar" : ""}" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="5"/><path d="M7 27v-4a9 9 0 0 1 18 0v4Z"/></svg></span>`;
}
function render() {
  if (!game) return;
  hideWagonPreview();
  if (!board3D && !board3DLoading && !board3DFailed) initializeBoard3D();
  document.body.classList.add("is-playing");
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("commitmentBanner").hidden=!game.commitment?.disabled || ["finished","closing"].includes(game.phase);
  $("abandonRoom").hidden=practiceMode||spectating||["finished","closing"].includes(game.phase);
  renderPracticeControls();
  $("serverWarning").classList.toggle("hidden", game.uiVersion >= 10 && sessionSupported);
  const active = amIUp();
  // Keep the live clock node when rebuilding player summaries.
  $("game").append(turnBanner);
  const previousFocus = document.activeElement.closest("[data-player]")?.dataset.player;
  const previousHover = $("scores").querySelector(".scorebadge:hover")?.dataset.player;
  $("scores").innerHTML = game.players
    .map(
      (x, i) =>
        I18n.t`<div class="scorebadge ${i === game.current && ["play", "tunnel"].includes(game.phase) ? "active" : ""}" data-player="${i}" tabindex="0" aria-label="${escapeHTML(x.name)}. ${playerScore(i)} puntos, ${x.handCount ?? "—"} cartas, ${x.trains} vagones, ${x.stations} estaciones. Enfoca para resaltar sus rutas.">
          <div class="player-heading">${playerAvatar(i)}<div class="player-details"><button type="button" class="player-profile-trigger" data-player-profile="${i}" title="${escapeHTML(members[i]?.displayName||x.name)}">${escapeHTML(x.name)}</button><div class="player-status"><span class="player-turn-tag">EN TURNO</span><span class="player-state">${[i === seat ? I18n.t("Tú") : "", game.phase === "initial" ? (x.initialReady ? I18n.t("✓ Listo") : I18n.t("Eligiendo billetes")) : ""].filter(Boolean).join(" · ")}</span></div></div></div>
          <div class="player-metrics">${playerMetric("points", I18n.t(game.result ? "Puntuación final" : "Puntos de construcción"), playerScore(i))}${playerMetric("cards", I18n.t("Cartas en mano"), x.handCount ?? "—")}${playerMetric("trains", I18n.t("Vagones"), x.trains)}${playerMetric("stations", I18n.t("Estaciones"), x.stations)}${playerMetric("tickets", I18n.t("Billetes conservados"), x.ticketsCount ?? "—")}</div>
          <span class="player-longest" title="${I18n.t("Longitud del camino más largo")}">↝ ${game.scoreProgress?.players[i]?.longest ?? "—"}</span>${scoreBonus(i)}
          ${members[i]?.connected === false || members[i]?.autopilot ? `<span class="player-connection" role="img" aria-label="${I18n.t(members[i]?.autopilot ? 'Bot de reemplazo' : 'Sin conexión')}"></span>` : ""}
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
    badge.querySelector('.live-bonus')?.addEventListener('click', event => {
      event.stopPropagation(); setCompactPanel('map'); focusLongestPath(i);
    });
    badge.setAttribute("role", "button");
    if(replayMode)badge.setAttribute('aria-pressed',String(i===seat));
    badge.onclick = event => {
      if(event.target.closest(".live-score-details, .live-bonus"))return;
      if(replayMode){ReplayUI.selectViewer(i);return;}
      setCompactPanel("map");
      compactPlayer = i; updateCompactPlayer();
    };
    badge.addEventListener("keydown", event => {
      if(event.target.closest(".live-score-details, .live-bonus"))return;
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
  $("roundStatus").dataset.phase = game.phase === "finished" ? "finished" : game.finalRemaining !== null ? "last" : "normal";
  $("roundStatus").textContent = game.phase === "finished" ? I18n.t("Final") : game.phase === "initial" ? I18n.t`${game.initialReadyCount}/${game.players.length} listos` : game.finalRemaining !== null ? I18n.t("Última ronda") : "";
  const lastRound = Number.isInteger(game.finalRemaining) && game.finalRemaining > 0 && !["finished", "abandoned"].includes(game.phase);
  $("finalRoundNotice").classList.toggle("hidden", !lastRound);
  $("finalRoundNotice").textContent = lastRound ? I18n.t`Última ronda · ${game.finalRemaining} turno(s) restante(s)` : "";
  $("initialStatus").classList.toggle("hidden", game.phase !== "initial");
  $("initialStatusText").textContent = I18n.t`${game.initialReadyCount}/${game.players.length} listos · ${game.players[seat]?.initialReady ? I18n.t("Puedes explorar el mapa mientras esperas") : I18n.t("Todos eligen a la vez")}`;
  $("viewResults").classList.toggle("hidden", game.phase !== "finished");
  if (game.phase === "closing") $("roundStatus").innerHTML = I18n.t('Últimos billetes <span data-clock="closing"></span>');
  renderHand();
  $("ticketTotal").textContent = game.tickets.length;
  renderDestinations();
  layoutHand();
  renderMarket();
  $("pendingTickets").classList.toggle("hidden", !game.ticketOffer);
  $("deckinfo").textContent =
    I18n.t`${game.deckCount} cartas ocultas · ${game.ticketDeckCount} destinos por robar`;
  $("drawblind").title = I18n.t`Robar una carta oculta · ${game.deckCount} disponibles`;
  $("drawtickets").title = I18n.t`Robar nuevos destinos · ${game.ticketDeckCount} disponibles`;
  $("drawstats").textContent = active ? `${game.drawCount}/${gameRules.trainCards.drawsPerTurn}` : "";
  $("drawstats").setAttribute("aria-label", active ? I18n.t`${game.drawCount} de ${gameRules.trainCards.drawsPerTurn} robos usados` : "");
  $("pass").classList.toggle("hidden", !GameUI.canPass(game, seat, matchContext.cityIds, gameRules));
  renderHistory();
  renderBoard();
  renderDialog();
  if ($("overlay").classList.contains("hidden")) disposeTicketMap();
  applyZoom();
  updateCompactStatus();
  updateCompactPlayer();
  if (compactPanel === "rules") renderTableRules();
  if (compactPanel === "hand") renderTableHand();
  updateClocks();
}
function updateClocks() {
  if (!game) return;
  const busy=constructionBusy();
  if(constructionWasBusy&&!busy){constructionWasBusy=false;render();return;}
  constructionWasBusy=busy;
  const now = replayAt ?? Date.now() + serverOffset;
  const deadlines = { initial: game.initialDeadline, turn: game.turnDeadline, offer: game.ticketOffer?.deadline, waiting: game.waitingDeadline, closing: game.closingDeadline };
  for (const node of document.querySelectorAll("[data-clock]")) {
    const deadline = deadlines[node.dataset.clock];
    const frozen = game.sharedTunnel && (node.dataset.clock === "offer" ? game.sharedTunnel.offerRemaining : node.dataset.clock === "turn" && game.sharedTunnel.stage === "reveal" ? game.sharedTunnel.turnRemaining : null);
    const remaining = frozen != null ? frozen : Number.isFinite(deadline) ? Math.max(0, deadline - now) : null;
    const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
    node.textContent = seconds === null ? "" : node.dataset.clockFormat === "timer" ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : `${seconds}s`;
    node.classList.toggle("clock-warning", seconds !== null && seconds <= 10);
    node.classList.toggle("clock-urgent", seconds !== null && seconds <= 5);
    node.setAttribute("aria-label", seconds === null ? "" : I18n.t`${seconds} segundos restantes`);
    const bar = node.id === "compactClock" ? $("turnBanner") : node.closest("[data-countdown]");
    if (bar) {
      const duration = node.dataset.clock === "initial" ? (game.timing?.initialSeconds || 60) * 1000
        : node.dataset.clock === "offer" ? game.ticketOffer?.duration || 60000 : (game.timing?.turnSeconds || 60) * 1000;
      bar.style.setProperty("--time-left", String(Math.min(1, (remaining || 0) / duration)));
      bar.classList.toggle("is-warning", seconds !== null && seconds <= 10);
      bar.classList.toggle("is-urgent", seconds !== null && seconds <= 5);
    }
  }
  updateClockSound(now);
  updateSharedTunnel();
  syncTunnelBoard();
}
setInterval(updateClocks, 250);
$("pendingTickets").onclick = () => { if (game?.ticketOffer) { uiDialog = "tickets"; showTicketDialog(game.ticketOffer.tickets, Math.min(game.ticketOffer.tickets.length, gameRules.destinations.offerMinimum)); } };
function renderMarket() {
  $("drawtickets").disabled = !canDrawDestinations();
  $("market").setAttribute("aria-label", I18n.t`${gameRules.trainCards.marketSize} cartas visibles y mazo oculto`);
  const blindDeck = $("drawblind");
  const visibleCards = Array.from({ length: gameRules.trainCards.marketSize }, (_, i) => {
    const c = game.face[i];
    if (!c) { const empty = document.createElement("div"); empty.className = "empty-market-slot"; empty.setAttribute("aria-label", I18n.t("Sin carta disponible")); return empty; }
    const card = colorCard(c, null, () => act("draw_train", { index: i }), !drawAllowed(i));
    card.dataset.marketIndex = i;
    card.classList.toggle("draw-reserved", [pendingDraw, queuedDraw].some(draw => draw?.intent.index === i && draw.intent.revision === game.revision));
    card.title = I18n.t`Robar ${N[c]}${c === "wild" ? I18n.t(" · Consume los dos robos; no puede ser tu segunda carta") : ""}`;
    card.setAttribute("aria-label", card.title);
    return card;
  });
  $("market").classList.toggle("market-refreshing", !!marketRefresh);
  $("market").replaceChildren(...visibleCards, blindDeck, ...(marketRefresh?.layer ? [marketRefresh.layer] : []));
  $("drawblind").disabled =
    !drawAllowed(-1);
}
function renderTurnHistory() {
  const list=$("history"),entries=$("historyEntries"),rows=TurnHistory.displayRows(game.turnHistory);
  const key=JSON.stringify(rows);if(displayedHistoryKey===key)return;displayedHistoryKey=key;
  const following=historyFollowing,top=list.getBoundingClientRect().top;
  const anchor=[...entries.children].find(row=>row.getBoundingClientRect().bottom>top);
  const anchorId=anchor?.dataset.historyId,offset=anchor?anchor.getBoundingClientRect().top-top:0;
  const existing=new Map([...entries.children].map(node=>[node.dataset.historyId,node]));
  const nodes=rows.map(row=>{const signature=JSON.stringify(row),old=existing.get(row.id);
    if(old?._signature===signature)return old;
    const node=TurnHistory.render(row,{players:game.players,city:cityName});
    if(Number.isInteger(row.seat)&&game.players[row.seat]){
      node.insertAdjacentHTML('afterbegin',playerAvatar(row.seat,true,row.events[0]?.actor||'player'));
      applyPlayerAppearance(node,game.players[row.seat].color);node.dataset.actor=row.seat;
    }
    const construction = [...row.events].reverse().find(event => event.type === 'build' || event.type === 'tunnel_result' && event.data.outcome === 'built');
    if (construction?.data.routeId !== undefined) {
      const focus = document.createElement('button'); focus.type = 'button'; focus.className = 'history-route-focus';
      focus.textContent = I18n.t('Ver'); focus.onclick = () => focusHistoryRoute(construction.data.routeId);
      node.append(focus);
    }
    node._signature=signature;return node;});
  entries.replaceChildren(...nodes);
  if(game.historyPartial){const partial=document.createElement('p');partial.className='history-empty';partial.textContent=I18n.t('Registro parcial: esta partida comenzó con una versión anterior.');entries.prepend(partial);}
  noteNewHistoryRows(rows.map(row=>row.id));
  displayedLogs=rows.map(row=>row.id);
  if(following)list.scrollTop=list.scrollHeight;
  else {const node=nodes.find(n=>n.dataset.historyId===anchorId);if(node)list.scrollTop+=node.getBoundingClientRect().top-top-offset;$("historyLatest").classList.remove('hidden');}
  updateHistoryScroll();
}
function renderHistory() {
  if (replayMode) return;
  if (game.turnHistory) return renderTurnHistory();
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
    const text = document.createElement("span");
    if (entry.draw && player) {
      text.className = "history-draw";
      text.textContent = I18n.t`${player.name} robó` + " ";
      const card = document.createElement("img");
      const color = entry.draw.index >= 0 && N[entry.draw.color] ? entry.draw.color : "back";
      card.src = `assets/cards/${color}.svg`; card.draggable = false;
      card.alt = color === "back" ? I18n.t("Carta oculta del mazo") : N[color];
      card.title = card.alt;
      text.appendChild(card);
    } else {
      text.textContent = entry.message ? I18n.format(entry.message) : I18n.t(entry.text);
      if (entry.marketRefresh) {
        row.classList.add('history-market-refresh');
        const cards = document.createElement('span'); cards.className = 'history-draw';
        cards.setAttribute('aria-label', I18n.t('Cartas retiradas de la mesa'));
        for (const color of entry.marketRefresh.before) {
          const image = document.createElement('img'); image.src = cardImageSource(color);
          image.alt = N[color]; image.title = N[color]; cards.appendChild(image);
        }
        text.appendChild(cards);
      }
    }
    row.appendChild(text);
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
  if (historyFollowing) {
    $("historyLatest").classList.add("hidden");
    historyUnreadCount = 0; updateHistoryUnread();
  }
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
let observedDrawEnd = 0, observedDrawLaunch = 0;
function playEffects(events, speed=1) {
  for (const event of events) {
    if (event.type === "draw") {
      if (event.seat === seat && handledDrawEvents.has(event.id)) continue;
      const now = performance.now();
      const followsRenewal = marketRefresh && !events.some(e => e.type === 'market_refresh' && e.id === marketRefresh.id);
      const drawDelay = reducedMotion.matches ? 0 : Math.max(0, observedDrawLaunch + 320/speed - now, followsRenewal ? (marketRefresh.until || now) - now : 0);
      observedDrawLaunch = now + drawDelay; observedDrawEnd = observedDrawLaunch + 680/speed;
      const timer = setTimeout(() => {
        effectTimers.delete(timer);
        if (document.hidden || game?.phase === "finished") return;
        playSound("card");
        if (!reducedMotion.matches && event.source?.width) animateCardFlight(event,speed);
      }, drawDelay);
      effectTimers.add(timer);
    } else if (event.type === "market_refresh") {
      // The renewal is public even when the compact market panel is closed.
      if (event.id !== marketRefresh?.id && !pendingMarketRefreshes.some(refresh => refresh.id === event.id)) playSound("shuffle");
      // Visible renewal sound starts with its gesture below.
    }
    else if (event.type === "tickets") playSound("card");
    else if (event.type === "build" && !event.deferredForTunnel) animateConstruction(event,speed);
    else if (event.type === "turn" && event.seat === seat && !replayMode) {
      const timer=setTimeout(()=>{effectTimers.delete(timer);if(!document.hidden)playSound("bell");},Math.max(0,(game.construction?.until||0)-(Date.now()+serverOffset)));
      effectTimers.add(timer);
    }
  }
  if (events.some(event => event.type === 'market_refresh' && event.id === marketRefresh?.id)) animateMarketRefresh();
}
// Small original synthesized effects: no external audio, tracking or downloads.
let soundContext = null, muted = localStorage.getItem("rr-muted") === "true";
const soundNodes = new Set();
let penSound = null;
let urgentClockKey = null, lastClockSoundAt = -Infinity;
const playedClockSeconds = new Set();
function updateClockSound(now) {
  if (muted || document.hidden || soundContext?.state !== "running" || replayAt !== null || spectating ||
      sessionReplaced || storagePaused || game?.storagePaused || pendingAction || members[seat]?.autopilot ||
      sock?.readyState !== WebSocket.OPEN) return;
  const clock = GameUI.urgentClock(game, seat, now);
  if (!clock) return;
  const key = `${room}:${seat}:${clock.kind}:${clock.deadline}`;
  if (key !== urgentClockKey) { urgentClockKey = key; playedClockSeconds.clear(); }
  const at = performance.now();
  if (playedClockSeconds.has(clock.seconds) || at - lastClockSoundAt < 900) return;
  playedClockSeconds.add(clock.seconds); lastClockSoundAt = at;
  playSound(clock.seconds % 2 ? "clock-tick" : "clock-tock");
}
function soundLabel() {
  $("soundToggle").innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3Z"/>${muted ? '<path d="m16 9 5 6m0-6-5 6"/>' : '<path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg><span>${I18n.t(muted ? "Sonido desactivado" : "Sonido activado")}</span><kbd>M</kbd>`;
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
function stopSounds() { for (const node of soundNodes) { try { node.stop(); } catch (_) {} } soundNodes.clear(); penSound = null; }
function toggleSound() {
  muted = !muted; localStorage.setItem("rr-muted", String(muted)); soundLabel();
  if (muted) stopSounds(); else unlockSound();
  toast(I18n.t(muted ? "Sonido silenciado" : "Sonido activado"), 1800);
}
$("soundToggle").onclick = toggleSound;
document.addEventListener("pointerdown", unlockSound, { passive: true });
document.addEventListener("keydown", unlockSound);
document.addEventListener("keydown", event => {
  if (!game || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      !["m", "h"].includes(event.key.toLowerCase()) || event.isComposing ||
      event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  if (event.key.toLowerCase() === "m") { event.preventDefault(); toggleSound(); }
  else if (!uiDialog && !document.querySelector("dialog[open]") && $("overlay").classList.contains("hidden") && !$("toggleDestinations").disabled) {
    event.preventDefault(); toggleDestinationHighlight();
  }
});
soundLabel();
function playSound(kind) {
  if (muted || document.hidden || soundContext?.state !== "running") return;
  const ctx = soundContext, at = ctx.currentTime;
  if (kind === "shuffle") {
    // One paper sequence: gather, shuffle, then five light dealing strokes.
    const duration = .94, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0), strokes = [[.01,.17,.65],[.2,.3,.8], ...Array.from({length:5},(_,i)=>[.57+i*.065,.1,.5])];
    let grain = 0;
    for (let i = 0; i < data.length; i++) {
      const time = i / ctx.sampleRate;
      grain = grain * .3 + (Math.random() * 2 - 1) * .7;
      let envelope = 0;
      for (const [start, length, gain] of strokes) {
        const progress = (time - start) / length;
        if (progress > 0 && progress < 1) envelope += gain * Math.sin(Math.PI * progress);
      }
      data[i] = grain * envelope;
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = "bandpass"; filter.frequency.value = 1500; filter.Q.value = .55; gain.gain.value = .28;
    source.connect(filter).connect(gain).connect(ctx.destination); soundNodes.add(source);
    source.start(at); source.stop(at + duration);
    source.onended = () => { soundNodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return;
  }
  if (kind === "clock-tick" || kind === "clock-tock") {
    // A short mechanical click: filtered noise and two damped wood resonances.
    const duration = .065, frequency = kind === "clock-tick" ? 1450 : 1100;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate, attack = 1 - Math.exp(-t * 1800);
      data[i] = attack * ((Math.random() * 2 - 1) * Math.exp(-t * 130) * .5 +
        Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 100) * .35 +
        Math.sin(2 * Math.PI * frequency * .46 * t) * Math.exp(-t * 60) * .18);
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = 3800; gain.gain.value = .2;
    source.connect(filter).connect(gain).connect(ctx.destination); soundNodes.add(source);
    source.start(at); source.stop(at + duration);
    source.onended = () => { soundNodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return;
  }
  if (kind.startsWith("pen")) {
    // Short, irregular strokes through paper; a new mark replaces the last one.
    if (penSound) { try { penSound.stop(); } catch (_) {} }
    const signing = kind === "pen-sign", undo = kind === "pen-undo";
    const duration = signing ? .35 : undo ? .105 : .13 + Math.random() * .02;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0), strokes = signing ? 5 : 1;
    let grain = 0;
    for (let i = 0; i < data.length; i++) {
      const progress = i / data.length;
      grain = grain * .55 + (Math.random() * 2 - 1) * .45;
      const stroke = Math.pow(Math.max(0, Math.sin(progress * strokes * Math.PI)), .7);
      data[i] = grain * stroke * Math.sin(Math.PI * progress);
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = "bandpass"; filter.frequency.value = 1700 + Math.random() * 350; filter.Q.value = .6;
    gain.gain.setValueAtTime(undo ? .12 : .19, at);
    source.connect(filter).connect(gain).connect(ctx.destination);
    penSound = source; soundNodes.add(source); source.start(at); source.stop(at + duration);
    source.onended = () => { if (penSound === source) penSound = null; soundNodes.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return;
  }
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
function prepareMarketRefresh(events, speed=1) {
  if (game.phase !== 'play') { cancelMarketRefresh(false); return; }
  if (document.hidden || !$("market").getBoundingClientRect().width) return;
  // New authoritative states update underneath the presentation. They must not
  // cut short a public renewal the player is still watching.
  for (const event of events.filter(event => event.type === 'market_refresh')) {
    if (marketRefresh) pendingMarketRefreshes.push({...event,speed});
    else marketRefresh = { ...event, speed, layer:null, animations:[], timer:null };
  }
}
function cancelMarketRefresh(redraw = true, advance = false) {
  const current = marketRefresh; marketRefresh = null;
  if (current) {
    clearTimeout(current.timer);clearTimeout(current.soundTimer);effectTimers.delete(current.soundTimer);
    current.animations.forEach(animation => animation.cancel()); current.layer?.remove();
  }
  $("market").classList.remove("market-refreshing");
  if (advance && game?.phase === 'play' && pendingMarketRefreshes.length) {
    marketRefresh = {...pendingMarketRefreshes.shift(),layer:null,animations:[],timer:null};
    renderMarket();animateMarketRefresh();
  } else {
    pendingMarketRefreshes.length = 0;
    if (redraw && game) renderMarket();
  }
}
function animateMarketRefresh() {
  const current = marketRefresh;
  if (!current || current.layer) return;
  const market = $("market"), bounds = market.getBoundingClientRect(), deck = $("drawblind").getBoundingClientRect();
  const slots = [...market.querySelectorAll("[data-market-index]")].map(node => node.getBoundingClientRect());
  if (slots.length !== 5 || !bounds.width) { cancelMarketRefresh(); return; }
  const layer = document.createElement("div"); layer.className = "market-refresh-layer";
  layer.setAttribute("role", "status"); layer.setAttribute("aria-label", I18n.t("Renovando las cartas de la mesa"));
  current.layer = layer; market.appendChild(layer);
  const duration = (reducedMotion.matches ? 120 : 1200)/(current.speed||1);
  const delay = reducedMotion.matches ? 0 : Math.max(0, observedDrawEnd - performance.now(),
    ...[...drawPresentations.values()].filter(draw => !draw.landed && !draw.cancelled).map(draw => Math.max(190, (draw.flight?.deadline || 0) - performance.now())));
  current.until = performance.now() + delay + duration;
  current.soundTimer = setTimeout(() => {
    effectTimers.delete(current.soundTimer);
    if (marketRefresh === current) playSound('shuffle');
  }, delay + (reducedMotion.matches ? 0 : 180/(current.speed||1)));
  effectTimers.add(current.soundTimer);
  const card = (color, i) => {
    const rect = slots[i], image = document.createElement("img");
    image.src = `assets/cards/${color}.svg`; image.alt = ""; image.draggable = false;
    Object.assign(image.style, {left: `${rect.x - bounds.x}px`, top: `${rect.y - bounds.y}px`, width: `${rect.width}px`, height: `${rect.height}px`});
    layer.appendChild(image); return image;
  };
  const move = (x, y, scale = 1, rotation = 0) => `translate(${x}px,${y}px) scale(${scale}) rotate(${rotation}deg)`;
  current.before.forEach((color, i) => {
    const image = card(color, i), rect = slots[i];
    const gather = move(bounds.x + bounds.width / 2 - rect.x - rect.width / 2, bounds.y + bounds.height / 2 - rect.y - rect.height / 2, .8, (i - 2) * 9);
    const intoDeck = move(deck.x - rect.x, deck.y - rect.y, .25, (i - 2) * 3);
    const frames = reducedMotion.matches ? [{opacity:1},{opacity:0}] : [
      {transform:move(0,0),opacity:1,filter:"brightness(1)",offset:0},
      {transform:move(0,0),opacity:1,filter:color === "wild" ? "brightness(1.3) drop-shadow(0 0 6px #e6bc4d)" : "brightness(1)",offset:.18},
      {transform:gather,opacity:1,filter:"brightness(1)",offset:.43},
      {transform:intoDeck,opacity:0,offset:.6}, {transform:intoDeck,opacity:0,offset:1}
    ];
    current.animations.push(image.animate(frames,{duration,delay,fill:"both",easing:"ease-in-out"}));
  });
  current.after.forEach((color, i) => {
    const image = card(color, i), rect = slots[i], start = .56 + i * .035;
    const from = move(deck.x - rect.x, deck.y - rect.y, .25, (2 - i) * 5);
    const frames = reducedMotion.matches ? [{opacity:0},{opacity:1}] : [
      {transform:from,opacity:0,offset:0},{transform:from,opacity:0,offset:start},
      {transform:from,opacity:1,offset:start+.01},{transform:move(0,0),opacity:1,offset:start+.26},{transform:move(0,0),opacity:1,offset:1}
    ];
    current.animations.push(image.animate(frames,{duration,delay,fill:"both",easing:"ease-out"}));
  });
  current.timer = setTimeout(() => { if (marketRefresh === current) cancelMarketRefresh(true, true); }, delay + duration);
}
function removeCardFlight(flight) {
  if (!flight) return;
  clearTimeout(flight.waitTimer);
  flight.animations.forEach(a => a.cancel());flight.node.remove();cardFlights.delete(flight);
}
function cancelDrawFeedback(preservePending = false) {
  for (const draw of drawPresentations.values()) {
    draw.cancelled = true;removeCardFlight(draw.flight);
  }
  drawPresentations.clear();
  if (queuedDraw && !queuedDraw.command) { queuedDraw.cancelled = true;removeCardFlight(queuedDraw.flight); }
  // Sent commands survive geometry changes and disconnects. Reconnect retries
  // both IDs in order; a canceled visual must never cancel an accepted command.
  pendingDraw = preservePending ? inflightDraws.values().next().value || null : null;
  queuedDraw = preservePending ? [...inflightDraws.values()][1] || null : null;
  renderHand();
}
function startDrawFeedback(draw) {
  const intent = draw.intent;
  const source = intent.index < 0 ? $("drawblind") : $("market").querySelector(`[data-market-index="${intent.index}"]`);
  const start = source?.getBoundingClientRect();
  if (!start?.width || document.hidden) { draw.cancelled = true;draw.landed = true;return null; }
  const node = document.createElement("div"), face = document.createElement("div"), img = document.createElement("img");
  node.className = "draw-flight draw-flight-pending";node.dataset.drawId = draw.id;
  node.setAttribute("aria-hidden", "true");node.dataset.status = I18n.t("Robando carta");
  Object.assign(node.style, { left: `${start.x}px`, top: `${start.y}px`, width: `${start.width}px`, height: `${start.height}px` });
  face.className = "draw-flight-face";img.src = cardImageSource(intent.color || "back");img.dataset.cardColor = intent.color || 'back';img.alt = "";
  face.appendChild(img);node.appendChild(face);document.body.appendChild(node);
  const started = performance.now(), delay = reducedMotion.matches ? 0 : Math.max(0, lastDrawLaunch + 110 - started);
  lastDrawLaunch = started + delay;
  const order = draw.order || 1;
  const hold = `translate(${-28 - (order - 1) * 24}px,${-22 - (order - 1) * 16}px) scale(.93) rotate(${-5 + (order - 1) * 9}deg)`;
  const motion = node.animate(reducedMotion.matches ? [{opacity:.7},{opacity:1}] : [
    { transform: 'translate(0,0) scale(1)', opacity:1 }, { transform: hold, opacity:1 },
  ], { duration: reducedMotion.matches ? 40 : 150, delay, easing:'ease-out', fill:'forwards' });
  const flight = { node, face, img, animations:[motion], motion, started, deadline:started + delay + 520 };
  cardFlights.add(flight);
  motion.finished.then(() => { flight.pickedUp = true;approachDrawFeedback(draw);landDrawFeedback(draw); }).catch(() => {});
  flight.waitTimer = setTimeout(() => { if (!flight.landing && cardFlights.has(flight)) node.classList.add('draw-flight-waiting'); }, 850);
  playSound('card');return flight;
}
function approachDrawFeedback(draw) {
  const flight = draw.flight;
  if (draw.intent.index >= 0 || draw.event || !flight || !cardFlights.has(flight) || reducedMotion.matches) return;
  const area = $("hand").getBoundingClientRect();
  if (!area.width) return;
  const from = getComputedStyle(flight.node).transform;
  const dx = (area.x + area.width / 2 - parseFloat(flight.node.style.left) - parseFloat(flight.node.style.width)/2) * .62;
  const dy = (area.y - parseFloat(flight.node.style.top) - parseFloat(flight.node.style.height)) * .62;
  flight.motion.cancel();
  flight.motion = flight.node.animate([{transform:from},{transform:`translate(${dx}px,${dy}px) scale(.9) rotate(-3deg)`}],
    {duration:220,easing:'ease-out',fill:'forwards'});
  flight.animations.push(flight.motion);
  flight.node.dataset.approaching = 'true';
}
function finishDrawPresentation(draw) {
  draw.landed = true;removeCardFlight(draw.flight);
  if (draw.settled || draw.cancelled) drawPresentations.delete(draw.id);
  if (game) renderHand();
}
async function landDrawFeedback(draw) {
  const flight = draw.flight, color = draw.event?.color || draw.intent.color;
  if (!flight || !color || !flight.pickedUp || flight.landing || flight.resolving || !cardFlights.has(flight)) return;
  flight.resolving = true;
  const reveal = draw.intent.index < 0;
  const image = reveal ? document.createElement('img') : flight.img;
  image.src = cardImageSource(color);image.dataset.cardColor = color;image.alt = '';
  if (reveal) { image.className = 'draw-flight-front';flight.face.appendChild(image); }
  // The real color is decoded before the flip, including a first-use color.
  try { await image.decode(); } catch { /* A failed asset keeps the normal alt/fallback behavior. */ }
  if (draw.cancelled || !cardFlights.has(flight)) return;
  flight.landing = true;flight.node.classList.remove('draw-flight-waiting');
  flight.node.dataset.revealedColor = color;
  renderHand();
  const area = $("hand").getBoundingClientRect();
  const targetCard = $("hand").querySelector(`.suit-${color}`);
  const targetMotion = targetCard?._layoutMotion;
  const targetTime = targetMotion?.currentTime;
  if (targetMotion) targetMotion.currentTime = 230;
  let target = targetCard?.getBoundingClientRect() || area;
  if (targetMotion) targetMotion.currentTime = targetTime;
  if (compactMedia.matches && (!target.width || target.left < area.left || target.right > area.right ||
      target.top < area.top || target.bottom > area.bottom)) target = $("handCount").getBoundingClientRect();
  const node = flight.node, style = getComputedStyle(node), from = style.transform;
  const width = parseFloat(node.style.width), height = parseFloat(node.style.height);
  const targetWidth = Math.min(width, target.width);
  const dx = target.x + target.width / 2 - parseFloat(node.style.left) - width / 2;
  const dy = target.y + target.height / 2 - parseFloat(node.style.top) - height / 2;
  const duration = reducedMotion.matches ? 100 : Math.max(reveal ? 190 : 160, flight.deadline - performance.now());
  flight.motion.cancel();
  const motion = node.animate(reducedMotion.matches ? [{opacity:1},{opacity:0}] : [
    { transform:from, opacity:1 },
    { transform:`translate(${dx}px,${dy}px) scale(${targetWidth / width})`, opacity:1 },
  ], {duration,easing:'cubic-bezier(.25,.6,.3,1)',fill:'forwards'});
  flight.motion = motion;flight.animations.push(motion);
  if (reveal) flight.animations.push(flight.face.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],
    {duration:reducedMotion.matches ? 0 : Math.min(180,duration),fill:'forwards'}));
  motion.finished.then(() => finishDrawPresentation(draw)).catch(() => {});
}
function revealPendingDraw(receipts) {
  const draws = new Map([...inflightDraws, ...drawPresentations]);
  for (const draw of draws.values()) {
    if (draw.event) continue;
    const receipt = receipts?.find(r => r.id === draw.id);
    const event = receipt ? game.events?.find(e => e.id === receipt.eventId && e.type === 'draw' && e.seat === seat) :
      receipts === undefined ? game.events?.find(e => e.type === 'draw' && e.seat === seat && e.id > draw.intent.eventFloor &&
        e.index === draw.intent.index && !handledDrawEvents.has(e.id)) : null;
    if (!event) continue;
    draw.event = event;handledDrawEvents.add(event.id);
    if (handledDrawEvents.size > 128) handledDrawEvents.delete(handledDrawEvents.values().next().value);
    if (!draw.cancelled) landDrawFeedback(draw);
    if (draw.landed && draw.settled) drawPresentations.delete(draw.id);
  }
}
function settleDrawRequest(id, rejected = false) {
  const draw = inflightDraws.get(id);if (!draw) return;
  inflightDraws.delete(id);draw.settled = true;
  if (rejected) {
    draw.cancelled = true;removeCardFlight(draw.flight);drawPresentations.delete(id);
    for (const child of drawPresentations.values()) if (child.command?.after === id || (child === queuedDraw && !child.command)) {
      child.cancelled = true;removeCardFlight(child.flight);drawPresentations.delete(child.id);
    }
  } else if (draw.landed || draw.cancelled) drawPresentations.delete(id);
  const requests = [...inflightDraws.values()];
  pendingDraw = requests[0] || null;queuedDraw = requests[1] || null;
  pendingAction = pendingDraw?.command || null;
  document.body.classList.toggle('is-confirming-action', !!pendingAction);
}
function confirmDrawFeedback(ack) {
  const first = inflightDraws.get(ack.id);if (!first) return;
  const queued = first === pendingDraw ? queuedDraw : null;
  const event = game.events?.find(e => e.id === ack.drawEventId && e.type === 'draw' && e.seat === seat);
  if (event && !first.event) { first.event = event;handledDrawEvents.add(event.id);landDrawFeedback(first); }
  const next = queued && DrawIntent.rebase(first.intent, queued.intent, game, ack.drawEventId);
  if (queued?.command) queued.intent = next || {...queued.intent, drawCount:first.intent.drawCount + 1,
    revision:first.intent.revision + 1, eventFloor:event?.id || queued.intent.eventFloor};
  settleDrawRequest(ack.id);
  if (queued && !queued.command) {
    if (next && !pendingAction && !marketRefresh && amIUp()) act('draw_train', {index:next.index}, queued);
    else { queued.cancelled = true;removeCardFlight(queued.flight);drawPresentations.delete(queued.id);toast(I18n.t('La mesa cambió. Elige tu segunda carta.')); }
  }
}
function cancelCardFlights(preservePending = false) {
  cancelDrawFeedback(preservePending);
  cancelMarketRefresh();
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers.clear(); observedDrawLaunch = observedDrawEnd = 0;
  for (const flight of [...cardFlights]) removeCardFlight(flight);
  cardFlights.clear();
}
function animateCardFlight(event, speed=1) {
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
    const img = document.createElement("img"); img.src = cardImageSource(suit); img.dataset.cardColor = suit;img.alt = ""; img.className = cls; face.appendChild(img);
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
    { transform: "translate(-28px,-22px) scale(.93) rotate(-5deg)", offset: .22, opacity: 1 },
    { transform: "translate(-28px,-22px) scale(.93) rotate(-5deg)", offset: .44, opacity: 1 },
    { transform: `translate(${dx}px,${dy}px) scale(${scale})`, opacity: own ? 1 : .2 },
  ], { duration: 680/speed, easing: "cubic-bezier(.22,.65,.28,1)", fill: "forwards" });
  const animations = [motion];
  if (reveal) animations.push(face.animate([
    { transform: "rotateY(0deg)" }, { transform: "rotateY(0deg)", offset: .18 },
    { transform: "rotateY(180deg)", offset: .65 }, { transform: "rotateY(180deg)" },
  ], { duration: 680/speed, fill: "forwards" }));
  const flight = { node, animations }; cardFlights.add(flight);
  const replayDraw=replayMode?drawPresentations.get(`replay:${event.id}`):null;
  if(replayDraw)replayDraw.flight=flight;
  motion.onfinish = () => {
    node.remove(); cardFlights.delete(flight);
    if(replayDraw){replayDraw.landed=true;drawPresentations.delete(replayDraw.id);renderHand();}
    const landing = document.querySelector(targetSelector);
    const pulseTarget = own ? landing?.querySelector(".cardcount") : landing;
    if (pulseTarget && !reducedMotion.matches) pulseTarget.animate([
      { transform: "scale(1)" }, { transform: "scale(1.15)", offset: .45 }, { transform: "scale(1)" },
    ], { duration: 180/speed });
  };
}
function constructionTarget(event) {
  return event.routeId !== undefined ? $("board").querySelector(`[data-route-id="${CSS.escape(String(event.routeId))}"]`) : $("board").querySelector(`[data-city="${CSS.escape(event.city)}"]`);
}
function animateConstruction(event, speed=1) {
  clearTableFocus();
  if (board3D) {
    const timing=GameTiming.construction,delay=reducedMotion.matches?0:timing.focusMs/speed,duration=reducedMotion.matches?0:timing.flightMs/speed;
    clearTimeout(constructionFocusTimer);
    if(reducedMotion.matches||document.hidden){constructionFocus=null;syncBoard3D();if(!document.hidden)playSound("build");return;}
    constructionFocus={...event,transitionMs:delay};syncBoard3D();
    const activeFocus=constructionFocus;
    const restore=()=>{
      if(constructionFocus!==activeFocus)return;
      constructionFocusTimer=null;constructionFocus=null;
      document.querySelectorAll('.construction-notice').forEach(n=>n.remove());
      syncBoard3D(timing.restoreMs/speed);
    };
    if(!board3D.animateConstruction(event,()=>{
      if(!document.hidden)playSound("build");
      if(constructionFocus===activeFocus)constructionFocusTimer=setTimeout(restore,timing.holdMs/speed);
    },{delay,duration,hideDuringDelay:true})){playSound("build");restore();return;}
    const target=constructionTarget(event)?.getBoundingClientRect(),area=$("mapscroll").getBoundingClientRect();
    if(target&&(target.right<area.left||target.left>area.right||target.bottom<area.top||target.top>area.bottom)){
      const notice=document.createElement('div');notice.className='construction-notice';notice.textContent=I18n.t('Construcción fuera de vista')+' · '+game.players[event.seat].name;$("mapscroll").append(notice);
    }
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
  clearTimeout(constructionFocusTimer);constructionFocus=null;document.querySelectorAll(".construction-notice").forEach(n=>n.remove());
  board3D?.cancelAnimations();
  for (const flight of constructionFlights.values()) {
    clearTimeout(flight.timer); flight.animations.forEach(a => a.cancel()); flight.band?.style.removeProperty("opacity");
  }
  constructionFlights.clear();
  syncBoard3D();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelCardFlights(true); cancelConstruction(); cancelTunnelMotion(); stopSounds(); } else { updateSharedTunnel(); if (game) renderMarket(); } });
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) cancelConstruction(); });
window.addEventListener("resize", () => { cancelCardFlights(true); cancelConstruction(); cancelTunnelMotion(); if (game) renderMarket(); });
reducedMotion.addEventListener("change", () => { cancelCardFlights(true); cancelConstruction(); cancelTunnelMotion(); if (game) renderMarket(); });
function layoutHand() {
  const cards = [...$("hand").querySelectorAll(".traincard")];
  if (!cards.length) return;
  if (compactHand.parentElement === $("compactHand")) { cards.forEach(card => { card.style.marginRight = "0"; }); return; }
  // Layout uses the untransformed width while the previous positions animate.
  const width = cards[0].offsetWidth;
  const available = $("hand").clientWidth - 12;
  const step = cards.length === 1 ? width : Math.min(width + 10, (available - width) / (cards.length - 1));
  cards.forEach((card, i) => { card.style.marginRight = i === cards.length - 1 ? "0" : `${step - width}px`; });
}
function renderDestinations() {
  const content = GameUI.destinationEntries(game, game.tickets).map(({ ticket: t }) => {
    const status = GameUI.destinationStatus(game, t.id);
    const hint = !status ? I18n.t("Progreso no disponible: el backend no envía este dato. Reinícialo al terminar la partida.") : status.completed ? status.viaStation ? I18n.t("Conectado usando una estación. Puntos al final de la partida.") : I18n.t("Conectado. Puntos al final de la partida.") : I18n.t("Destino pendiente");
    const number = GameUI.destinationNumber(game, t.id);
    return I18n.t`<button type="button" class="destination-row ${status?.completed ? "is-complete" : ""}" data-destination="${escapeHTML(t.id)}" title="${hint} · Ver en el mapa"><span class="ticket-number"><span class="sr-only">Destino </span>${number}</span><span class="destination-endpoints">${escapeHTML(cityName(t.a))} <span aria-hidden="true">→</span> ${escapeHTML(cityName(t.b))}</span><strong>${t.p}<span class="sr-only"> puntos</span></strong>${!status ? I18n.t('<span class="destination-unknown" aria-label="Progreso no disponible">?</span>') : status.completed ? I18n.t('<span class="destination-check" aria-label="Completado">✓</span>') : I18n.t('<span class="destination-pending" aria-label="Pendiente">·</span>')}</button>`;
  }).join("") || I18n.t('<p class="smallmuted">Elige tus billetes iniciales.</p>');
  // Keep the user's scroll position while bots act or a new card arrives.
  if ($("ticketList")._destinationHTML !== content) {
    const focus = document.activeElement.closest("#ticketList [data-destination]")?.dataset.destination;
    const top = $("ticketList").scrollTop;
    $("ticketList").innerHTML = content;
    $("ticketList")._destinationHTML = content;
    for (const row of $("ticketList").querySelectorAll("[data-destination]")) row.querySelector(".ticket-number").style.setProperty("--ticket-color", ticketColor(GameUI.destinationNumber(game, ticketIdFromDom(row.dataset.destination)) - 1));
    if (focus !== undefined) $("ticketList").querySelector(`[data-destination="${CSS.escape(String(focus))}"]`)?.focus({ preventScroll: true });
    $("ticketList").scrollTop = top;
  }
}
function playerScore(index) {
  return TableUI.publicScore(game, index);
}
function scoreBonus(index) {
  const bonus = !game.result && game.scoreProgress?.players[index]?.bonus;
  return bonus ? `<button type="button" class="live-bonus" title="${I18n.t('Ver el camino más largo')}" aria-label="${I18n.t`Ver camino más largo · +${bonus} puntos provisionales`}">★ +${bonus}</button>` : '';
}
function scoreExtras(index) {
  if(game.result||!game.scoreProgress)return '';
  const own=index===seat?game.scoreProgress.own:null;
  const badge=scoreBonus(index);
  if(!own)return badge;
  return `${badge}<details class="live-score-details"><summary>${I18n.t('Tu puntuación')}</summary><dl>
    <dt>${I18n.t('Construcción')}</dt><dd>${own.route}</dd><dt>${I18n.t('Destinos cumplidos · privados')}</dt><dd>+${own.completedPoints}</dd>
    <dt>${I18n.t('Camino más largo provisional')}</dt><dd>+${own.bonus}</dd>${own.closingBonus!==own.bonus?`<dt>${I18n.t('Bono al cerrar sin vías')}</dt><dd>+${own.closingBonus}</dd>`:''}<dt>${I18n.t('Destinos pendientes')}</dt><dd>−${own.pendingPoints}</dd>
    <dt>${I18n.t('Estaciones sin usar')}</dt><dd>+${own.stations}</dd><dt>${I18n.t('Si terminara ahora')}</dt><dd>${own.projected}</dd></dl></details>`;
}
function playerMetric(type, label, value) {
  const icons = {
    points: '<path d="M7 3h10v5a5 5 0 0 1-10 0ZM7 4H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 13v5m-4 2h8"/>',
    cards: '<rect x="8" y="5" width="12" height="16" rx="2"/><path d="M16 5V3H4v15h4m4-9h4m-4 4h4"/>',
    trains: '<rect x="3" y="4" width="18" height="11" rx="2"/><path d="M7 8h3m4 0h3M2 13h20"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    stations: '<path d="m2 9 10-7 10 7M5 8v13h14V8M9 21v-7h6v7M10 8h4"/>',
    tickets: '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4ZM9 5v14"/>',
  };
  return `<span class="player-metric${type === 'points' && String(value).length > 2 ? ' is-large-number' : ''}" data-metric="${type}" data-label="${I18n.t("Est.")}" title="${label}: ${value}" aria-label="${label}: ${value}">${type === "cards" ? '<img src="assets/cards/back.svg" alt="" aria-hidden="true">' : `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[type]}</svg>`}<strong aria-hidden="true">${value}</strong></span>`;
}
function plural(n, word) {
  return n + " " + I18n.t(word === "comodín" && n !== 1 ? "comodines" : word + (n === 1 ? "" : "s"));
}
function routeRequirementText(r) {
  const base = r.n - r.ferry;
  if (r.color === "gray") {
    if (r.ferry) return `${base ? plural(base, "carta") + I18n.t(" de un mismo color + ") : ""}${plural(r.ferry, "comodín")}`;
    return I18n.t`${plural(r.n, "carta")} de un mismo color`;
  }
  const colorName = N[r.color].toLowerCase();
  if (r.ferry) return `${base ? plural(base, "carta") + I18n.t(" de color ") + colorName + " + " : ""}${plural(r.ferry, "comodín")}`;
  return I18n.t`${plural(r.n, "carta")} de color ${colorName}`;
}
function routeSummaryText(r) {
  const tags = [];
  if (r.tunnel) tags.push(I18n.t("Túnel"));
  if (r.ferry) tags.push(I18n.t("Ferri"));
  return I18n.t`${cityName(r.a)} — ${cityName(r.b)} · ${plural(r.n, "espacio")}${tags.length ? " · " + tags.join(" · ") : ""} · Requiere ${routeRequirementText(r)}`;
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
  for (const d of boardMap.land) {
    el("path", { d, fill: "none", stroke: "#e5f0e8", "stroke-width": 5, opacity: 0.55 }, geography);
    el("path", { d, fill: "#eee6d2", stroke: "#a5b3a7", "stroke-width": 1.1, "stroke-linejoin": "round" }, geography);
    el("path", { d, fill: `url(#${prefix}-paper)` }, geography);
  }
  for (const d of boardMap.details)
    el("path", { d, fill: "none", stroke: "#c2b797", "stroke-width": 0.7, "stroke-dasharray": "2 3", opacity: 0.55 }, geography);
  for (const [x, y, name, size, rotation] of boardMap.seaLabels) el("text", {
    x, y, class: "sea-label", "font-size": size, "text-anchor": "middle",
    transform: `rotate(${rotation} ${x} ${y})`,
  }, geography).textContent = I18n.t(name);
  return defs;
}
function drawFerryGlyph(el, parent) {
  const g = el("g", { class: "ferry-mark", fill: "#405351", stroke: "#405351", "stroke-width": 0.3, "pointer-events": "none" }, parent);
  el("path", {
    d: "M-7 2V-2H-3V-4H0V-1H5L8 2ZM-6-3V-5H-3V-3Z",
  }, g);
  for (const x of [-4, 4]) el("circle", { cx: x, cy: 3, r: 1.5 }, g);
}
let tunnelFocusRoute = null;
function syncBoard3D(transitionMs = 0) {
  if (!board3D || !game) return;
  const requested = hoveredPlayer ?? focusedPlayer;
  const highlight = requested !== null && game.routes.some(r => r.owner === requested) ? requested : null;
  const tunnelRoute = game.sharedTunnel?.routeId ?? null;
  const tunnelChanged = tunnelRoute !== tunnelFocusRoute;
  tunnelFocusRoute = tunnelRoute;
  const active = constructionFocus || (tunnelRoute !== null ? { routeId: tunnelRoute } : null);
  if (tableFocus && (active || (tableFocus.player !== undefined &&
      JSON.stringify(game.scoreProgress?.players[tableFocus.player]?.longestRoutes) !== tableFocus.pathKey))) clearTableFocus();
  let spotlight = tableFocus ? { routes: tableFocus.routes, completedRoutes: tableFocus.routes, strength: 1 } : boardSpotlight;
  if (active) {
    const routes = new Set(spotlight?.routes || []), endpoints = new Set(spotlight?.endpoints || []);
    if (highlight !== null && !spotlight) {
      game.routes.filter(r => r.owner === highlight).forEach(r => routes.add(r.id));
      game.players[highlight].placed.forEach(city => endpoints.add(city));
    }
    if (active.routeId !== undefined) routes.add(active.routeId);
    if (active.city) endpoints.add(active.city);
    spotlight = { ...spotlight, routes: [...routes], endpoints: [...endpoints],
      activeRoutes: active.routeId === undefined ? [] : [active.routeId] };
  }
  const focus = document.activeElement.closest?.("#board [data-route-id]");
  const cityFocus = document.activeElement.closest?.("#board [data-city]");
  board3D.update({ routes: game.routes.map(({ id, owner, color, tunnel, ferry, a, b }) => ({ id, owner, color, tunnel, ferry, a, b })),
    players: game.players.map(p => ({ color: GameUI.playerColor(p.color), placed: [...p.placed] })),
    visualSeed: wagonSeed, hiddenRoute: null, highlight, spotlight,
    transitionMs: transitionMs || constructionFocus?.transitionMs || (tunnelChanged ?
      (tunnelRoute === null ? GameTiming.construction.restoreMs : GameTiming.construction.focusMs) : 0),
    selectedRoute: selected ?? (focus ? routeIdFromDom(focus.dataset.routeId) : null), selectedCity: stationCity ?? cityFocus?.dataset.city ?? null,
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
    const geometry = geometryFor(r.id);
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
  for (const [key, [x, y]] of Object.entries(boardMap.cities)) {
    const occupant = game.players.findIndex(p => p.placed.includes(key));
    const group = el("g", { transform: `translate(${x} ${y})`, class: "city-node", "data-city": key,
      role: "button", tabindex: 0, "aria-label": `${cityName(key)}${occupant >= 0 ? I18n.t` · Estación de ${game.players[occupant].name}` : I18n.t(" · Ver ciudad")}` });
    if (board3D) el("circle", { r: occupant >= 0 ? 16 : 8, fill: "transparent", "pointer-events": "all", class: "city-hit" }, group);
    el("circle", { r: 6.6, fill: "#fffdf1", opacity: 0.9 }, group);
    el("circle", {
      r: 4.4, fill: "#f9f4e6",
      stroke: stationCity === key ? "#bd6b38" : "#6b7972",
      "stroke-width": stationCity === key ? 2.3 : 1.3, class: "city-circle",
    }, group);
    el("title", {}, group).textContent = `${cityName(key)}${occupant >= 0 ? I18n.t` · Estación de ${game.players[occupant].name}` : ""}`;
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
  for (const key of Object.keys(boardMap.cities)) {
    const group = el("g", { "data-city-label": key }, names);
    el("line", { class: "city-leader", stroke: "#6e8078", "stroke-width": 0.8 }, group);
    el("text", { class: "city-label" }, group).textContent = cityName(key);
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
      const points = cities.map(key => boardMap.cities[key]);
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
    const key = g.dataset.cityLabel, [x, y] = screen(boardMap.cities[key]);
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
    const [x, y] = screen(boardMap.cities[city]), scale = Math.max(.8 / view.scale, 1);
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
  const placements = boardMap.placeLabels(displayed.map(relative), labelArea.width, labelArea.height, obstacles.map(relative), { height: 18 * labelScale, baseline },
    board3D ? { previous: labelPlacements3D, maxLeader: 36, hideColliding: true } : {});
  if (board3D) {
    const shown = new Set(placements.map(p => p.key));
    for (const entry of entries) if (!shown.has(entry.key)) groups.get(entry.key).style.display = "none";
  }
  for (const box of placements) {
    const g = groups.get(box.key), city = boardMap.cities[box.key], [sx, sy] = screen(city);
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
  const title = r ? `${cityName(r.a)} — ${cityName(r.b)}` : cityName(target.city);
  const detail = r ? `${routeRequirementText(r)}${r.tunnel ? I18n.t(" · Túnel") : ""}${r.ferry ? I18n.t(" · Ferri") : ""}`
    : stationsLeft > 0 ? I18n.t`Estación · ${plural(gameRules.stationCosts[gameRules.setup.stations - stationsLeft], "carta")} del mismo color` : I18n.t("Ya construiste todas tus estaciones");
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
  const usable = mapSafeArea($("mapscroll").getBoundingClientRect());
  menu.style.left = Math.max(usable.x, Math.min(x - stage.x + 12, usable.x + usable.width - menu.offsetWidth)) + "px";
  menu.style.top = Math.max(usable.y, Math.min(y - stage.y + 8, usable.y + usable.height - menu.offsetHeight)) + "px";
  event.currentTarget.classList.add("is-selected");
  menu.querySelector(".menu-close").onclick = () => { closeMapMenu(); sourceElement.focus({ preventScroll: true }); };
  if (!canBuild) { menu.querySelector(".menu-close").focus({ preventScroll: true }); return; }
  $("startBuild").onclick = () => {
    const result = GameUI.construction(game, seat, target, gameRules);
    if (result.reason) { toast(result.reason); return; }
    dialogReturnFocus = document.querySelector(r ? `[data-route-id="${CSS.escape(String(r.id))}"]` : `[data-city="${CSS.escape(target.city)}"]`);
    buildTarget = target;
    uiDialog = "build";
    closeMapMenu();
    showBuildDialog();
  };
  $("startBuild").focus({ preventScroll: true });
}
function showBuildDialog() {
  const result = GameUI.construction(game, seat, buildTarget, gameRules);
  if (result.reason) { closeOptionalDialog(); toast(result.reason); return; }
  const { route: r, options } = result;
  const groups = GameUI.paymentGroups(options);
  let group = groups[0], paymentIndex = 0;
  let chosen = group.options[0]; // Server-valid combinations, minimum wildcards first.
  showDialog(r ? I18n.t("Construir ruta") : I18n.t("Construir estación"),
    I18n.t`${dialogClockHTML()}<div class="build-content"><div class="build-summary"><strong>${escapeHTML(r ? routeName(r) : I18n.t`Estación en ${cityName(buildTarget.city)}`)}</strong>
    ${r ? I18n.t`<div class="build-track" aria-hidden="true">${'<i></i>'.repeat(r.n)}</div><span>${r.n} vagones · <b>+${gameRules.routePoints[r.n]} puntos</b>${r.tunnel ? I18n.t(" · Túnel") : r.ferry ? I18n.t(" · Ferri") : ""}</span>` : I18n.t`<span>Estación ${gameRules.setup.stations - game.players[seat].stations + 1} de ${gameRules.setup.stations} · ${plural(result.cost, "carta")}</span>`}</div>
    <h3 class="payment-heading">${r?.tunnel ? I18n.t("Cartas que reservas") : I18n.t("Pagarás")}</h3>
    <div id="paymentPreview" class="payment-preview build-payment" aria-live="polite"></div>
    ${options.length > 1 ? I18n.t`<details class="change-payment"><summary>Cambiar cartas</summary><div class="payment-controls">
      ${groups.length > 1 ? I18n.t`<fieldset class="payment-colors"><legend class="sr-only">Color de las cartas normales</legend><div class="payment-color-grid">${groups.map((g, i) => { const count = game.hand.filter(c => c === g.color).length, label = `${N[g.color]} · ${plural(count, "disponible")}`; return `<label class="payment-color" title="${escapeHTML(label)}"><input type="radio" name="buildColor" value="${g.color}" aria-label="${escapeHTML(label)}" ${i === 0 ? "checked" : ""}><img src="assets/cards/${g.color}.svg" alt="" draggable="false"><span class="payment-stock" aria-hidden="true">${count}</span></label>`; }).join("")}</div></fieldset>` : ""}
      <div class="payment-wilds"><div class="wild-stock"><span class="payment-stock-card"><img src="assets/cards/wild.svg" alt="" draggable="false"><span class="payment-stock" aria-hidden="true">${game.hand.filter(c => c === "wild").length}</span></span><strong id="wildLabel">Comodines<span class="sr-only"> · ${plural(game.hand.filter(c => c === "wild").length, "disponible")}</span></strong></div>
        <div class="wild-stepper" role="group" aria-labelledby="wildLabel" aria-describedby="wildHint"><button id="wildLess" type="button" aria-label="Usar un comodín menos">−</button><output id="wildCount" aria-label="Comodines a utilizar">${chosen.wild}</output><button id="wildMore" type="button" aria-label="Usar un comodín más">+</button></div>
      </div><p id="wildHint" class="wild-hint"></p>
    </div></details>` : ""}
    ${r?.tunnel ? "" : `<p class="build-note">${r?.ferry ? I18n.t`Comodines obligatorios para este ferry: ${r.ferry}.` : I18n.t("Pago sugerido: utiliza la menor cantidad posible de comodines.")}</p>`}
    </div>
    <div class="dialog-actions"><button id="confirmBuild" class="primary full">${r?.tunnel ? I18n.t("Revelar cartas del túnel") : I18n.t("Pagar y construir")}</button>
    <button id="cancelBuild" class="tertiary full">Cancelar</button></div>`, false, true);
  $("dialog").classList.add("build-dialog");
  if (r) $("dialog").querySelector(".build-track").style.setProperty("--track-color", C[r.color]);
  const updatePreview = () => {
    const preview = $("paymentPreview");
    preview.replaceChildren();
    preview.setAttribute("aria-label", I18n.t`${paymentDescription(chosen)} · ${result.cost} en total`);
    const symbol = value => { const node = document.createElement("span"); node.className = "payment-symbol"; node.textContent = value; node.setAttribute("aria-hidden", "true"); preview.appendChild(node); };
    if (chosen.regular) preview.appendChild(colorCard(chosen.color, chosen.regular));
    if (chosen.regular && chosen.wild) symbol("+");
    if (chosen.wild) preview.appendChild(colorCard("wild", chosen.wild));
    symbol("=");
    const total = document.createElement("strong"); total.className = "payment-sum";
    total.innerHTML = `${result.cost}<small>${I18n.t(result.cost === 1 ? "carta" : "cartas")}</small>`;
    preview.appendChild(total);
    if (preview.dataset.payment && !reducedMotion.matches) preview.animate([{opacity:.65, transform:"translateY(3px)"},{opacity:1, transform:"translateY(0)"}],{duration:160,easing:"ease-out"});
    preview.dataset.payment = `${chosen.color}/${chosen.wild}`;
    if ($("wildCount")) {
      $("wildCount").textContent = chosen.wild;
      $("wildLess").disabled = paymentIndex === 0;
      $("wildMore").disabled = paymentIndex === group.options.length - 1;
      const min = group.options[0].wild, max = group.options.at(-1).wild;
      $("wildHint").textContent = chosen.regular === 0 ? I18n.t("Solo comodines: no gastarás cartas de color.")
        : `${min === max ? I18n.t`Cantidad fija: ${min}` : I18n.t`Puedes usar de ${min} a ${max}`}.${r?.ferry ? I18n.t` Este ferry exige al menos ${r.ferry}.` : min ? I18n.t` Necesitas al menos ${min} para completar el pago.` : I18n.t(" Cada comodín sustituye una carta de color.")}`;
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
    const validation = GameUI.construction(game, seat, buildTarget, gameRules);
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
function canDrawDestinations() {
  return !!(amIUp() && !replayMode && !pendingAction && !game.drawCount && game.ticketDeckCount && !game.ticketOffer);
}
function confirmDestinationDraw() {
  if (!canDrawDestinations()) return;
  clearTableFocus(); setCompactPanel('map');
  uiDialog = 'draw-destinations'; dialogReturnFocus = $("drawtickets");
  const count = Math.min(game.ticketDeckCount, gameRules.destinations.offerCount ?? 3);
  const minimum = Math.min(count, gameRules.destinations.offerMinimum);
  showDialog(I18n.t('¿Robar nuevos destinos?'), `<img class="destination-confirm-art" src="assets/ticket.svg" alt=""><p>${I18n.t`Usarás este turno para recibir ${plural(count, "billete")}. Tendrás que conservar al menos ${minimum}.`}</p><div class="destination-confirm-actions"><button type="button" id="cancelDestinationDraw" class="secondary">${I18n.t('Cancelar')}</button><button type="button" id="confirmDestinationDraw" class="primary">${I18n.t('Robar destinos')}</button></div>`, false, true);
  $("dialog").classList.add('destination-confirm');
  $("cancelDestinationDraw").onclick = closeOptionalDialog;
  $("confirmDestinationDraw").onclick = () => {
    if (!canDrawDestinations()) { closeOptionalDialog(); return; }
    uiDialog = null; $("overlay").classList.add('hidden'); dialogReturnFocus = null;
    act('draw_tickets');
  };
}
$("drawtickets").onclick = confirmDestinationDraw;
$("pass").onclick = () => act("pass");
function showDialog(title, body, ticketDialog = false, dismissible = false) {
  disposeTicketMap();
  resultScrollCleanup?.(); resultScrollCleanup=null;ShellIcons.hideTooltip();
  resultMapCleanup?.(); resultMapCleanup = null;
  closeMapMenu();
  hoveredDestination = null;
  $("overlay").onpointerdown = null;
  $("overlay").classList.remove("hidden");
  $("dialog").classList.toggle("ticket-dialog", ticketDialog);
  $("dialog").classList.remove("tunnel-dialog", "results-dialog", "build-dialog", "destination-confirm");
  delete $("dialog").dataset.sharedTunnel;
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
  disposeTicketMap();
  const choosing = uiDialog === "tickets";
  const closingResults = uiDialog === "results";
  if (closingResults) { resultMapCleanup?.(); resultMapCleanup = null; resultScrollCleanup?.(); resultScrollCleanup=null;ShellIcons.hideTooltip(); }
  const returningToMap = uiDialog === "routes";
  uiDialog = buildTarget = null;
  buildSubmitting = false;
  if (!choosing) pendingChoiceKey = null;
  $("overlay").classList.add("hidden");
  hoveredDestination = null;
  if (returningToMap) setCompactPanel("map");
  const returnTarget = returningToMap && compactMedia.matches ? document.querySelector('[data-panel="destinations"]')
    : dialogReturnFocus?.isConnected ? dialogReturnFocus : $(closingResults ? "viewResults" : "viewRoutes");
  returnTarget.focus({ preventScroll: true });
  dialogReturnFocus = null;
  updateDestinationSpotlight();
}
function openRoutes(ticketId, source = $("viewRoutes")) {
  if (!game) return;
  clearTableFocus();
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
  if (row) openRoutes(ticketIdFromDom(row.dataset.destination), row);
};
for (const type of ["pointerover", "pointerout"]) $("ticketList").addEventListener(type, event => {
  // Touch browsers synthesize hover/focus around taps. Restored keyboard focus
  // should keep its outline without switching on a map preview.
  if (event.pointerType !== "mouse" || !matchMedia("(any-hover: hover)").matches || uiDialog) return;
  const row = event.target.closest("[data-destination]");
  if (!row || row.contains(event.relatedTarget)) return;
  const id = ticketIdFromDom(row.dataset.destination);
  if (type === "pointerover") hoveredDestination = id;
  if (type === "pointerout" && hoveredDestination === id) hoveredDestination = null;
  updateDestinationSpotlight();
});
function toggleDestinationHighlight() {
  if (!game?.tickets.length) return;
  clearTableFocus();
  allDestinationsVisible = !allDestinationsVisible;
  hoveredDestination = null;
  if (allDestinationsVisible) {
    resultMapSelection = null;
    $("resultContext").classList.add("hidden");
  }
  setCompactPanel("map");
  updateDestinationSpotlight();
  toast(I18n.t(allDestinationsVisible ? "Destinos resaltados" : "Resaltado desactivado"), 1800);
}
$("toggleDestinations").onclick = toggleDestinationHighlight;
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
  const badge = $("destinationProgress"), total=game?.tickets.length || 0;
  const completed=game?.tickets.filter(ticket=>GameUI.destinationStatus(game,ticket.id)?.completed).length || 0;
  badge.hidden=!total;badge.textContent=`${completed}/${total}`;
  badge.classList.toggle('is-complete',total>0&&completed===total);
  badge.parentElement.setAttribute('aria-label',I18n.t('Tus destinos')+`: ${completed}/${total}`);
  const toggle = $("toggleDestinations");
  toggle.disabled = !game?.tickets.length;
  toggle.setAttribute("aria-pressed", String(allDestinationsVisible && !toggle.disabled));
  toggle.title = toggle.disabled ? I18n.t("Conserva billetes para resaltar tus destinos") : allDestinationsVisible ? I18n.t("Ocultar mis destinos") : I18n.t("Resaltar mis destinos");
  if (!toggle.disabled) toggle.title += " (H)";
  for (const label of $("board").querySelectorAll("[data-city-label]")) label.style.removeProperty("opacity");
  let overlay = $("destinationSpotlight");
  if (!overlay) {
    overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.id = "destinationSpotlight"; overlay.setAttribute("aria-hidden", "true");
    $("mapscroll").appendChild(overlay);
  }
  const selection = !tableFocus &&
    GameUI.destinationSpotlightSelection(game, hoveredDestination, allDestinationsVisible, resultMapSelection);
  boardSpotlight = selection ? {
    routes: selection.routes || [], completedRoutes:selection.completedRoutes, stationRoutes: selection.stationRoutes || [],
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
    const [wx, wy] = boardMap.cities[key];
    const p = GameUI.endpointPosition({ x: (wx - view.x) / view.scale, y: (wy - view.y) / (view.scaleY || view.scale) }, safe);
    const marker = el("g", { class: "destination-beacon", "data-endpoint": key, "data-offscreen": p.outside });
    el("circle", { cx: p.x, cy: p.y, r: 13, fill: "#f9df8b", opacity: .2 }, marker);
    el("circle", { cx: p.x, cy: p.y, r: 8, fill: "#fff9df", stroke: "#e4bd59", "stroke-width": 2 }, marker);
    if (p.outside) el("path", { d: "M-2-3L2 0-2 3", fill: "none", stroke: "#24444e", "stroke-width": 1.7, transform: `translate(${p.x} ${p.y}) rotate(${p.angle})` }, marker);
    else el("circle", { cx: p.x, cy: p.y, r: 3.5, fill: "#24444e" }, marker);
    const label = el("text", { class: "destination-beacon-label" }, marker); label.textContent = cityName(key);
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
  for (const box of boardMap.placeLabels(endpoints, safe.width, safe.height, [], { height: badgeHeight + 18 * labelScale, baseline: badgeHeight + 14 * labelScale })) {
    const { label, marker, numbers } = labels.get(box.key);
    const x = safe.x + box.x + box.width / 2, y = safe.y + box.y;
    label.setAttribute("text-anchor", "middle"); label.setAttribute("x", x);
    label.setAttribute("y", y + badgeHeight + 14 * labelScale);
    drawDestinationBadges(el, marker, numbers, x, y);
  }
}
function renderTicketMap(tickets) {
  const container = $("ticketMap"); if (!container) return;
  if (ticketMapCameraKey !== pendingChoiceKey) {
    ticketMapCameraKey = pendingChoiceKey;
    ticketMapCamera = { zoom: 1, center: { ...MAP_CENTER } };
    ticketPlans.clear(); pinnedTicket = null;
  }
  const focus = hoveredTicket ?? pinnedTicket;
  const items = tickets.map((ticket, i) => ({ ticket, key: String(i), index: i,
    overview: ticketChoices.has(i) }));
  if (uiDialog !== "routes" && game.ticketOffer) game.tickets.forEach(ticket => {
    const key = `owned-${ticket.id}`;
    if (retainedVisible.has(ticket.id) || focus === key) items.push({ ticket, key, index: 0, overview: retainedVisible.has(ticket.id) });
  });
  const revision = JSON.stringify([game.routes.map(r => r.owner), game.players.map(p => p.placed), game.ticketProgress, game.ticketPaths]);
  let changed = false;
  for (const item of items) {
    const previous = ticketPlans.get(item.ticket.id);
    const plan = previous?.revision === revision ? previous : { ...DestinationPlanner.plan(game, seat, item.ticket, gameRules, previous), revision };
    if (previous && (previous.additional !== plan.additional || JSON.stringify(previous.routes) !== JSON.stringify(plan.routes))) changed = true;
    ticketPlans.set(item.ticket.id, plan); item.plan = plan;
    item.number = GameUI.destinationNumber(game, item.ticket.id, item.index); item.color = ticketColor(item.number - 1);
    const row = $("dialog").querySelector(`[data-ticket-id="${CSS.escape(String(item.ticket.id))}"]`);
    const status = row?.querySelector('.ticket-plan');
    if (status) status.textContent = plan.reachable ? I18n.t`${plan.additional} vagones adicionales` : I18n.t("Sin conexión disponible");
    row?.classList.toggle('is-preview', focus === item.key);
  }
  if (changed && $("ticketMapNotice")) $("ticketMapNotice").textContent = I18n.t("Recorrido actualizado");
  $("ticketMapOverview").hidden = focus === null;
  const shadeButton = $("ticketMapShade");
  if (shadeButton) shadeButton.textContent = I18n.t(ticketMapShaded ? "Quitar sombra" : "Activar sombra");
  if (!ticketMapView) {
    if (ticketMapLoadingNode === container || container.dataset.failed) return;
    ticketMapLoadingNode = container;
    import('./ticket-map.js').then(({ createTicketMap }) => {
      if (ticketMapLoadingNode !== container || !container.isConnected) return;
      const preview = key => {
        if (hoveredTicket === key && pinnedTicket === null) return;
        hoveredTicket = key; pinnedTicket = null; updateTicketSelection(tickets, 0);
      };
      ticketMapView = createTicketMap({ container, map: boardMap, network: MAP_GEOMETRY, camera: ticketMapCamera,
        onPreview: preview, onSelect: key => { pinnedTicket = pinnedTicket === key ? null : key; hoveredTicket = null; updateTicketSelection(tickets, 0); },
        onFailure: ticketMapFailure });
      $("ticketMapLoading")?.remove(); renderTicketMap(tickets);
    }).catch(ticketMapFailure);
    return;
  }
  ticketMapView.update({ items, focus, overviewStrength: .5,
    shadingEnabled: uiDialog === "routes" ? undefined : ticketMapShaded,
    seat, cityName, changed, visualSeed: wagonSeed, routeColors: C,
    routes: game.routes.map(({ id, owner, a, b, color, tunnel, ferry }) => ({ id, owner, a, b, color, tunnel, ferry })),
    players: game.players.map(p => ({ color: GameUI.playerColor(p.color), wagon: p.wagon, placed: p.placed })) });
}
function ticketMapFailure() {
  disposeTicketMap();
  if ($("ticketMap")) $("ticketMap").dataset.failed = "true";
  const status = $("ticketMapNotice"); if (status) status.textContent = I18n.t("No pudimos cargar el tablero 3D. Prueba a reintentarlo o recarga la página.");
  const retry = $("ticketMapRetry"); if (retry) retry.hidden = false;
}
function updateTicketSelection(tickets, min) {
  const reserve = $("ticketTrainReserve");
  if (reserve && game.players[seat]) reserve.innerHTML = I18n.t`<strong>${game.players[seat].trains}</strong> vagones disponibles`;
  min = Number($("dialog").dataset.ticketMinimum ?? min);
  const count = ticketChoices.size;
  $("ticketCount").textContent = min ? I18n.t`${count} de ${tickets.length} seleccionados · mínimo ${min}` : I18n.t`${count} de ${tickets.length} resaltados en el mapa`;
  if ($("keep")) $("keep").disabled = count < min || !!game.sharedTunnel;
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.classList.toggle("is-selected", ticketChoices.has(i));
    row.classList.toggle("is-preview", (hoveredTicket ?? pinnedTicket) === String(i));
  }
  for (const row of $("dialog").querySelectorAll("[data-ticket-id]")) {
    const status = GameUI.destinationStatus(game, ticketIdFromDom(row.dataset.ticketId));
    row.classList.toggle("is-complete", !!status?.completed);
    row.querySelector(".ticket-complete").textContent = status?.completed ? I18n.t`✓ Completada${status.viaStation ? I18n.t(" · estación") : ""}` : "";
    const key = row.dataset.ownedTicket === undefined ? row.dataset.ticketIndex : `owned-${row.dataset.ownedTicket}`;
    row.classList.toggle('is-preview', (hoveredTicket ?? pinnedTicket) === key);
  }
  // Owned tickets may complete while this dialog is open. Reorder their rows,
  // never the offered tickets or their submitted indexes, and preserve focus.
  const reorder = (container, owned) => {
    if (!container) return;
    const rows = GameUI.destinationEntries(game, owned).map(({ ticket }) => container.querySelector(`[data-ticket-id="${CSS.escape(String(ticket.id))}"]`));
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
  key = String(key);
  // Touch can leave synthesized hover and focus behind after a tap. Neither
  // should override the checkbox. Keyboard focus remains a CSS-only outline.
  row.addEventListener("pointerenter", event => {
    if (event.pointerType !== "mouse" || !matchMedia("(any-hover: hover)").matches) return;
    hoveredTicket = key; pinnedTicket = null;
    updateTicketSelection(tickets, min);
  });
  row.addEventListener("pointerleave", event => {
    if (event.pointerType !== "mouse" || (hoveredTicket !== key && pinnedTicket !== key)) return;
    hoveredTicket = pinnedTicket = null;
    updateTicketSelection(tickets, min);
  });
  row.addEventListener("pointerdown", event => {
    row.dataset.pointerType = event.pointerType;
    if (event.pointerType === "mouse" || hoveredTicket === null) return;
    hoveredTicket = null;
    updateTicketSelection(tickets, min);
  });
  row.addEventListener("keydown", () => { delete row.dataset.pointerType; });
}
function showTicketDialog(tickets, min, viewing = false) {
  const choosing = !viewing && !!game.ticketOffer;
  const draftKey = `rr-choice-${room}-${seat}-${choosing ? game.ticketOffer.id : "initial-" + tickets.map(t => t.id).join("-")}`;
  const waiting = choosing && game.turnWaiting && game.current === seat;
  const key = JSON.stringify([room, seat, viewing ? "view" : choosing ? game.ticketOffer.id : "initial", tickets.map(t => t.id)]);
  if (pendingChoiceKey === key && $("ticketMap") && $("dialog").dataset.waiting === String(waiting) && !$("overlay").classList.contains("hidden")) { updateTicketSelection(tickets, min); return; }
  if (pendingChoiceKey !== key) {
    ticketMapShaded = true;
    ticketChoices = new Set(viewing ? tickets.map((_, i) => i) : []);
    retainedVisible = new Set(choosing ? game.tickets.map(t => t.id) : []);
    if (!viewing) {
      try { const draft = JSON.parse(localStorage.getItem(draftKey)); if (Array.isArray(draft)) ticketChoices = new Set(draft.filter(i => Number.isInteger(i) && tickets[i])); } catch (_) {}
    }
    pendingChoiceKey = key;
  }
  hoveredTicket = null;
  showDialog(
    viewing ? I18n.t("Tus rutas de destino") : game.phase === "initial" ? I18n.t("Elige tus billetes iniciales") : I18n.t("Nuevos billetes de destino"),
    I18n.t`${viewing ? `<p class="ticket-intro">${I18n.t("Toca un destino para resaltarlo.")}</p>` : ""}
    ${!viewing ? `<div class="ticket-deadline" data-countdown><strong data-clock="${choosing ? "offer" : "initial"}" data-clock-format="timer"></strong>${choosing && !waiting ? I18n.t('<button type="button" id="minimizeTickets">Ver mapa</button>') : ""}</div>` : ""}
    ${game.phase !== "initial" && game.players[seat] ? '<p id="ticketTrainReserve" class="ticket-train-reserve" role="status" aria-live="polite"></p>' : ''}
    <div class="ticket-layout">
      <figure class="ticket-map-panel">
        <div id="ticketMap" tabindex="0" role="region" aria-label="Mapa de destinos. Arrastra, pellizca o usa las flechas y los signos más y menos.">
          <div class="ticket-map-controls"><button type="button" id="ticketZoomIn" aria-label="Acercar mapa">+</button><button type="button" id="ticketZoomOut" aria-label="Alejar mapa">−</button><button type="button" id="ticketZoomReset" aria-label="Restablecer mapa">⌖</button>${!viewing ? '<button type="button" id="ticketMapShade" aria-controls="ticketMap"></button>' : ""}<button type="button" id="ticketMapOverview" hidden>Ver todos</button></div>
          <span id="ticketMapLoading" class="ticket-map-loading">Preparando el tablero…</span>
        </div>
        <div class="ticket-map-footer"><span id="ticketMapNotice" role="status"></span><button type="button" id="ticketMapRetry" hidden>Reintentar</button></div>
      </figure>
      <div class="ticket-options">
        <p class="ticket-options-title">${viewing ? I18n.t("Tus destinos") : I18n.t("Billetes para conservar")}</p>
        ${!viewing ? `<p class="ticket-options-hint">${I18n.t("Elige los billetes que conservarás.")}</p>` : ""}
        <div class="ticket-collections"><div class="ticket-choices">${tickets.map((t, i) => I18n.t`
          <label class="choice ticket-choice" data-ticket-index="${i}" data-ticket-id="${escapeHTML(t.id)}">
            <input type="checkbox" class="keep ${viewing ? 'visibility-eye' : ''}" aria-label="${escapeHTML(viewing ? I18n.t`Resaltar ${cityName(t.a)} a ${cityName(t.b)}` : I18n.t`Conservar ${cityName(t.a)} a ${cityName(t.b)}`)}" value="${i}" ${ticketChoices.has(i) ? "checked" : ""}>
            <span class="ticket-number"><span class="sr-only">Destino </span>${GameUI.destinationNumber(game, t.id, i)}</span>
            <span class="ticket-choice-text ticket-inspect"><b>${escapeHTML(cityName(t.a))} → ${escapeHTML(cityName(t.b))}</b><small class="ticket-points">${t.p} ${I18n.t("pts")}</small><small class="ticket-complete"></small>${game.phase !== "initial" ? '<small class="ticket-plan"></small>' : ''}</span>
          </label>`).join("") || I18n.t('<p>Todavía no has conservado billetes.</p>')}</div>
        ${choosing && game.tickets.length ? I18n.t`<div class="retained-heading">Tus destinos actuales <small>Solo comparar</small></div><div class="retained-choices">${game.tickets.map(t => I18n.t`<label class="retained-choice" data-ticket-id="${escapeHTML(t.id)}" data-owned-ticket="${escapeHTML(t.id)}"><input class="ticket-eye visibility-eye" type="checkbox" ${retainedVisible.has(t.id) ? "checked" : ""} aria-label="Resaltar ${escapeHTML(cityName(t.a))} a ${escapeHTML(cityName(t.b))}"><span class="ticket-number"><span class="sr-only">Destino </span>${GameUI.destinationNumber(game, t.id)}</span><span class="ticket-choice-text ticket-inspect"><b>${escapeHTML(cityName(t.a))} → ${escapeHTML(cityName(t.b))}</b><small class="ticket-points">${t.p} ${I18n.t("pts")}</small><small class="ticket-complete"></small><small class="ticket-plan"></small></span></label>`).join("")}</div>` : ""}</div>
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
  $("dialog").dataset.ticketMinimum = String(min);
  $("ticketZoomIn").onclick = () => ticketMapView?.zoom(1);
  $("ticketZoomOut").onclick = () => ticketMapView?.zoom(-1);
  $("ticketZoomReset").onclick = () => ticketMapView?.reset();
  if ($("ticketMapShade")) $("ticketMapShade").onclick = () => { ticketMapShaded = !ticketMapShaded; renderTicketMap(tickets); };
  $("ticketMapOverview").onclick = () => { pinnedTicket = hoveredTicket = null; updateTicketSelection(tickets, min); };
  $("ticketMapRetry").onclick = () => { $("ticketMapRetry").hidden = true; delete $("ticketMap").dataset.failed; renderTicketMap(tickets); };
  $("overlay").onpointerdown = event => {
    if (!$("ticketMap") || event.target.closest('.ticket-choice, .retained-choice, [data-preview-key], #ticketMapOverview, #ticketMapShade')) return;
    if (hoveredTicket === null && pinnedTicket === null) return;
    hoveredTicket = pinnedTicket = null;
    updateTicketSelection(tickets, min);
  };
  for (const row of $("dialog").querySelectorAll(".ticket-choice")) {
    const i = +row.dataset.ticketIndex;
    row.style.setProperty("--ticket-color", ticketColor(GameUI.destinationNumber(game, tickets[i].id, i) - 1));
    row.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) ticketChoices.add(i);
      else ticketChoices.delete(i);
      hoveredTicket = null;
      pinnedTicket = e.target.checked && row.dataset.pointerType === 'touch' ? String(i) : null;
      if (!viewing) { localStorage.setItem(draftKey, JSON.stringify([...ticketChoices])); playSound(e.target.checked ? "pen" : "pen-undo"); }
      updateTicketSelection(tickets, min);
    });
    bindTicketPreview(row, i, tickets, min);
  }
  for (const row of $("dialog").querySelectorAll("[data-owned-ticket]")) {
    const id = ticketIdFromDom(row.dataset.ownedTicket), key = `owned-${id}`, button = row.querySelector(".ticket-eye");
    row.style.setProperty("--ticket-color", ticketColor(GameUI.destinationNumber(game, id) - 1));
    row.classList.toggle("is-highlighted", button.checked);
    button.onchange = () => {
      button.checked ? retainedVisible.add(id) : retainedVisible.delete(id);
      hoveredTicket = null; pinnedTicket = button.checked && row.dataset.pointerType === 'touch' ? key : null;
      row.classList.toggle("is-highlighted", button.checked); updateTicketSelection(tickets, min);
    };
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
  if (game.sharedTunnel) {
    if (isTunnelBuilder()) { showSharedTunnel(); return; }
    if ($("dialog").classList.contains("tunnel-dialog")) { cancelTunnelReveal(); $("overlay").classList.add("hidden"); }
  }
  const myTurn = game.current === seat;
  if (myTurn && game.turnWaiting && game.ticketOffer) { uiDialog = "tickets"; showTicketDialog(game.ticketOffer.tickets, Math.min(game.ticketOffer.tickets.length, gameRules.destinations.offerMinimum)); return; }
  if (game.phase === "finished" && !constructionBusy() && (!resultsSeen || uiDialog === "results")) { showResults(); return; }
  const mandatory = (game.phase === "initial" && game.initial?.length) || isTunnelBuilder();
  if (mandatory && uiDialog) { uiDialog = null; pendingChoiceKey = null; }
  if (uiDialog === "routes") { showTicketDialog(game.tickets, 0, true); return; }
  if (uiDialog === "tickets" && game.ticketOffer) { showTicketDialog(game.ticketOffer.tickets, Math.min(game.ticketOffer.tickets.length, gameRules.destinations.offerMinimum)); return; }
  if (uiDialog === 'draw-destinations') {
    if (!canDrawDestinations()) closeOptionalDialog();
    return;
  }
  if (uiDialog === "build") return;
  if (!game.ticketOffer && (!myTurn || game.phase !== "initial")) pendingChoiceKey = null;
  if (game.phase === "initial" && game.initial?.length) {
    showTicketDialog(game.initial, Math.min(game.initial.length, gameRules.destinations.initialMinimum));
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
    if (game.tunnel && isTunnelBuilder()) showTunnelDialog();
    else $("overlay").classList.add("hidden");
    return;
  }
  $("overlay").classList.add("hidden");
}

const cityName = city => matchContext?.cityName(city) || city;
const routeName = route => `${cityName(route.a)} — ${cityName(route.b)}`;
const signedPoints = points => points >= 0 ? `+${points}` : `−${Math.abs(points)}`;
function resultCategories(result) {
  return [["routes", I18n.t("Rutas"), result.route], ["destinations", I18n.t("Destinos"), result.destination],
    ["stations", I18n.t("Estaciones"), result.stations], ["express", I18n.t("Camino más largo"), result.express]];
}
function resultRowHTML(result, index) {
  const open = expandedResults.has(result.seat), view = resultView(result.seat);
  return `<tbody data-result-player="${result.seat}" data-score-seat="${result.seat}">
    <tr class="result-summary"><th scope="row"><div class="result-player-controls"><button type="button" class="result-social" data-player-profile="${result.seat}" aria-label="${I18n.t("Ver perfil")}: ${escapeHTML(result.name)}" title="${escapeHTML(members[result.seat]?.displayName||result.name)}">${playerAvatar(result.seat)}</button><button type="button" class="result-heading" aria-expanded="${open}" aria-controls="score-detail-${result.seat}">
      <span class="result-player-name" title="${escapeHTML(result.name)}">${index + 1}. ${escapeHTML(result.name)} ${result.winner ? '<span aria-label="'+I18n.t("Ganador")+'">🏆</span>' : ""}</span></button></div></th><td class="score-total">${result.score}</td>
      ${resultCategories(result).map(([key, label, points]) => `<td><button type="button" id="score-tab-${result.seat}-${key}" data-score-category="${key}" aria-pressed="${open && view.category === key}" aria-expanded="${open && view.category === key}" aria-controls="score-panel-${result.seat}" aria-label="${escapeHTML(result.name)}: ${label}, ${signedPoints(points)}" class="score-cell${points < 0 ? " is-negative" : ""}">${signedPoints(points)}</button></td>`).join("")}
      </tr>
    <tr class="result-detail" id="score-detail-${result.seat}" ${open ? "" : "hidden"}><td colspan="6"><div class="score-breakdown"><div id="score-panel-${result.seat}" class="score-panel" role="region" aria-labelledby="score-tab-${result.seat}-${view.category}"></div></div></td></tr>
  </tbody>`;
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
  if (!resultsSeen) expandedResults.clear();
  uiDialog = "results"; resultsSeen = true;
  hoveredDestination = null;
  showDialog(game.earlyFinish ? I18n.t("Prueba terminada anticipadamente") : I18n.t("Fin de partida"),
    I18n.t`<div class="results-scroll">${game.earlyFinish ? I18n.t('<p class="score-preview-note">Estado actual · Solo billetes conservados</p>') : ""}
    <div class="results-table-scroll"><table class="results-table"><caption class="sr-only">Puntuación final por jugador</caption>
    <thead><tr><th scope="col">Jugador</th>${['trophy','routes','ticket','station','express'].map(icon=>`<th scope="col">${ShellIcons.scoreHeader(icon)}</th>`).join('')}</tr></thead>
    ${game.result.map(resultRowHTML).join("")}</table></div>
    </div>
    <div class="result-actions"><button id="exploreMap" class="primary">Explorar mapa</button>${practiceMode ? I18n.t('<button id="practiceHome" class="tertiary">Volver al inicio</button>') : I18n.t('<button id="rematch" class="tertiary">Revancha</button><button id="multiplayerHome" class="tertiary">Volver al inicio</button>')}</div>`, false, true);
  $("dialog").classList.add("results-dialog");
  ShellIcons.mount($("dialog"));
  resultScrollCleanup?.();resultScrollCleanup=ShellIcons.scrollTrack($("dialog").querySelector('.results-table-scroll'));
  $("dialog")._resultSignature = signature;
  const heading = document.createElement("div"); heading.className = "results-header";
  $("dialog").prepend(heading); heading.append($("dialogTitle"), $("dialog").querySelector(".dialog-close"));
  $("dialog").querySelector(".results-scroll").append($("errorMsg"));
  for (const card of $("dialog").querySelectorAll("[data-result-player]")) applyPlayerAppearance(card, game.players[+card.dataset.resultPlayer].color);
  for (const row of $("dialog").querySelectorAll("[data-score-seat]")) {
    const playerSeat = +row.dataset.scoreSeat, result = game.result.find(r => r.seat === playerSeat);
    const tabs = [...row.querySelectorAll("[data-score-category]")];
    const select = (category, toggle = false) => {
      const open = !(toggle && expandedResults.has(playerSeat));
      const view = resultView(playerSeat);
      if (view.category !== category) { view.category = category; view.index = null; }
      resultMapCleanup?.(); resultMapCleanup = null; expandedResults.clear();
      for (const other of $("dialog").querySelectorAll("[data-score-seat]")) {
        const active = other === row && open;
        other.querySelector(".result-detail").hidden = !active;
        other.querySelector(".result-heading").setAttribute("aria-expanded", String(active));
        other.querySelector(".score-panel").replaceChildren();
        for (const button of other.querySelectorAll("[data-score-category]")) {
          const selected = active && button.dataset.scoreCategory === category;
          button.setAttribute("aria-pressed", String(selected));
          button.setAttribute("aria-expanded", String(selected));
        }
      }
      if (open) { expandedResults.add(playerSeat); renderResultPanel(result); }
    };
    row.querySelector(".result-heading").onclick = () => select(resultView(playerSeat).category, true);
    for (const tab of tabs) {
      tab.onclick = () => select(tab.dataset.scoreCategory);
      tab.onkeydown = event => {
        const index = tabs.indexOf(tab), target = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (target !== null) { event.preventDefault(); tabs[target].focus(); tabs[target].click(); }
      };
    }
    if (expandedResults.has(playerSeat)) renderResultPanel(result);
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
  const points = [...selection.routes.flatMap(id => geometryFor(id)?.points || []), ...selection.endpoints.map(id => boardMap.cities[id])];
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
    const route = game.routes.find(r => r.id === id), geometry = geometryFor(id);
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
    const [a, b] = selection.endpoints.map(id => boardMap.cities[id]);
    el("path", { d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, fill: "none", stroke: "#ae6455", "stroke-width": 2, "stroke-dasharray": "5 6", "data-incomplete-destination": true }, world);
  }
  const cityKeys = new Set([...selection.endpoints, ...selection.routes.flatMap(id => {
    const r = game.routes.find(r => r.id === id); return r ? [r.a, r.b] : [];
  })]);
  const junctions = new Set([...cityKeys].filter(city => selection.routes.filter(id => {
    const route = game.routes.find(r => r.id === id); return route && [route.a, route.b].includes(city);
  }).length !== 2));
  for (const city of cityKeys) {
    const [x, y] = boardMap.cities[city];
    el("circle", { cx: x, cy: y, r: 4, fill: "#fffaf0", stroke: "#657d7c", "stroke-width": 1.3 }, world);
  }
  for (const station of selection.stations) {
    const [x, y] = boardMap.cities[station.city];
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
      const p = screen(...boardMap.cities[city]); if (!onScreen(p)) continue;
      const text = el("text", { class: "score-city-name", "pointer-events": "none" }, labels); text.textContent = cityName(city);
      entries.push({ key: `city-${city}`, ...p, width: text.getComputedTextLength() + 4 });
      nodes.set(`city-${city}`, { node: text, p });
    }
    for (const badge of selection.badges) {
      const geometry = geometryFor(badge.routeId), point = boardMap.pointAt(geometry, geometry.length / 2), p = screen(...point);
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
    for (const place of boardMap.placeLabels(entries, width, height, [], { height: 22, baseline: 16 })) {
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
    payment.wild ? plural(payment.wild, "comodín") : ""].filter(Boolean).join(" + ");
}
function paymentIcons(payment) {
  return [[payment.color, payment.regular], ["wild", payment.wild]].filter(([, n]) => n).map(([color, n]) =>
    `<span class="payment-chip"><img src="assets/cards/${color}.svg" alt="${N[color]}" draggable="false"><strong>×${n}</strong></span>`).join('<span class="payment-plus" aria-hidden="true">+</span>');
}
// Presentation follows the server's shared stages; no client can skip the room clock.
function syncTunnelBoard() {
  const t = game?.sharedTunnel;
  const notice = $("tunnelBoardNotice");
  notice.hidden = !t || !$("overlay").classList.contains("hidden");
  if (!t) { board3D?.setTunnelCards(null, cardArtwork); return; }
  if (!notice.hidden) {
    const rect = $("mapscroll").getBoundingClientRect(), safe = mapSafeArea(rect);
    notice.style.left = `${rect.left + safe.x + safe.width / 2}px`;
    notice.style.top = `${rect.top + safe.y + 8}px`;
  }
  const now = replayAt ?? Date.now() + serverOffset;
  const shown = t.stage === "reveal" ? Math.max(0, Math.min(t.revealed.length, Math.floor((now - t.startedAt) / t.cardMs))) : t.revealed.length;
  const surcharge = t.revealed.slice(0, shown).filter(c => tunnelCardMatch(c, t.paymentColor)).length;
  const text = t.stage === "result" ? I18n.t(t.outcome === "built" ? "Túnel construido" : "Túnel no construido")
    : I18n.t`${game.players[t.seat].name} · ${shown} de ${t.revealed.length} cartas · Suplemento: ${surcharge}`;
  $("tunnelBoardStatus").textContent = text;
  board3D?.setTunnelCards({ id: t.id, routeId: t.routeId, animate: !reducedMotion.matches && t.stage === "reveal",
    cards: t.revealed.map((color, i) => ({ color: i < shown ? color : null, match: i < shown && tunnelCardMatch(color, t.paymentColor), age: now - t.startedAt - (i + 1) * t.cardMs })) }, cardArtwork);
}
cardArtworkReady.then(() => { if (game) syncTunnelBoard(); });
function prepareTunnelReveal() {
  if (!game.sharedTunnel) cancelTunnelReveal();
  else if (uiDialog === "build") { uiDialog = buildTarget = null; buildSubmitting = false; }
}
function isTunnelBuilder() {
  return !replayMode && game?.phase === "tunnel" && game.current === seat &&
    !members[seat]?.bot && !members[seat]?.autopilot;
}
function syncTunnelMask() { syncBoard3D(); syncTunnelBoard(); }
function cancelTunnelMotion() {
  for (const animation of tunnelReveal?.animations || []) animation.cancel();
  for (const node of tunnelReveal?.flights || []) node.remove();
  if (tunnelReveal) { tunnelReveal.animations = []; tunnelReveal.flights = []; }
}
function cancelTunnelReveal() { cancelTunnelMotion(); tunnelReveal = null; }
function tunnelCardMatch(color, paymentColor) { return color === "wild" || (paymentColor !== "wild" && color === paymentColor); }
function tunnelSteps(stage) {
  const active = { reveal: 1, decision: 2, result: 3 }[stage];
  return `<ol class="tunnel-steps" aria-label="${I18n.t("Progreso del túnel")}">${["Reserva", "Revelación", "Decisión", "Resultado"].map((label, i) => `<li class="${i < active ? "is-done" : i === active ? "is-current" : ""}" ${i === active ? 'aria-current="step"' : ""}><span>${i < active ? "✓" : i + 1}</span>${I18n.t(label)}</li>`).join("")}</ol>`;
}
function tunnelEvidence(t) {
  return `<section class="tunnel-evidence"><h3>${I18n.t("Cartas reveladas")}</h3>
    <div id="tunnelSequence" class="tunnel-sequence">${t.revealed.map((_, i) => I18n.t`<div class="tunnel-reveal" data-reveal-slot="${i}"><img class="tunnel-card-back" src="assets/cards/back.svg" alt="Carta ${i + 1} sin revelar"><span class="reveal-effect">${i + 1}</span></div>`).join("")}</div>
    <p id="tunnelRevealStatus" class="tunnel-total" role="status"></p></section>`;
}
function tunnelPaymentBlock(label, payment, kind, hint = "") {
  const count = payment ? payment.regular + payment.wild : null;
  const description = count === null ? hint : count ? paymentDescription(payment) : I18n.t("0 cartas");
  return `<section class="tunnel-payment-block" data-tunnel-payment="${kind}"><h3>${label}</h3>
    <div class="payment-icons" aria-label="${escapeHTML(description)}">${count ? paymentIcons(payment) : `<strong class="tunnel-payment-empty">${count === null ? "…" : "0"}</strong>`}</div>
    <small>${escapeHTML(count === null ? hint : count === 1 ? I18n.t("1 carta") : I18n.t`${count} cartas`)}</small></section>`;
}
function tunnelLedger(t, extra = null) {
  const result = t.stage === "result", declined = result && t.outcome !== "built";
  const zero = { color: t.paymentColor, regular: 0, wild: 0 };
  if (result) extra = declined ? zero : t.extra;
  const total = declined ? zero : t.base && extra ? { color: t.paymentColor, regular: t.base.regular + extra.regular, wild: t.base.wild + extra.wild } : null;
  return `<div class="tunnel-ledger${declined ? " is-returned" : ""}">
    ${tunnelPaymentBlock(I18n.t(declined ? "Base recuperada" : result ? "Base pagada" : "Base reservada"), t.base, "base")}
    <span class="tunnel-math" aria-hidden="true">${declined ? "↩" : "+"}</span>
    ${tunnelPaymentBlock(I18n.t(declined ? "Extra no cobrado" : result ? "Extra pagado" : "Extra"), extra, "extra", t.stage === "reveal" ? I18n.t("Por revelar") : result ? I18n.t("Sin desglose guardado") : I18n.t`${t.surcharge} por elegir`)}
    <span class="tunnel-math" aria-hidden="true">${declined ? "·" : "="}</span>
    ${tunnelPaymentBlock(I18n.t(declined ? "Total gastado" : result ? "Total pagado" : "Total al construir"), total, "total", I18n.t("Pendiente"))}
    </div>`;
}
function tunnelOutcome(t, route) {
  const built = t.outcome === "built", mine = t.seat === seat;
  const caption = built ? I18n.t`+${gameRules.routePoints[route.n]} puntos · ${route.n} vagones` : t.reason === "timeout" ? I18n.t("Tiempo agotado · Túnel no construido") : I18n.t("Intento cancelado · Túnel no construido");
  return `<div class="tunnel-outcome ${built ? "is-built" : "is-declined"}">
    <div class="tunnel-track" aria-hidden="true">${Array.from({length:route.n}, () => '<i></i>').join("")}<b class="tunnel-outcome-mark">${built ? "✓" : "×"}</b></div>
    <p role="status">${caption}</p>
    ${built ? "" : `<div class="tunnel-return-target"><span>${escapeHTML(mine ? I18n.t("Tu mano") : I18n.t`Mano de ${game.players[t.seat].name}`)}</span><div class="payment-icons">${t.base ? paymentIcons(t.base) : ""}</div><strong>${I18n.t(mine ? "Conservas tus cartas" : "Conserva sus cartas")}</strong></div>`}
    </div>`;
}
function startTunnelPresentation(t) {
  cancelTunnelReveal();
  const key = `${t.id}-${t.stage}`;
  $("dialog").classList.add("tunnel-dialog");
  $("dialog").dataset.sharedTunnel = key;
  $("dialog").scrollTop = 0;
  $("dialog").querySelector('.tunnel-outcome')?.style.setProperty('--builder-color', GameUI.playerColor(game.players[t.seat].color));
  tunnelReveal = { key, shown: 0, animations: [], flights: [] };
  updateSharedTunnel();
  if (t.stage === "result") animateTunnelResult(t);
}
function showSharedTunnel() {
  const t = game.sharedTunnel;
  if (!t || !isTunnelBuilder()) return;
  if (t.stage === "decision") { showTunnelDialog(); return; }
  const key = `${t.id}-${t.stage}`;
  if ($("dialog").dataset.sharedTunnel === key && tunnelReveal?.key === key) { updateSharedTunnel(); return; }
  const result = t.stage === "result";
  const title = result ? (t.outcome === "built" ? I18n.t("Túnel construido") : I18n.t("Túnel no construido")) : I18n.t("Comprobando el túnel…");
  const name = game.players[t.seat].name, route = game.routes.find(r => r.id === t.routeId);
  showDialog(title, `<p class="tunnel-route">${escapeHTML(name)} · ${escapeHTML(routeName(route))}</p>
    ${tunnelSteps(t.stage)}${result ? "" : tunnelEvidence(t)}
    <div id="tunnelTotal">${tunnelLedger(t)}</div>
    ${result ? tunnelOutcome(t, route) : ""}`);
  startTunnelPresentation(t);
}
function updateSharedTunnel() {
  const t = game?.sharedTunnel, sequence = tunnelReveal;
  if (!t || !sequence || $("dialog").dataset.sharedTunnel !== sequence.key || t.stage === "result") return;
  const now = replayAt ?? Date.now() + serverOffset;
  const count = t.stage === "reveal" ? Math.max(0, Math.min(t.revealed.length, Math.floor((now - t.startedAt) / t.cardMs))) : t.revealed.length;
  while (sequence.shown < count) {
    const i = sequence.shown++, slot = $("tunnelSequence")?.querySelector(`[data-reveal-slot="${i}"]`);
    if (!slot) continue;
    slot.replaceChildren(colorCard(t.revealed[i], null));
    const match = tunnelCardMatch(t.revealed[i], t.paymentColor);
    slot.classList.toggle("is-match", match);
    const effect = document.createElement("span"); effect.className = "reveal-effect"; effect.textContent = match ? "+1" : "—"; slot.append(effect);
    if (t.stage === "reveal" && !reducedMotion.matches && !document.hidden && count === sequence.shown) {
      sequence.animations.push(slot.animate([{ transform: "translateY(-16px) rotateY(-85deg)", opacity: .4 }, { transform: "translateY(0) rotateY(0)", opacity: 1 }], { duration: 500, easing: "ease-in-out" }));
      playSound("card");
    }
  }
  const status = $("tunnelRevealStatus");
  const surcharge = t.revealed.slice(0, count).filter(c => tunnelCardMatch(c, t.paymentColor)).length;
  if (status) status.textContent = t.stage === "decision" ? (t.seat === seat ? t.surcharge === 1 ? I18n.t("1 carta adicional") : I18n.t`${t.surcharge} cartas adicionales` : I18n.t`${game.players[t.seat].name} está decidiendo.`)
    : I18n.t`${count} de ${t.revealed.length} reveladas · Suplemento: ${surcharge}`;
  if (t.stage === "reveal") {
    const extra = $("dialog").querySelector('[data-tunnel-payment="extra"] .tunnel-payment-empty');
    if (extra && extra.textContent !== `+${surcharge}`) {
      extra.textContent = `+${surcharge}`;
      if (!reducedMotion.matches && !document.hidden) sequence.animations.push(extra.animate([{transform:"scale(1.2)"},{transform:"scale(1)"}],{duration:220}));
    }
  }
}
function animateTunnelResult(t) {
  // Seek into the server's result window on reconnect; never restart its clock.
  const elapsed = Date.now() + serverOffset - t.resultStartedAt;
  if (!Number.isFinite(elapsed) || elapsed >= t.until - t.resultStartedAt || reducedMotion.matches || document.hidden || sock?.readyState !== WebSocket.OPEN) return;
  const sequence = tunnelReveal, built = t.outcome === "built";
  const animate = (node, frames, delay, duration) => {
    if (!node || elapsed >= delay + duration) return null;
    const motion = node.animate(frames, {delay, duration, easing:"cubic-bezier(.2,.7,.25,1)", fill:"backwards"});
    motion.currentTime = Math.max(0, elapsed); sequence.animations.push(motion); return motion;
  };
  const target = $("dialog").querySelector(built ? '[data-tunnel-payment="total"] .payment-icons' : '.tunnel-return-target .payment-icons');
  const destination = target?.getBoundingClientRect();
  if (destination?.width) for (const kind of built ? ["base", "extra"] : ["base"]) {
    $("dialog").querySelectorAll(`[data-tunnel-payment="${kind}"] .payment-chip`).forEach((chip, i) => {
      const delay = (kind === "extra" ? 580 : 120) + i * 100, duration = 650;
      if (elapsed >= delay + duration) return;
      const from = chip.getBoundingClientRect(), clone = chip.cloneNode(true);
      clone.classList.add("tunnel-flight"); clone.setAttribute("aria-hidden", "true");
      Object.assign(clone.style, {left:from.x+"px",top:from.y+"px",width:from.width+"px",height:from.height+"px"});
      document.body.appendChild(clone); sequence.flights.push(clone);
      const dx = destination.x + (destination.width-from.width)/2 - from.x, dy = destination.y - from.y;
      const motion = animate(clone, [{transform:"translate(0,0) scale(1)",opacity:0,offset:0}, {transform:"translate(0,-8px) scale(1.08)",opacity:1,offset:.15}, {transform:`translate(${dx}px,${dy}px) scale(.8)`,opacity:0,offset:1}], delay, duration);
      if (motion) motion.onfinish = () => clone.remove(); else clone.remove();
    });
  }
  $("dialog").querySelectorAll('.tunnel-track i').forEach((wagon, i) => animate(wagon,
    built ? [{transform:"translateY(-18px) scale(.8)",opacity:0},{transform:"translateY(0) scale(1)",opacity:1}]
      : [{transform:"translateY(0)",opacity:1},{transform:"translateY(7px)",opacity:.25},{transform:"translateY(0)",opacity:1}],
    built ? 1200 + i * 80 : 550 + i * 60, 380));
  animate($("dialog").querySelector('.tunnel-outcome-mark'), [{transform:"scale(.4)",opacity:0},{transform:"scale(1)",opacity:1}], built ? 1700 : 1050, 380);
  animate(target, [{opacity:.3},{opacity:1}], built ? 1100 : 750, 400);
}
function showTunnelDialog() {
  if (!game?.tunnel || !isTunnelBuilder()) return;
  const t = game.tunnel, shared = { ...game.sharedTunnel, base: t.base }, route = game.routes.find(r => r.id === t.routeId);
  const key = JSON.stringify([t.revealId, t.routeId, t.revealed, game.hand]);
  if ($("dialog").dataset.tunnelDecision === key && !$("overlay").classList.contains("hidden")) return;
  const options = GameUI.tunnelPayments(game.hand, t);
  const count = t.surcharge;
  showDialog(I18n.t`Túnel: ${count} carta${count === 1 ? "" : "s"} adicional${count === 1 ? "" : "es"}`,
    `${dialogClockHTML()}<p class="tunnel-route">${escapeHTML(routeName(route))}</p>
    ${tunnelSteps("decision")}${tunnelEvidence(shared)}
    <div id="tunnelTotal" aria-live="polite"></div>
    <fieldset class="tunnel-payments"><legend>${options.length > 1 ? I18n.t("¿Cómo pagas el suplemento?") : ""}</legend>
      ${options.length > 1 ? `<div class="tunnel-options">${options.map((option, i) => `<label class="tunnel-option"><input type="radio" name="tunnelPayment" value="${option.wild}" ${i === 0 ? "checked" : ""}><span><span class="payment-icons">${paymentIcons(option)}</span><span class="payment-label">${paymentDescription(option)}</span></span></label>`).join("")}</div>`
        : options.length ? "" : `<p class="tunnel-insufficient">${GameUI.tunnelShortfall(game.hand, t) === 1 ? I18n.t("Te falta 1 carta para completar este túnel.") : I18n.t`Te faltan ${GameUI.tunnelShortfall(game.hand, t)} cartas para completar este túnel.`}</p>`}
    </fieldset>
    <div class="dialog-actions"><button class="primary full" id="acceptTunnel" ${options.length ? "" : "disabled"}>${I18n.t("Pagar suplemento y construir")}</button>
    <button class="tertiary full" id="declineTunnel">${I18n.t("Desistir del túnel")}</button></div>`);
  $("dialog").dataset.tunnelDecision = key;
  const chosen = () => options.length === 1 ? options[0]
    : options.find(option => option.wild === +document.querySelector('input[name="tunnelPayment"]:checked')?.value);
  const total = () => { $("tunnelTotal").innerHTML = tunnelLedger(shared, chosen()); };
  document.querySelectorAll('input[name="tunnelPayment"]').forEach(input => input.addEventListener("change", total));
  total(); startTunnelPresentation(shared);
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
// Phones retain the compact table, including landscape. Tablets and desktops
// keep the permanent sidebar and hand/destination dock. Keep table.css in sync.
const compactMedia = matchMedia("(max-width: 699px), (max-width: 1100px) and (max-height: 600px)");
let compactPanel = "map", compactPlayer = null, compactHistoryTop = 0;
const compactSections = {
  destinations: [document.querySelector(".dockdestinations")],
  history: [document.querySelector(".history-panel")],
  rules: [$("tableRulesContent")], chat: [$("tableChat")], hand: [$("tableHandDetail")],
};
const compactHand = document.querySelector(".dockmain"), compactPlayers = document.querySelector(".players-panel"), turnBanner = $("turnBanner");
let announcedTurn = null, tablePanelTrigger = null, historyCamera = null;
const marketPanel = document.querySelector(".game .sidepanel");
const tableHomes = new Map([
  marketPanel, compactHand, compactPlayers, turnBanner,
  $("drawtickets"), $("toggleDestinations"), $("expandboard"),
  ...Object.values(compactSections).flat(),
].map(node => {
  const anchor = document.createComment("table-control-home");
  node.before(anchor);
  return [node, anchor];
}));
try { $("compactPlayers").classList.toggle('is-expanded', localStorage.getItem('rr-table-player-details') === 'true'); } catch {}
function syncCompactControls() {
  $("compactHud").hidden = $("compactPlayers").hidden = !compactMedia.matches;
  $("compactPractice").classList.toggle("hidden", !practiceMode);
}
function syncTableLayout() {
  const historyTop = $("history").scrollTop, ticketTop = $("ticketList").scrollTop;
  const focus = document.activeElement;
  for (const [node, anchor] of tableHomes) if (node.previousSibling !== anchor) anchor.after(node);
  if (compactMedia.matches) {
    $("compactMarket").append(marketPanel);
    $("compactHand").append(compactHand);
    $("compactPlayers").append(compactPlayers);
    $("tableMapTools").prepend($("drawtickets"));
    $("tableMapTools").prepend($("toggleDestinations"));
    document.querySelector('.game-menu').append($("expandboard"));
  }
  setCompactPanel();
  $("history").scrollTop = historyTop;
  $("ticketList").scrollTop = ticketTop;
  if (focus?.isConnected && focus.getClientRects().length) focus.focus({preventScroll:true});
  layoutHand();
}
function setCompactPanel(next = compactPanel) {
  if (next === "cards") next = "map"; // The market is always on the table.
  if (!compactMedia.matches && ["history", "destinations"].includes(next)) next = "map";
  if (next !== "map" && !compactSections[next]) return;
  if (next !== "map") clearTableFocus();
  syncCompactControls();
  hoveredDestination = null;
  const followHistory = historyFollowing;
  if ($("history").clientHeight) compactHistoryTop = $("history").scrollTop;
  compactPanel = next;
  for (const [section, nodes] of Object.entries(compactSections)) for (const node of nodes) {
    if (!compactMedia.matches && ["history", "destinations"].includes(section)) {
      const anchor = tableHomes.get(node);
      if (node.previousSibling !== anchor) anchor.after(node);
    } else if (node.parentElement !== $("tablePanelHome")) $("tablePanelHome").append(node);
  }
  const open = next !== "map";
  if (open) $("tablePanelContent").append(...compactSections[next]);
  $("compactPanel").classList.toggle("hidden", !open);
  $("tablePanelTitle").textContent = { destinations: I18n.t("Tus destinos"), history: I18n.t("Historial"), rules: I18n.t("Puntos y final de partida"), chat: I18n.t("Chat próximamente"), hand: I18n.t("Tu mano") }[next] || "";
  $("game").dataset.compactPanel = next;
  for (const button of document.querySelectorAll("[data-panel]")) {
    button.setAttribute("aria-pressed", String(button.dataset.panel === next));
    button.setAttribute("aria-expanded", String(button.dataset.panel === next));
  }
  $("practiceControls").classList.remove("is-open");
  $("compactPractice").setAttribute("aria-expanded", "false");
  compactPlayer = null;
  updateCompactPlayer();
  closeMapMenu();
  if (game) {
    if (next === "rules") renderTableRules();
    if (next === "hand") renderTableHand();
    updateCompactStatus();
    // Panels overlay the stage. Do not reset or refit its camera.
    updateDestinationSpotlight();
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
  const activeBadge = $("scores").querySelector(`[data-player="${game.current}"]`);
  const hasTurn = activeBadge && ["play", "tunnel"].includes(game.phase);
  turnBanner.classList.toggle("is-global", compactMedia.matches && !hasTurn);
  (compactMedia.matches ? hasTurn ? activeBadge : $("compactPlayers") : $("game")).append(turnBanner);
  turnBanner.setAttribute('aria-label', [state.title, state.hint].filter(Boolean).join(' · '));
  $("compactClock").dataset.clock = state.clock || "";
  $("compactClock").classList.toggle("hidden", !state.clock);
  const key = `${room}-${seat}-${game.turnSerial}`;
  if (state.mine && announcedTurn !== key) {
    announcedTurn = key;
    if (!reducedMotion.matches) turnBanner.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.25)", offset: .3 }, { filter: "brightness(1)" }], { duration: 1100 });
  }
  const reminder = GameUI.needsSecondDraw(game, seat, 'map', controlled);
  $("compactMarket").classList.toggle("needs-draw", reminder);
  $("drawstats").textContent = reminder ? I18n.t('Roba una carta más') : amIUp() ? `${game.drawCount}/${gameRules.trainCards.drawsPerTurn}` : '';
  $("compactPlayers").style.setProperty("--player-count", game.players.length);
  $("compactPlayers").dataset.count = game.players.length;
  $("playerDetailsToggle").setAttribute('aria-expanded', String($("compactPlayers").classList.contains('is-expanded')));
  for (const badge of $("scores").children) {
    const player = game.players[Number(badge.dataset.player)];
    badge.querySelector('[data-metric="trains"]')?.classList.toggle('is-low', !!player && player.trains <= (gameRules.finalTrainThreshold ?? 2));
  }
}
function updateCompactPlayer() {
  const player = game?.players[compactPlayer], detail = $("compactPlayerDetail");
  detail.classList.toggle("hidden", !player);
  if (player) detail.querySelector("span").innerHTML = `<strong>${escapeHTML(player.name)}${compactPlayer === seat ? I18n.t(' · Tú') : ''}</strong>${members[compactPlayer]?.autopilot ? `<small>${I18n.t('Bot de reemplazo')}</small>` : ''}<dl class="player-detail-stats"><dt>${I18n.t(game.result ? 'Puntuación final' : 'Puntos de construcción')}</dt><dd>${playerScore(compactPlayer)}</dd><dt>${I18n.t('Cartas en mano')}</dt><dd>${displayedHandCount(compactPlayer) ?? '—'}</dd><dt>${I18n.t('Vagones disponibles')}</dt><dd>${player.trains}</dd><dt>${I18n.t('Estaciones disponibles')}</dt><dd>${player.stations}</dd><dt>${I18n.t('Destinos')}</dt><dd>${player.ticketsCount ?? '—'}</dd><dt>${I18n.t('Camino más largo')}</dt><dd>${game.scoreProgress?.players[compactPlayer]?.longest ?? '—'} ${I18n.t('vagones')}</dd></dl>`;
  let scores=detail.querySelector('.compact-score-detail');
  if(!scores){scores=document.createElement('div');scores.className='compact-score-detail';detail.append(scores);}
  const open=scores.querySelector('details')?.open;
  scores.innerHTML=player?scoreExtras(compactPlayer):'';
  scores.querySelector('.live-bonus')?.remove();
  if (player && game.scoreProgress?.players[compactPlayer]?.bonus) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'player-detail-longest';
    button.textContent = I18n.t('Ver el camino más largo') + ` · +${game.scoreProgress.players[compactPlayer].bonus}`;
    button.disabled = !game.scoreProgress.players[compactPlayer].longestRoutes?.length;
    button.onclick = () => { const player = compactPlayer; compactPlayer = null; updateCompactPlayer(); focusLongestPath(player); }; scores.prepend(button);
  }
  if(open&&scores.querySelector('details'))scores.querySelector('details').open=true;
}
$("compactPlayerDetail").querySelector("button").onclick = () => { compactPlayer = null; updateCompactPlayer(); clearTableFocus(); };
for (const button of document.querySelectorAll("[data-panel]")) button.onclick = () => {
  tablePanelTrigger = button; setCompactPanel(compactPanel === button.dataset.panel ? "map" : button.dataset.panel);
};
$("closeTablePanel").onclick = () => { setCompactPanel("map"); tablePanelTrigger?.focus({preventScroll:true}); };
$("playerDetailsToggle").onclick = () => {
  const expanded = $("compactPlayers").classList.toggle('is-expanded');
  $("playerDetailsToggle").setAttribute('aria-expanded', String(expanded));
  try { localStorage.setItem('rr-table-player-details', String(expanded)); } catch {}
};
$("hand").setAttribute('role','button'); $("hand").tabIndex = 0;
$("hand").setAttribute('aria-haspopup','true'); $("hand").setAttribute('aria-controls','compactPanel');
$("hand").onclick = () => { tablePanelTrigger = $("hand"); setCompactPanel(compactPanel === 'hand' ? 'map' : 'hand'); };
$("hand").addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $("hand").click(); } });
function clearTableFocus(restore = true) {
  clearTimeout(tableFocusTimer); tableFocusTimer = null;
  const previous = tableFocus; tableFocus = null;
  if (previous?.routeId !== undefined) board3D?.cancelConstruction(previous.routeId);
  if (restore && historyCamera) { zoom = historyCamera.zoom; mapCenter = {...historyCamera.center}; }
  historyCamera = null; $("returnMapView").classList.add('hidden');
  if (previous) { labelPriority = []; applyZoom(); }
}
function fitTableRoutes(ids) {
  const points = ids.flatMap(id => geometryFor(id)?.points || []); if (!points.length) return;
  const xs = points.map(p=>p[0]), ys = points.map(p=>p[1]), view = mapViewSize();
  const safe = mapSafeArea($("mapscroll").getBoundingClientRect(), true), baseScale = view.scale * zoom;
  mapCenter = {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
  zoom = Math.max(1, Math.min(3.5, baseScale * safe.width / (Math.max(...xs)-Math.min(...xs)+100),
    baseScale * safe.height / ((Math.max(...ys)-Math.min(...ys)) * Math.cos(BoardCamera.tilt) + 100)));
  labelPriority = [...new Set(game.routes.filter(r=>ids.includes(r.id)).flatMap(r=>[r.a,r.b]))];
  applyZoom(); $("returnMapView").classList.remove('hidden');
}
function focusLongestPath(player) {
  const progress = game.scoreProgress?.players[player];
  if (!progress?.longestRoutes?.length || constructionFocus || constructionBusy() || game.sharedTunnel) return;
  clearTableFocus(); historyCamera = {zoom,center:{...mapCenter}};
  tableFocus = {routes:progress.longestRoutes,player,pathKey:JSON.stringify(progress.longestRoutes)};
  fitTableRoutes(tableFocus.routes); syncBoard3D(180);
}
$("resetMapView").onclick = () => { clearTableFocus(false); zoom = 1; mapCenter = {...MAP_CENTER}; setCompactPanel('map'); applyZoom(); };
$("returnMapView").onclick = () => { clearTableFocus(); compactPlayer = null; updateCompactPlayer(); };
$("mapscroll").addEventListener('pointerdown', () => { if (tableFocus) clearTableFocus(false); }, {capture:true});
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTableFocus(); });
function focusHistoryRoute(id) {
  const route = game?.routes.find(r=>r.id===id); if (!route || !geometryFor(id) || constructionFocus || constructionBusy() || game.sharedTunnel) return;
  clearTableFocus(); setCompactPanel('map'); historyCamera = {zoom,center:{...mapCenter}};
  tableFocus = {routes:[id],routeId:id}; const focus = tableFocus;
  fitTableRoutes([id]); syncBoard3D(180);
  const finish = () => { if (tableFocus === focus) tableFocusTimer = setTimeout(()=>clearTableFocus(),1100); };
  if (reducedMotion.matches || route.owner === null || !board3D?.animateConstruction({routeId:id},finish,{delay:180,duration:1100,liftFirst:true})) finish();
}
function renderTableRules() {
  const rules = TableUI.rulesSummary(gameRules);
  const icon = type => playerMetric(type,'','').match(/<svg[\s\S]*?<\/svg>/)?.[0] || '';
  const score = (type,title,value,note='') => `<div class="rules-score">${icon(type)}<span>${I18n.t(title)}</span><strong>${value}</strong>${note ? `<small>${I18n.t(note)}</small>`:''}</div>`;
  $("tableRulesContent").innerHTML = `<div class="rules-ending"><strong>${rules.threshold ?? '—'}</strong><div><b>${I18n.t`${rules.threshold ?? '—'} vagones o menos`}</b><p>${I18n.t('Al terminar ese turno comienza la última ronda. Todos juegan un turno adicional, incluido quien la activó.')}</p></div></div><table><caption>${I18n.t('Puntos por longitud de ruta')}</caption><tbody><tr><th scope="row">${I18n.t('Vagones')}</th>${rules.routes.map(r=>`<td>${r.length}</td>`).join('')}</tr><tr><th scope="row">${I18n.t('Puntos')}</th>${rules.routes.map(r=>`<td><strong>${r.points}</strong></td>`).join('')}</tr></tbody></table><div class="rules-scoring">${score('points','Camino más largo', rules.longest === null ? '—' : '+'+rules.longest,'Provisional durante la partida. Los empatados reciben el bono al finalizar.')}${score('stations','Estación sin construir',rules.station === null ? '—' : '+'+rules.station)}${score('tickets','Destino completado','+'+I18n.t('valor'))}${score('tickets','Destino pendiente','−'+I18n.t('valor'))}</div>`;
}
function renderTableHand() {
  $("tableHandDetail").replaceChildren(...[...$("hand").querySelectorAll('.traincard')].map(card=>card.cloneNode(true)));
}
function updateHistoryUnread() {
  $("historyLatest").textContent = historyUnreadCount ? I18n.t`${historyUnreadCount} jugada(s) nueva(s) ↓` : I18n.t('Nuevos ↓');
}
function noteNewHistoryRows(ids) {
  if (!historyFollowing || !$("history").clientHeight) historyUnreadCount += TableUI.newHistoryRows(displayedLogs, ids);
  updateHistoryUnread();
}
$("compactPractice").onclick = () => {
  const open = $("practiceControls").classList.toggle("is-open");
  $("compactPractice").setAttribute("aria-expanded", String(open));
};
compactMedia.addEventListener("change", syncTableLayout);
syncTableLayout();

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
  if (!compactMedia.matches) {
    const sidebar = $("gameSidebar").getBoundingClientRect(), dock = $("handdock").getBoundingClientRect();
    const banner = turnBanner.getBoundingClientRect();
    return TableUI.cameraArea({width:rect.width,height:rect.height}, {
      top: Math.max(8, $("boardStatusActions").getBoundingClientRect().bottom - rect.top + 8),
      bottom: Math.min(dock.top, banner.top) - rect.top - 8,
      left: 8, right: Math.max(8, rect.right - sidebar.left + 8), forCamera,
    });
  }
  const panel = $("compactPanel").getBoundingClientRect(), hud = $("compactHud").getBoundingClientRect();
  const players = $("compactPlayers").getBoundingClientRect();
  return TableUI.cameraArea({width:rect.width,height:rect.height}, {
    top: Math.max($("boardStatusActions").getBoundingClientRect().bottom, players.bottom) - rect.top + 8,
    bottom: hud.top - rect.top - 8,
    left: Math.max(8, document.querySelector('.table-tools-left').getBoundingClientRect().left - rect.left),
    right: Math.max(8, rect.right - $("tableMapTools").getBoundingClientRect().right), forCamera,
    panel: $("compactPanel").classList.contains('hidden') ? null : {top:panel.top-rect.top-8},
  });
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
  const dismissedPanel = compactPanel !== "map";
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
  if (compactPanel !== "map") setCompactPanel("map");
  if (!suppressMapClick || event.detail === 0) return;
  suppressMapClick = false;
  event.preventDefault();
  event.stopPropagation();
}, true);
const cameraResize = new ResizeObserver(() => { closeMapMenu(); applyZoom(); layoutHand(); if (game && $("ticketMap") && !$("overlay").classList.contains("hidden")) renderTicketMap(uiDialog === "routes" ? game.tickets : game.ticketOffer?.tickets || game.initial || []); });
for (const id of ["mapscroll", "gameSidebar", "handdock", "turnBanner", "compactPanel", "compactHud", "compactPlayers", "boardtools", "boardStatusActions"]) cameraResize.observe($(id));
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
function closeGameMenu(restoreFocus = false) {
  const menu = $("sessionControls");
  if (!menu.open) return;
  menu.open = false;
  if (restoreFocus) menu.querySelector("summary").focus();
}
document.addEventListener("pointerdown", event => {
  if (!event.target.closest("#sessionControls")) closeGameMenu();
});
document.addEventListener("focusin", event => {
  if (!event.target.closest("#sessionControls")) closeGameMenu();
});
$("sessionControls").addEventListener("click", event => {
  if (event.target.closest("button")) closeGameMenu(!document.querySelector("dialog[open]"));
});
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("dialog[open]")) return;
  if (e.key === "Escape") {
    if ($("sessionControls").open) { e.preventDefault(); closeGameMenu(true); }
    else if (game?.sharedTunnel && !$("overlay").classList.contains("hidden") && $("dialog").classList.contains("tunnel-dialog")) { e.preventDefault(); }
    else if (uiDialog) { e.preventDefault(); closeOptionalDialog(); }
    else if (compactPlayer !== null) { e.preventDefault(); compactPlayer = null; updateCompactPlayer(); clearTableFocus(); }
    else if (tableFocus) { e.preventDefault(); clearTableFocus(); }
    else if (compactPanel !== 'map') { e.preventDefault(); $("closeTablePanel").click(); }
    else if (!$("mapMenu").classList.contains("hidden")) {
      e.preventDefault(); closeMapMenu();
      const selector = stationCity ? `[data-city="${CSS.escape(stationCity)}"]` : `[data-route-id="${CSS.escape(String(selected))}"]`;
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
globalThis.TrencitosMobile?.attach({
  resume() {
    if (sessionReplaced) return;
    // Reopen even an apparently live socket: the OS may have suspended it.
    // onclose already restores the room and resends pending commands safely.
    if (sock && sock.readyState < WebSocket.CLOSING) sock.close();
    else if (!sock || sock.readyState === WebSocket.CLOSED) connect();
  },
  back() {
    const dialog = document.querySelector("dialog[open]");
    if (dialog) {
      if (typeof dialog.requestClose === "function") dialog.requestClose();
      else if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
      return true;
    }
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    window.dispatchEvent(escape);
    // Mandatory game choices stay open; Back never abandons a player's seat.
    return escape.defaultPrevented || !$("overlay").classList.contains("hidden");
  },
}).catch(error => console.error("No se pudo conectar con el ciclo móvil:", error));

setInterval(() => {
  if (sock?.readyState === WebSocket.OPEN && room) send({ type: "ping" });
}, 180000);
if (desiredRoom && localStorage.getItem(identityKey(desiredRoom))) {
  attempted = true;
}
initializeHome();
account = AccountUI.create({
  sessionChanged:syncRecoveryControls,
  targetRoom:()=>desiredRoom,
  selection:()=>({nickname:$("nickname").value,displayName:$("nickname").value,username:publicUsername,color:preferredColor,secondaryColor,avatar:selectedAvatar}),
  currentSeat:()=>room?{code:room,token,practice:practiceMode}:null,
  applyProfile(profile) {
    $("nickname").value=profile.displayName??profile.nickname??""; preferredColor=profile.color; secondaryColor=profile.secondaryColor||null;selectedAvatar=profile.avatar||"person";publicUsername=profile.username||null;
    localStorage.setItem("rr-name",$("nickname").value);localStorage.setItem("rr-color",profile.color);localStorage.setItem("rr-secondary-color",secondaryColor||"");localStorage.setItem("rr-avatar",selectedAvatar);renderHomeColors();
    shell?.identity();
  },
});
ProfileUI.configure({account,selection:()=>({displayName:$('nickname').value,username:publicUsername,color:preferredColor,secondaryColor,avatar:selectedAvatar})});
window.addEventListener('profilechange',()=>ProfileUI.renderIdentity());
shell = AppShell.create({
  state:()=>({room,game,members,host,seat,spectator:spectating,maxPlayers:roomCapacity,visibility:roomVisibility,mapRef:roomMapRef,timing:roomTiming,started:lobbyStarted,
    busy:homeBusy || sock?.readyState !== WebSocket.OPEN || sessionReplaced || storagePaused}),
  send, saveProfile:patch=>account.updateProfile(patch),
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
    replayMotion=context.animate;replaySpeed=context.speed;
    if(!context.animate){cancelReplayEffects();lastEffectId=null;}
    useMatchDefinition(view, context.definition, {replay:true});
    const effects=prepareEffects(view);
    selected=null;stationCity=null;
    const replayColors = LobbyUI.restoreColors(recordedMembers,view.players);
    view = {...view,players:view.players.map((player,index)=>({...player,color:replayColors[index]}))};
    recordedMembers = recordedMembers.map((member,index)=>({...member,color:replayColors[index]}));
    game=view;members=recordedMembers;seat=context.seat;sessionSupported=true;replayAt=context.at;spectating=seat===-1;resultsSeen=true;uiDialog=null;
    if(context.animate&&!reducedMotion.matches&&!document.hidden&&game.phase!=='finished')for(const event of effects){
      if(event.type==='draw'&&event.seat===seat&&event.source?.width){
        const id=`replay:${event.id}`;drawPresentations.set(id,{id,event,replay:true,landed:false,cancelled:false});
      }
    }
    wagonSeed=context.match.code || context.match.id || '';
    displayedHistoryKey=null;document.body.classList.toggle('is-spectating',spectating);
    $('privateSession').hidden=true;$('leaveRoom').hidden=true;$('leaveWatch').hidden=true;$('connection').classList.add('hidden');
    if(context.animate)prepareMarketRefresh(effects,context.speed);
    render();
    if(context.animate)playEffects(effects,context.speed);
  },{cancelEffects:cancelReplayEffects,decorateRow(node,row){
    if(Number.isInteger(row.seat)&&game.players[row.seat]){
      node.insertAdjacentHTML('afterbegin',playerAvatar(row.seat,true,row.events[0]?.actor||'player'));
      applyPlayerAppearance(node,game.players[row.seat].color);node.dataset.actor=row.seat;
    }
  }});
}else connect();
function cancelReplayEffects(){
  replayMotion=false;
  if(game)cancelCardFlights();cancelConstruction();cancelTunnelMotion();stopSounds();
  for(const card of $('hand').querySelectorAll('.traincard')){card._layoutMotion?.cancel();card._layoutMotion=null;}
}

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
