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
    const context = vm.createContext({ practiceMode, compactMedia: { matches: false }, $: id => nodes[id] });
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
  const context = vm.createContext({
    $: () => button,
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
  assert.match(sound.button.innerHTML, /Sonido activado/);
  assert.equal(sound.button.title, "Silenciar sonidos");
  let stopped = 0;
  sound.context.activeNode = { stop() { stopped++; } };
  sound.read("soundNodes.add(activeNode)");
  sound.button.onclick();
  assert.equal(sound.attributes.get("aria-pressed"), "false");
  assert.equal(sound.attributes.get("aria-label"), "Sonido");
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
  for (const effect of ["card", "build", "bell"]) sound.context.playSound(effect);
  assert.equal(sound.read("soundNodes.size"), 0);
  assert.equal(sound.resumes(), 0);
});
