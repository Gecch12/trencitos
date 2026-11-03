// Local acceptance of old and additive replay protocols in the existing Europe UI.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { once } = require('node:events'), { chromium } = require('playwright');
const { saveCheckpoint } = require('../backend/room-store');
const { recording, cookie, identity } = require('./helpers/map-recording');
const legacy = require('./fixtures/replay-europe-v1.json');
const out = path.resolve(process.env.QA_OUT || 'docs/qa/map-replay');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'map-replay-browser-'));
const report = { date: new Date().toISOString(), tests: [], errors: [] };
let app, browser;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const current = recording({ id: 'europe', version: '1' }).record, old = structuredClone(legacy.record);
  old.players[0].guestId = identity.guestId;
  const file = path.join(directory, 'state.json');
  saveCheckpoint(file, { rooms: [], archive: { matches: { [current.id]: current, [old.id]: old }, claims: {} } });
  Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: file, AUTH_ENABLED: 'false' }); delete process.env.RENDER;
  app = require('../backend/server'); await app.ready; app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true }); report.browser = browser.version();
  for (const [name, record, version] of [['legacy', old, undefined], ['current', current, 1]]) {
    for (const own of [true, false]) {
      const context = await browser.newContext({ viewport: own ? { width: 1460, height: 940 } : { width: 390, height: 844 }, reducedMotion: 'reduce' });
      if (own) await context.addCookies([{ name: 'trencitos_guest', value: cookie.split('=')[1], url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
      await page.goto(`${base}/replay?id=${record.id}`);
      await page.waitForFunction(() => !!game && !!board3D && !document.getElementById('game').classList.contains('hidden'));
      assert.equal(await page.evaluate(() => game.definitionVersion), version);
      assert.equal(await page.locator('#replayViewer option').count(), own ? 3 : 1);
      assert.equal(await page.locator('#replaySecretsOpen').count(), own ? 1 : 0);
      if (own) {
        assert.ok((await page.evaluate(() => game.hand)).length > 0);
        await page.locator('#replayViewer').selectOption('-1');
      }
      assert.deepEqual(await page.evaluate(() => [game.hand, game.tickets]), [[], []]);
      await page.locator('#replayLast').click(); await page.waitForFunction(() => game.phase === 'finished');
      assert.deepEqual(await page.evaluate(() => [...game.result].sort((a, b) => a.seat - b.seat).map(row => row.score)), record.scores.map(row => row.score));
      assert.ok(await page.evaluate(() => game.result.every(row => !row.tickets.length && !row.details.destinations.length)));
      await page.locator('#replayFirst').click(); await page.waitForFunction(() => game.phase === 'initial');
      await page.locator('#replayLast').click(); await page.waitForFunction(() => game.phase === 'finished');
      await page.screenshot({ path: path.join(out, `${name}-${own ? 'participant' : 'public-mobile'}.png`), fullPage: true });
      report.tests.push({ protocol: name, perspective: own ? 'participant with public switch' : 'public', steps: record.steps, seek: true, privateDataHidden: true });
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (app) await app.shutdown(); fs.rmSync(directory, { recursive: true, force: true });
  fs.writeFileSync(path.join(out, 'replay-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
});
