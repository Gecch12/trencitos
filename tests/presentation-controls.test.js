"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../app.js"), "utf8");

test("compact-only controls start natively hidden and follow the layout, not the device", () => {
  const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
  for (const id of ["compactHud", "compactPlayers"]) assert.match(html, new RegExp(`id="${id}"[^>]*\\shidden[\\s>]`));
  for (const practiceMode of [true, false]) {
    const nodes = { compactHud: {}, compactPlayers: {}, compactPractice: { classList: { toggle(_, value) { nodes.compactPractice.hidden = value; } } } };
    const context = vm.createContext({ I18n: require("../i18n"), practiceMode, compactMedia: { matches: false }, $: id => nodes[id] });
    vm.runInContext(source.slice(source.indexOf("function syncCompactControls("), source.indexOf("function setCompactPanel(")), context);
    for (const compact of [false, true, false, true]) {
      context.compactMedia.matches = compact;
      context.syncCompactControls();
      assert.equal(nodes.compactHud.hidden, !compact);
      assert.equal(nodes.compactPlayers.hidden, !compact);
      assert.equal(nodes.compactPractice.hidden, !compact || !practiceMode);
    }
  }
});

function soundControls(storage) {
  const attributes = new Map(), button = { setAttribute: (key, value) => attributes.set(key, value) };
  let resumes = 0;
  const context = vm.createContext({ I18n: require("../i18n"),
    $: () => button, toast() {},
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { addEventListener() {}, hidden: false },
    window: { AudioContext: class { resume() { resumes++; return Promise.resolve(); } } },
  });
  vm.runInContext(source.slice(source.indexOf("let soundContext = null"), source.indexOf("function cancelCardFlights(")), context);
  return { button, attributes, context, resumes: () => resumes, read: expr => vm.runInContext(expr, context) };
}

test("sound toggle exposes its on/off state, stops active audio and restores the saved preference", () => {
  const storage = new Map();
  const sound = soundControls(storage);
  assert.equal(sound.attributes.get("aria-label"), "Sonido");
  assert.equal(sound.attributes.get("aria-pressed"), "true");
  assert.match(sound.button.innerHTML, /<svg/);
  assert.match(sound.button.innerHTML, /Sonido activado/);
  assert.equal(sound.button.title, "Silenciar sonidos");
  let stopped = 0;
  sound.context.activeNode = { stop() { stopped++; } };
  sound.read("soundNodes.add(activeNode)");
  sound.button.onclick();
  assert.equal(sound.attributes.get("aria-pressed"), "false");
  assert.equal(sound.attributes.get("aria-label"), "Sonido");
  assert.match(sound.button.innerHTML, /m16 9 5 6/);
  assert.match(sound.button.innerHTML, /Sonido desactivado/);
  assert.equal(sound.button.title, "Activar sonidos");
  assert.equal(stopped, 1);
  assert.equal(sound.read("soundNodes.size"), 0);
  assert.equal(storage.get("rr-muted"), "true");
  const reload = soundControls(storage);
  assert.equal(reload.attributes.get("aria-pressed"), "false");
  assert.equal(reload.resumes(), 0);
  reload.button.onclick();
  assert.equal(storage.get("rr-muted"), "false");
  assert.equal(reload.attributes.get("aria-pressed"), "true");
  assert.equal(reload.resumes(), 1);
  assert.equal(soundControls(storage).attributes.get("aria-pressed"), "true");
});

test("muted sound blocks cards, construction and bells before creating any audio node", () => {
  const sound = soundControls(new Map([["rr-muted", "true"]]));
  // Any attempted synthesis would fail: mute must return before reading these.
  sound.read('soundContext = { state: "running" }');
  for (const effect of ["card", "build", "bell", "pen", "pen-undo", "pen-sign", "clock-tick", "clock-tock", "shuffle"]) sound.context.playSound(effect);
  assert.equal(sound.read("soundNodes.size"), 0);
  assert.equal(sound.resumes(), 0);
});

test("market renewal sounds once per fresh event even with no visible market, and never replays on reconnect", () => {
  const played=[],animated=[];
  const context=vm.createContext({document:{hidden:false},lastEffectId:null,waitingForGameStart:false,
    marketRefresh:null,playSound:kind=>played.push(kind),animateMarketRefresh:()=>animated.push(true)});
  vm.runInContext(source.slice(source.indexOf("function prepareEffects("),source.indexOf("// Small original synthesized effects")),context);
  const update=id=>context.playEffects(context.prepareEffects({events:[{type:'market_refresh',id}]}));
  update(1);assert.equal(played.length,0); // Existing snapshot, including reconnection.
  update(2);update(2);assert.deepEqual(played,['shuffle']);assert.equal(animated.length,0);
  context.marketRefresh={id:3};update(3);assert.deepEqual(played,['shuffle','shuffle']);assert.equal(animated.length,1);
  context.document.hidden=true;update(4);context.document.hidden=false;update(4);
  assert.equal(played.length,2);
});

