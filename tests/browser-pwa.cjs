"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { chromium } = require("playwright");
const { startMobileServer } = require("../scripts/mobile-server");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trencitos-pwa-"));
  const app = await startMobileServer({ port: 0, stateFile: path.join(dir, "rooms.json") });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ locale: "es-PE" });
    const page = await context.newPage(), base = `http://127.0.0.1:${app.server.address().port}`;
    await page.goto(base + "/rooms");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const manifest = await (await page.request.get(base + "/manifest.webmanifest")).json();
    assert.equal(manifest.display, "standalone");
    for (const icon of manifest.icons) {
      const dimensions = await page.evaluate(src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`); image.onerror = reject; image.src = src; }), icon.src);
      assert.equal(dimensions, icon.sizes);
    }
    await page.evaluate(() => fetch("/api/account"));
    await page.evaluate(() => fetch("/api/history"));
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat());
    assert.deepEqual(cached.sort(), ["/assets/icons/app-192.png", "/offline.css", "/offline.html", "/offline.js"]);
    await context.setOffline(true);
    await page.goto(base + "/play?room=12345678#recover=private-example");
    await page.getByRole("button").waitFor();
    assert.match(await page.locator("body").innerText(), /conexión|Internet/i);
    await context.setOffline(false);
    await page.getByRole("button").click();
    // Retry preserves the requested room; an invalid recovery fragment does
    // not silently grant a seat or change the requested route to the lobby.
    await page.locator("#joinDialog").waitFor();
    assert.equal(await page.locator("#code").inputValue(), "12345678");
    assert.equal(new URL(page.url()).hash, "");
    await page.locator("#joinDialog [data-close-dialog]").click();
    await page.locator('.app-nav [data-page="rooms"]').click();
    await page.locator("#create").waitFor();
    await page.waitForFunction(() => !document.getElementById("create").disabled);
    console.log("PWA: manifest, icon sizes, private data excluded from cache, offline fallback and recovery passed.");
  } finally { await browser.close(); await app.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
