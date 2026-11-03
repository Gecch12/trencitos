// Real HTTP/WebSocket clients and WebGL, with a disposable local file backend.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const E = require('../backend/engine'), { random } = require('./helpers/bot-match');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'south-america-proportions-'));
const out = path.resolve(process.env.QA_OUT || 'docs/qa/south-america-proportions');
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'state.json'), AUTH_ENABLED: 'false' });
delete process.env.RENDER;
const app = require('../backend/server');
const report = { checks: [], errors: [], measurements: [], date: new Date().toISOString() };
let browser, page;
async function capture(name) { await page.screenshot({ path: path.join(out, name + '.png') }); }
async function inspectBoard(name) {
  const result = await page.evaluate(() => {
    const view = mapViewSize(), container = document.getElementById('mapscroll').getBoundingClientRect();
    const coast = boardMap.land.flatMap(d => Array.from(d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g), m => board3D.project(Number(m[1]), Number(m[2]))));
    const xs = coast.map(p => p.x), ys = coast.map(p => p.y);
    let maxAlignmentError = 0;
    for (const geometry of MAP_GEOMETRY) for (const cell of geometry.cells) {
      const p = board3D.project(cell.x, cell.y);
      maxAlignmentError = Math.max(maxAlignmentError, Math.hypot(p.x - (cell.x - view.x) / view.scale, p.y - (cell.y - view.y) / view.scaleY));
    }
    return { coast: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) },
      width: container.width, height: container.height, maxAlignmentError,
      ratio: (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys)),
      slots: MAP_GEOMETRY.reduce((n, r) => n + r.cells.length, 0), overflow: document.documentElement.scrollWidth > innerWidth,
      wagons: board3D.stats().wagons };
  });
  assert.ok(result.maxAlignmentError < .01, `${name}: SVG hits align with Three.js`);
  assert.equal(result.slots, 300); assert.equal(result.overflow, false);
  assert.ok(result.ratio >= .7 && result.ratio <= .82);
  assert.ok(result.coast.left >= 0 && result.coast.right <= result.width);
  assert.ok(result.coast.top >= 0 && result.coast.bottom <= result.height);
  report.measurements.push({ name, ...result });
}
(async () => {
  fs.mkdirSync(out, { recursive: true }); await app.ready;
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true }); report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1728, height: 963 }, reducedMotion: 'reduce' });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
  await page.goto(base + '/rooms'); await page.locator('#create').click();
  await page.waitForFunction(() => room && wagonPreview);
  await page.locator('[data-map-id="south-america"]').click();
  await page.waitForFunction(() => roomMapRef.id === 'south-america');
  const thumbnail = await page.locator('[data-map-id="south-america"] svg').evaluate(svg => {
    const v = svg.viewBox.baseVal, boxes = [...svg.querySelectorAll('path')].map(p => p.getBBox());
    return { inside: boxes.every(b => b.x >= v.x && b.y >= v.y && b.x + b.width <= v.x + v.width && b.y + b.height <= v.y + v.height),
      ratio: (Math.max(...boxes.map(b => b.x + b.width)) - Math.min(...boxes.map(b => b.x))) / (Math.max(...boxes.map(b => b.y + b.height)) - Math.min(...boxes.map(b => b.y))) };
  });
  assert.equal(thumbnail.inside, true); assert.ok(thumbnail.ratio >= .65 && thumbnail.ratio <= .76);
  report.measurements.push({ name: 'thumbnail', ...thumbnail }); await capture('lobby-desktop');
  report.checks.push('Lobby selects Sudamérica over WebSocket; complete portrait silhouette fits SVG viewBox');

  // Deterministic initial offer, plus enough legally conserved cards for a real claim.
  const game = E.newGame(['Ángel', 'Rival'], 0, Date.now(), null, { mapRef: { id: 'south-america', version: '3.3-beta' }, random: random(31) });
  const build = game.routes.find(r => r.a === 'ARI' && r.b === 'UYU');
  for (let i = 0; i < build.n; i++) {
    const index = game.deck.indexOf('red'); assert.ok(index >= 0);
    game.players[0].hand.push(game.deck.splice(index, 1)[0]);
  }
  const room = { code: 'QAPROP', updated: Date.now(), maxPlayers: 2, visibility: 'public', mapRef: game.mapRef, game,
    members: [{ name: 'Ángel', token: 'proportions-host' }, { name: 'Rival', token: 'proportions-guest' }] };
  game.initialDeadline = Date.now() + 240000; app.rooms.set(room.code, room);
  E.action(game, 1, { type: 'choose_initial', indexes: [0, 1] }, { now: Date.now() });
  await page.evaluate(() => localStorage.setItem('rr-room-QAPROP', 'proportions-host'));
  await page.goto(base + '/?room=QAPROP'); await page.waitForFunction(() => game && board3D && ticketMapView?.stats().previewWagons > 0);
  await capture('tickets-desktop');
  const ticketCamera = await page.evaluate(() => ({ zoom, mapCenter }));
  await page.locator('#ticketZoomIn').click(); await page.locator('#ticketZoomIn').click();
  assert.ok(await page.evaluate(() => ticketMapCamera.zoom > 1));
  assert.deepEqual(await page.evaluate(() => ({ zoom, mapCenter })), ticketCamera);
  await page.locator('#ticketZoomReset').click();
  await page.locator('.ticket-inspect').first().click(); await page.mouse.move(10, 10);
  assert.equal(await page.locator('#ticketMap [data-ticket-city]').count(), 2);
  await capture('ticket-focus-desktop');
  await page.locator('#ticketMapOverview').click();
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('#keep').isVisible(), true); await capture(`tickets-${width}`);
  }
  await page.setViewportSize({ width: 1728, height: 963 });
  await page.locator('.keep').nth(0).check(); await page.locator('.keep').nth(1).check(); await page.locator('#keep').click();
  await page.waitForFunction(() => game.phase === 'play' && !ticketMapView);
  await page.mouse.move(10, 10);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  report.checks.push('Initial tickets render the shared corrected board, focus endpoints and zoom independently; phone/tablet keep controls work');
  await inspectBoard('desktop'); await capture('board-desktop');

  // Click where Three.js actually draws the middle slot, then build through the UI.
  await page.evaluate(id => { const c = geometryFor(id).cells[0]; zoom = 2.5; mapCenter = { x: c.x, y: c.y }; applyZoom(); }, build.id);
  const target = await page.evaluate(id => {
    const c = geometryFor(id).cells[0], p = board3D.project(c.x, c.y), rect = document.getElementById('mapscroll').getBoundingClientRect();
    return { x: p.x + rect.x, y: p.y + rect.y };
  }, build.id);
  await page.mouse.click(target.x, target.y); await page.locator('#startBuild').click(); await page.locator('#confirmBuild').click();
  await page.waitForFunction(id => game.routes.find(r => r.id === id).owner === 0 && !constructionBusy(), build.id);
  assert.equal(room.game.routes.find(r => r.id === build.id).owner, 0);
  assert.equal(await page.evaluate(() => board3D.stats().wagons), build.n); await capture('constructed-detail');
  report.checks.push('Clicking the curved Arica–Uyuni slot opens the correct route; real claim reaches server and renders its four wagons');
  for (const [width, height] of [[1728, 963], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { zoom = 1; mapCenter = { ...MAP_CENTER }; applyZoom(); });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await inspectBoard(`board-${width}`); await capture(`board-${width}`);
  }
  await page.reload(); await page.waitForFunction(() => game?.phase === 'play' && board3D);
  assert.equal(await page.evaluate(() => board3D.stats().wagons), build.n);
  report.checks.push('Full coast, 300 slots and SVG/WebGL alignment verified at desktop/phone/tablet; reconnect retains construction');
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(async error => { report.failure = error.stack; process.exitCode = 1; await capture('failure').catch(() => {}); })
  .finally(async () => {
    if (browser) await browser.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
    fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  });