test("H shares the highlight action and excludes editing, modifiers, repeats and both kinds of dialog", () => {
  let handler, toggles=0, prevented=0;
  const context=vm.createContext({game:{},uiDialog:null,nativeDialog:false,overlayHidden:true,disabled:false,
    document:{addEventListener:(_,fn)=>handler=fn,querySelector:()=>context.nativeDialog},
    $:id=>id==='overlay'?{classList:{contains:()=>context.overlayHidden}}:{disabled:context.disabled},
    toggleDestinationHighlight:()=>toggles++,toggleSound:()=>{}});
  const start=source.indexOf('document.addEventListener("keydown", event => {',source.indexOf('function toggleSound('));
  vm.runInContext(source.slice(start,source.indexOf('\nsoundLabel();',start)),context);
  const event={key:'h',target:{closest:()=>null},preventDefault:()=>prevented++};
  handler(event);assert.equal(toggles,1);assert.equal(prevented,1);
  for(const flag of ['repeat','ctrlKey','metaKey','altKey','isComposing','defaultPrevented'])handler({...event,[flag]:true});
  handler({...event,target:{closest:()=>({})}});
  for(const [key,value]of [['uiDialog','tickets'],['nativeDialog',true],['overlayHidden',false],['disabled',true]]) {
    const previous=context[key];context[key]=value;handler(event);context[key]=previous;
  }
  assert.equal(toggles,1);assert.equal(prevented,1);
  handler({...event,key:'H'});assert.equal(toggles,2);
});

test("urgent clocks select only the local player's live decisions in the final five seconds", () => {
  const { urgentClock } = require("../game-ui");
  const game = { phase: "play", current: 0, players: [{}, {}], turnDeadline: 20000 };
  assert.equal(urgentClock(game, 0, 15000), null);
  assert.deepEqual(urgentClock(game, 0, 15001), { kind: "turn", deadline: 20000, seconds: 5 });
  for (const now of [20000, 21000]) assert.equal(urgentClock(game, 0, now), null);
  for (const seat of [-1, 1]) assert.equal(urgentClock(game, seat, 18000), null);
  for (const phase of ["finished", "abandoned"]) assert.equal(urgentClock({ ...game, phase }, 0, 18000), null);
  assert.equal(urgentClock({ ...game, turnWaiting: true }, 0, 18000), null);
  const initial = { ...game, phase: "initial", initial: [{}], initialDeadline: 20000 };
  assert.equal(urgentClock(initial, 1, 18000).kind, "initial");
  assert.equal(urgentClock({ ...initial, initial: null }, 1, 18000), null);
  const offer = { ...game, current: 1, ticketOffer: { deadline: 20000 } };
  assert.equal(urgentClock(offer, 0, 18000).kind, "offer");
  assert.equal(urgentClock({ ...offer, phase: "closing" }, 0, 18000).kind, "offer");
  for (const stage of ["reveal", "decision", "result"]) {
    assert.equal(urgentClock({ ...offer, phase: "tunnel", sharedTunnel: { stage, offerRemaining: 2000 } }, 0, 18000), null);
    assert.equal(urgentClock({ ...game, phase: "tunnel", sharedTunnel: { stage } }, 0, 18000)?.kind ?? null, stage === "decision" ? "turn" : null);
  }
});

function clockSoundControls() {
  const sound = soundControls(new Map());
  Object.assign(sound.context, {
    GameUI: require("../game-ui"), game: { phase: "play", current: 0, players: [{}, {}], turnDeadline: 20000 },
    room: "CLOCK", seat: 0, replayAt: null, spectating: false, sessionReplaced: false, storagePaused: false,
    pendingAction: null, members: [{}], sock: { readyState: 1 }, WebSocket: { OPEN: 1 },
    played: [], clockNow: 0,
  });
  sound.read('soundContext = { state: "running" }; performance = { now: () => clockNow }; playSound = kind => played.push(kind);');
  sound.at = now => { sound.context.clockNow = now; sound.context.updateClockSound(now); };
  return sound;
}

test("clock sounds alternate once per second despite redraws and never replay missed ticks", () => {
  const sound = clockSoundControls();
  for (let now = 15001; now < 20001; now += 250) {
    sound.at(now); sound.at(now); // Desktop clock, dialog and rerenders share one warning.
  }
  assert.deepEqual(sound.context.played, ["clock-tick", "clock-tock", "clock-tick", "clock-tock", "clock-tick"]);
  sound.at(22000); assert.equal(sound.context.played.length, 5);
  const delayed = clockSoundControls();
  delayed.at(15001); delayed.at(18001); delayed.at(18002);
  assert.deepEqual(delayed.context.played, ["clock-tick", "clock-tock"]);
  delayed.context.game.turnDeadline += 100; delayed.at(18003); // Clock correction cannot double a click.
  assert.equal(delayed.context.played.length, 2);
});

test("clock audio respects mute, hidden tabs, replay, ownership, connection and paused actions", () => {
  for (const blocked of ['muted = true', 'document.hidden = true', 'replayAt = 0', 'spectating = true',
    'sessionReplaced = true', 'storagePaused = true', 'game.storagePaused = true', 'pendingAction = {}',
    'members[0].autopilot = true', 'sock.readyState = 3', 'soundContext.state = "suspended"']) {
    const sound = clockSoundControls(); sound.read(blocked); sound.at(18000);
    assert.equal(sound.context.played.length, 0, blocked);
  }
  const sound = clockSoundControls(); sound.at(15001);
  sound.context.document.hidden = true; sound.at(16001); sound.at(17001);
  sound.context.document.hidden = false; sound.at(18001);
  assert.deepEqual(sound.context.played, ["clock-tick", "clock-tock"]);
  sound.context.game.current = 1; sound.at(19001);
  assert.equal(sound.context.played.length, 2);
});
