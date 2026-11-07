// Per-match attention lifecycle and both alternating waves, on a disposable server.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { chromium } = require('playwright'), { resultsRoom } = require('./helpers/results-preview');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-aura-')), out = path.resolve('.qa/destination-aura');
fs.mkdirSync(out, { recursive: true });
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(dir, 'state.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server'), report = { errors: [], checks: [] };
let browser, page;
(async () => {
  await app.ready;
  await new Promise(ok => app.server.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: process.env.CI ? ['--enable-unsafe-swiftshader'] : [] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, hasTouch: true });
  page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(e.stack));
  await page.addInitScript(() => localStorage.setItem('rr-muted', 'true'));
  await page.goto(base + '/rooms');
  await page.waitForFunction(() => sock?.readyState === 1);
  await page.locator('#create').click();
  await page.waitForSelector('#roompanel:not(.hidden)');
  await page.locator('[data-add-bot]').first().click();
  await page.waitForFunction(() => members.length === 2);
  await page.locator('#start').click();
  await page.locator('#keep').waitFor();
  const button = page.locator('#toggleDestinations'), aura = button.locator('.destination-aura');
  assert.equal(await aura.isVisible(), false);
  for (const i of [0, 1]) await page.locator('.keep').nth(i).check();
  await page.locator('#keep').click();
  await aura.waitFor();
  await page.waitForFunction(() => game?.phase === 'play');
  const firstMatch = await page.evaluate(() => currentMatchId);
  assert.ok(firstMatch);
  assert.equal(await button.locator('.destination-switch').count(), 0);
  await page.locator('#destinationHint').waitFor({ state: 'hidden' });
  // Freeze the CSS timeline at two different moments to inspect the actual arcs.
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const before = await button.boundingBox();
    for (const [wave, time] of [['corners', 240], ['edges', 1540]]) {
      await aura.evaluate((node, time) => node.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = time; }), time);
      const opacity = await aura.locator(`.destination-aura-${wave}`).evaluate(n => Number(getComputedStyle(n).opacity));
      assert.ok(opacity > .6, `${wave} is visible at ${width}`);
      const box = await button.boundingBox();
      assert.deepEqual(box, before, 'attention never moves or resizes the button');
      await page.screenshot({ path: path.join(out, `${width}-${wave}.png`) });
      await page.screenshot({ path: path.join(out, `${width}-${wave}-detail.png`), clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 55), width: 60, height: 154 } });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await aura.evaluate(n => n.getAnimations({ subtree: true }).length), 0);
  assert.ok(await aura.locator('.destination-aura-corners').evaluate(n => Number(getComputedStyle(n).opacity) > 0));
  await page.screenshot({ path: path.join(out, 'mobile-reduced-motion.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#mapscroll').focus();
  await page.keyboard.press('h');
  assert.equal(await aura.isVisible(), false);
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  await button.tap();
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  assert.equal(await aura.isVisible(), false);
  await page.evaluate(() => sock.close());
  await page.waitForFunction(() => sock?.readyState === 1);
  assert.equal(await aura.isVisible(), false);
  await page.reload();
  await page.waitForFunction(() => game?.phase === 'play');
  assert.equal(await page.evaluate(() => currentMatchId), firstMatch);
  assert.equal(await aura.isVisible(), false);
  report.checks.push('no aura before kept tickets', 'corner/edge waves at 1440/820/390 px without layout movement', 'reduced motion static halo', 'H and touch dismiss permanently through reconnect and reload');
  // Start an actual rematch through the finished game's controls.
  const finished = resultsRoom('AURAF1');
  finished.practice = false; finished.members.forEach((m, i) => { m.bot = i > 0; });
  app.rooms.set(finished.code, finished);
  await page.evaluate(() => localStorage.setItem('rr-room-AURAF1', 'a'.repeat(48)));
  await page.goto(base + '/?room=AURAF1');
  await page.waitForFunction(() => game?.phase === 'finished');
  await page.locator('#postgameMap').click();
  await aura.waitFor();
  await button.tap();
  assert.equal(await aura.isVisible(), false);
  await page.locator('#viewResults').click();
  await page.locator('#rematch').click();
  await page.waitForSelector('#roompanel:not(.hidden)');
  await page.locator('[data-add-bot]').first().click();
  await page.waitForFunction(() => members.length === 2);
  await page.locator('#start').click();
  await page.locator('#keep').waitFor();
  for (const i of [0, 1]) await page.locator('.keep').nth(i).check();
  await page.locator('#keep').click();
  await aura.waitFor();
  assert.notEqual(await page.evaluate(() => currentMatchId), firstMatch);
  await button.tap();
  assert.equal(await aura.isVisible(), false);
  report.checks.push('unused cue remains after finishing; first tap dismisses it; rematch restores it');
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report));
})().catch(async error => {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
}).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); await app.shutdown(); fs.rmSync(dir, { recursive: true, force: true });
});
