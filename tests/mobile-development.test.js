"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { mobileConfig, mobilePort } = require("../scripts/mobile-config");

test("mobile development targets only the Mac; an ordinary sync bundles setup help", () => {
  assert.equal(mobileConfig().server, undefined);
  assert.equal(mobileConfig("ios", "3181").server.url, "http://localhost:3181");
  assert.equal(mobileConfig("android", "3181").server.url, "http://10.0.2.2:3181");
  for (const value of ["", "0", "443", "65536", "3180/foo", "https://example.com", "3180.5"]) {
    assert.throws(() => mobilePort(value));
  }
  assert.throws(() => mobileConfig("production"));
});

test("native resume and Android back integrate without affecting browser sessions", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/mobile-bridge.js"), "utf8");
  const browser = vm.createContext({});
  vm.runInContext(source, browser);
  await browser.TrencitosMobile.attach({ resume() { assert.fail("browser resumed"); } });
  const listeners = new Map();
  let resumes = 0, minimized = 0, consumesBack = true;
  const native = vm.createContext({ console, Capacitor: {
    isNativePlatform: () => true, getPlatform: () => "android",
    Plugins: { App: {
      addListener: async (name, fn) => listeners.set(name, fn),
      minimizeApp: async () => { minimized++; },
    } },
  } });
  vm.runInContext(source, native);
  await native.TrencitosMobile.attach({ resume: () => resumes++, back: () => consumesBack });
  listeners.get("appStateChange")({ isActive: false });
  assert.equal(resumes, 0);
  listeners.get("appStateChange")({ isActive: true });
  assert.equal(resumes, 1);
  listeners.get("backButton")();
  assert.equal(minimized, 0);
  consumesBack = false;
  listeners.get("backButton")();
  assert.equal(minimized, 1);
});

test("mobile server overrides inherited remote storage/auth settings and serves the game", async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "trencitos-mobile-"));
  const keys = ["STATE_BACKEND", "STATE_FILE", "AUTH_ENABLED", "RENDER"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { STATE_BACKEND: "supabase", AUTH_ENABLED: "true", RENDER: "true" });
  const { startMobileServer } = require("../scripts/mobile-server");
  const app = await startMobileServer({ port: 0, stateFile: path.join(temp, "rooms.json") });
  t.after(async () => {
    await app.shutdown();
    fs.rmSync(temp, { recursive: true, force: true });
    for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
  });
  assert.equal(app.server.address().address, "127.0.0.1");
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(base + "/healthz");
  assert.equal(response.headers.get("x-trencitos-development"), "capacitor");
  assert.equal((await response.json()).storage, "file");
  assert.equal((await (await fetch(base + "/api/account")).json()).enabled, false);
  const home = await fetch(base + "/");
  assert.match(await home.text(), /mobile-bridge\.js/);
  for (const asset of ["/app.js", "/mobile-bridge.js", "/vendor/three.module.js"]) {
    assert.equal((await fetch(base + asset)).status, 200, asset);
  }
});
