// Real WebSocket/server with controlled delivery to exercise slow confirmations.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-colors-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'rooms.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server');
const { loadState } = require('../backend/room-store');
const out = path.resolve(__dirname, '../.qa/color-preview');

(async () => {
  let browser;
  const errors = [], report = { checks: [], timings: [] };
  try {
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    let holdReplies = false, holdRequests = false;
    const replies = [], requests = [], sentColors = [];
    await page.routeWebSocket('**/socket', socket => {
      const server = socket.connectToServer();
      server.onMessage(message => {
        const value = JSON.parse(message.toString());
        if (holdReplies && value.type === 'lobby') replies.push(() => socket.send(message));
        else socket.send(message);
      });
      socket.onMessage(message => {
        const value = JSON.parse(message.toString());
        if (value.type === 'select_color') {
          sentColors.push(value.color);
          if (holdRequests) { requests.push(() => server.send(message)); return; }
        }
        server.send(message);
      });
    });
    const settle = color => page.waitForFunction(color => preferredColor === color && !pendingRoomColor && !colorRequest, color);
    const visible = color => page.waitForFunction(color => document.querySelector(`#roomColors [data-color="${color}"]`).getAttribute('aria-pressed') === 'true'
      && document.querySelector('#wagonPreviewStage').getAttribute('aria-label').includes(I18n.t(LobbyUI.PALETTE.find(p => p.color === color).name)), color);
    async function click(color, expectVisible = true) {
      // Timing starts in the actual DOM event handler, excluding Playwright waits.
      const elapsed = await page.evaluate(async color => {
        const start = performance.now();
        document.querySelector(`#roomColors [data-color="${color}"]`).click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - start;
      }, color);
      if (expectVisible) await visible(color);
      report.timings.push({ color, twoFramesMs: Math.round(elapsed * 10) / 10 });
    }
    await page.goto(base + '/rooms');
    await page.locator('#create').click();
    await page.waitForFunction(() => !!room && !!wagonPreview);
    const code = await page.locator('#roomcode').innerText();
    const original = await page.evaluate(() => preferredColor);
    const purple = '#9a75ba', blue = '#458ad4', green = '#4b9d76';
    await page.evaluate(() => { window.originalWagonCanvas = document.querySelector('#wagonPreviewStage canvas'); });

    holdReplies = true;
    await click(purple);
    assert.equal(await page.evaluate(() => preferredColor), original);
    assert.equal(await page.evaluate(() => localStorage.getItem('rr-color')), original);
    await click(blue); await click(purple); await click(green);
    assert.deepEqual(sentColors, [purple]);
    // The first accepted color must not replace the latest green preview.
    replies.splice(0).forEach(deliver => deliver());
    await page.waitForFunction(color => preferredColor === color, purple);
    await visible(green);
    assert.deepEqual(sentColors, [purple, green]);
    holdReplies = false;
    replies.splice(0).forEach(deliver => deliver());
    await settle(green);
    report.checks.push('Immediate preview before confirmation; rapid clicks coalesce; old confirmation preserves latest selection');

    // Return to an already rendered wagon without replacing its WebGL canvas.
    await click(purple); await settle(purple);
    await click(blue); await settle(blue);
    await click(purple); await settle(purple);
    assert.equal(await page.evaluate(() => originalWagonCanvas === document.querySelector('#wagonPreviewStage canvas')), true);
    assert.equal(loadState(process.env.STATE_FILE).rooms.find(r => r.code === code).members[0].color, purple);
    report.checks.push('Returning colors reuse the canvas and confirmed color reaches disk');

    // Another client wins the color while our request is held in transit.
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(base + '/rooms');
    await guest.locator('#openJoin').click(); await guest.locator('#code').fill(code); await guest.locator('#join').click();
    await guest.waitForFunction(() => !!room && !!wagonPreview);
    await page.waitForFunction(() => members.length === 2);
    holdRequests = true;
    await click(blue);
    await guest.locator(`#roomColors [data-color="${blue}"]`).click();
    await guest.waitForFunction(color => preferredColor === color, blue);
    holdRequests = false; requests.splice(0).forEach(deliver => deliver());
    await settle(purple); await visible(purple);
    assert.match(await page.locator('#lobbyError').innerText(), /ocupado/);
    assert.equal(await page.evaluate(() => localStorage.getItem('rr-color')), purple);
    report.checks.push('Color conflict restores confirmed preview and never saves a rejected preference');

    // Reject an older click but keep the newer desired color in the queue.
    holdRequests = true;
    await click(green); await click(original);
    await guest.locator(`#roomColors [data-color="${green}"]`).click();
    await guest.waitForFunction(color => preferredColor === color, green);
    holdRequests = false; requests.splice(0).forEach(deliver => deliver());
    await settle(original); await visible(original);
    report.checks.push('A rejected older request preserves the newer choice');

    holdRequests = true;
    await click(purple);
    assert.equal(await page.locator('#start').isDisabled(), true);
    await page.evaluate(() => sock.close());
    requests.length = 0; holdRequests = false;
    await settle(original); await visible(original);
    await page.waitForFunction(() => sock?.readyState === WebSocket.OPEN && members[seat]?.connected);
    report.checks.push('Disconnect discards provisional selection and reconnect restores server color');

    // A disk failure rolls the server and client back to the same committed color.
    fs.mkdirSync(process.env.STATE_FILE + '.tmp');
    await click(purple, false);
    await page.waitForFunction(() => storagePaused);
    await settle(original); await visible(original);
    fs.rmdirSync(process.env.STATE_FILE + '.tmp');
    await page.locator('#retrySave').click();
    await page.waitForFunction(() => !storagePaused);
    await click(purple); await settle(purple);
    report.checks.push('Failed save restores committed color; retry resumes selection');

    await page.reload(); await settle(purple);
    await page.waitForFunction(() => !!wagonPreview);
    await visible(purple);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[data-room-tab="settings"]').click();
    await page.locator('#wagonPreview').scrollIntoViewIfNeeded();
    await click(blue); await settle(blue);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    fs.mkdirSync(out, { recursive: true });
    await page.locator('#wagonPreview').screenshot({ path: path.join(out, 'mobile-preview.png') });
    report.checks.push('Reload preserves accepted preference; mobile preview updates without overflow');
    assert.deepEqual(errors, []);
    report.errors = errors; report.browser = browser.version();
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await app.shutdown();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
