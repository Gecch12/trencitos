// Real browser, HTTP and WebSocket; disposable file backend, no production state.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const E = require('../backend/engine'), { TICKETS } = require('../shared/data');
const { tunnelRoom } = require('./helpers/tunnel-preview');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-destination-map-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'state.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server'), out = path.resolve('.qa/destination-map'); fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], date: new Date().toISOString() };
let browser;
(async () => {
  await app.ready; await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  async function page(room, token, options = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
    if (token) await ctx.addInitScript(({ code, token }) => localStorage.setItem(`rr-room-${code}`, token), { code: room.code, token });
    const p = await ctx.newPage(); p.setDefaultTimeout(12000);
    p.on('pageerror', e => report.errors.push(e.message)); p.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
    await p.goto(`${base}/?${token ? 'room' : 'watch'}=${room.code}`); await p.waitForFunction(() => !!game && !!board3D);
    return p;
  }
  function initial(code, mapRef) {
    const room = { code, updated: Date.now(), maxPlayers: 2, visibility: 'private', game: E.newGame(['Planificador', 'Rival'], 0, 0, null, mapRef ? { mapRef } : {}), ...(mapRef ? { mapRef } : {}),
      members: [{ name: 'Planificador', token: 'initial-a' }, { name: 'Rival', token: 'initial-b' }] };
    room.game.initialDeadline = Date.now() + 90000; app.rooms.set(code, room); return room;
  }
  async function shade(p, strength) {
    await p.waitForFunction(strength => {
      const s = ticketMapView?.stats();
      return s && !s.shadingAnimating && Math.abs(s.shadingStrength - strength) < .0001;
    }, strength);
  }
  async function overview(p, indexes) {
    await shade(p, indexes.length + await p.evaluate(() => retainedVisible.size) ? .5 : 0);
    // Reduced motion settles the colors synchronously; SVG labels paint on RAF.
    await p.evaluate(() => new Promise(requestAnimationFrame));
    const actual = await p.evaluate(indexes => {
      const tickets = uiDialog === 'routes' ? game.tickets : game.ticketOffer?.tickets || game.initial;
      const shown = indexes.map(i => tickets[i]).concat(game.tickets.filter(t => retainedVisible.has(t.id)));
      return { expectedRoutes: [...new Set(shown.flatMap(t => ticketPlans.get(t.id).routes))].sort(),
        routes: ticketMapView.stats().spotlightRoutes.sort(),
        expectedCities: [...new Set(shown.flatMap(t => [t.a, t.b]))].sort(),
        cities: [...document.querySelectorAll('[data-ticket-city]')].map(n => n.dataset.ticketCity).sort() };
    }, indexes);
    assert.deepEqual(actual.routes, actual.expectedRoutes);
    assert.deepEqual(actual.cities, actual.expectedCities);
  }
  const first = initial('QAMAP1'), p = await page(first, 'initial-a');
  await p.waitForFunction(() => !!ticketMapView);
  await overview(p, []);
  assert.equal(await p.evaluate(() => ticketMapView.stats().previewWagons), 0);
  assert.equal(await p.locator('#keep').isEnabled(), false);
  assert.equal(await p.locator('#ticketMap canvas').count(), 1);
  await p.screenshot({ path: path.join(out, 'initial-empty.png') });
  // Text, number, padding and native checkbox each toggle exactly once.
  await p.locator('.ticket-inspect').first().click(); await p.mouse.move(20, 20);
  await overview(p, [0]);
  assert.equal(await p.locator('.keep:checked').count(), 1);
  await p.locator('.ticket-number').nth(1).click(); await p.mouse.move(20, 20);
  await overview(p, [0, 1]);
  await p.locator('.ticket-choice').nth(2).click({ position: { x: 4, y: 4 } });
  await p.mouse.move(20, 20); await overview(p, [0, 1, 2]);
  await p.locator('.keep').nth(2).click(); await p.mouse.move(20, 20); await overview(p, [0, 1]);
  await p.locator('.keep').nth(2).focus(); await p.keyboard.press('Space'); await overview(p, [0, 1, 2]);
  await p.keyboard.press('Space'); await overview(p, [0, 1]);
  await p.evaluate(() => {
    window.shadingSamples = [];
    const until = performance.now() + 1000;
    const sample = () => { shadingSamples.push(ticketMapView.stats().shadingStrength); if (performance.now() < until) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  await p.locator('.ticket-inspect').nth(3).hover(); await shade(p, 1);
  assert.equal(await p.locator('#ticketMap [data-ticket-city]').count(), 2);
  assert.equal(await p.locator('.keep:checked').count(), 2);
  assert.ok(await p.evaluate(() => shadingSamples.some(n => n > .5 && n < 1)));
  assert.ok(await p.evaluate(() => shadingSamples.every(n => n >= .5 && n <= 1)));
  await p.screenshot({ path: path.join(out, 'initial-full-focus.png') });
  await p.mouse.move(20, 20); await overview(p, [0, 1]);
  await p.screenshot({ path: path.join(out, 'initial-medium-overview.png') });
  await p.locator('#ticketMap [data-ticket-city] [data-preview-key="1"]').first().click(); await shade(p, 1);
  assert.equal(await p.locator('.keep:checked').count(), 2);
  await p.mouse.move(20, 20); await overview(p, [0, 1]);
  assert.equal(await p.evaluate(() => pinnedTicket), null);
  const mainCamera = await p.evaluate(() => ({ zoom, mapCenter }));
  const map = await p.locator('#ticketMap').boundingBox();
  await p.mouse.move(map.x + map.width * .55, map.y + map.height * .55); await p.mouse.wheel(0, -340);
  await p.waitForFunction(() => ticketMapCamera.zoom > 1.4);
  assert.deepEqual(await p.evaluate(() => ({ zoom, mapCenter })), mainCamera);
  await p.locator('#ticketZoomReset').click();
  await p.locator('#ticketMap').focus(); await p.keyboard.press('+');
  const panBefore = await p.evaluate(() => ticketMapCamera.center.x);
  await p.keyboard.press('ArrowRight');
  assert.ok(await p.evaluate(() => ticketMapCamera.center.x) > panBefore);
  await p.keyboard.press('Home');
  const selectedCamera = await p.evaluate(() => structuredClone(ticketMapCamera));
  await p.locator('.keep').first().uncheck(); await p.mouse.move(20, 20); await overview(p, [1]);
  assert.deepEqual(await p.evaluate(() => ticketMapCamera), selectedCamera);
  await p.locator('.keep').nth(1).uncheck(); await p.mouse.move(20, 20); await overview(p, []);
  assert.equal(await p.evaluate(() => ticketMapView.stats().previewWagons), 0);
  await p.locator('.keep').nth(0).check(); await p.locator('.keep').nth(1).check();
  await p.mouse.move(20, 20); await overview(p, [0, 1]);
  await p.evaluate(() => document.querySelector('#ticketMap canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await p.locator('#ticketMapRetry').waitFor({ state: 'visible' });
  assert.equal(await p.locator('.keep:checked').count(), 2);
  assert.equal(await p.locator('#keep').isEnabled(), true);
  assert.equal(await p.evaluate(() => !!board3D), true);
  await p.locator('#ticketMapRetry').click(); await overview(p, [0, 1]);
  const keptIds = first.game.players[0].pending.slice(0, 2).map(t => t.id);
  await p.locator('#keep').click(); await p.waitForFunction(() => !game.initial);
  assert.deepEqual(first.game.players[0].tickets.map(t => t.id), keptIds);
  report.checks.push('Whole ticket text, number, padding, checkbox and keyboard toggle exactly once; zero selection shows no previews; server confirms exact choices');
  report.checks.push('Half-strength selected overview, exclusive hover, pointer exit, map route focus, keyboard pan/zoom and WebGL recovery');
  await p.close();

  const mobile = await page(initial('QAMAP2'), 'initial-a', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.waitForFunction(() => !!ticketMapView); await overview(mobile, []);
  assert.match(await mobile.locator('#ticketTrainReserve').innerText(),/Te quedan 45 vagones disponibles/);
  assert.equal(await mobile.locator('#ticketTrainReserve').evaluate(el=>!!el.closest('.ticket-collections')),false);
  await mobile.locator('.ticket-inspect').nth(1).tap(); await shade(mobile, 1);
  assert.equal(await mobile.locator('.keep:checked').count(), 1);
  await mobile.locator('#dialogTitle').tap(); await overview(mobile, [1]);
  await mobile.locator('.ticket-number').first().tap(); await shade(mobile, 1);
  await mobile.locator('#ticketMap').tap({ position: { x: 15, y: 65 } }); await overview(mobile, [0, 1]);
  await mobile.screenshot({ path: path.join(out, 'initial-medium-mobile.png') });
  await mobile.locator('.ticket-inspect').nth(1).tap(); await overview(mobile, [0]);
  await mobile.locator('.keep').first().tap(); await overview(mobile, []);
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  await mobile.locator('.ticket-inspect').first().tap();
  assert.equal(await mobile.evaluate(() => ticketMapView.stats().shadingAnimating), false);
  assert.equal(await mobile.evaluate(() => ticketMapView.stats().shadingStrength), 1);
  await mobile.locator('#dialogTitle').tap(); await overview(mobile, [0]);
  const cdp = await mobile.context().newCDPSession(mobile), bounds = await mobile.locator('#ticketMap').boundingBox();
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  const touch = (type, radius) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - radius, y: cy, id: 1 }, { x: cx + radius, y: cy, id: 2 }] });
  await touch('touchStart', 25); await touch('touchMove', 45); await touch('touchMove', 65); await touch('touchEnd');
  await mobile.waitForFunction(() => ticketMapCamera.zoom > 1.5);
  assert.equal(await mobile.evaluate(() => visualViewport.scale), 1);
  assert.equal(await mobile.locator('.keep:checked').count(), 1);
  for (const [width, height] of [[768, 1024], [844, 390]]) {
    await mobile.setViewportSize({ width, height }); await mobile.locator('#ticketZoomReset').tap();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await mobile.locator('#keep').isVisible(), true);
    await mobile.screenshot({ path: path.join(out, `initial-${width}.png`) });
  }
  report.checks.push('Touch anywhere toggles selection; outside touch clears exclusive focus; reduced motion, pinch, phone/tablet/landscape');
  await mobile.close();

  const south = await page(initial('QAMAP5', { id: 'south-america', version: '3.3-beta' }), 'initial-a');
  await south.waitForFunction(() => !!ticketMapView); await overview(south, []);
  await south.locator('.ticket-inspect').first().click(); await south.mouse.move(20, 20); await overview(south, [0]);
  assert.equal(await south.evaluate(() => game.mapRef.id), 'south-america');
  assert.equal(await south.evaluate(() => [...ticketPlans.values()].every(plan => plan.routes.every(id => typeof id === 'string' && geometryFor(id)))), true);
  await south.screenshot({ path: path.join(out, 'south-america-initial.png') });
  report.checks.push('South America uses its own geometry and opaque route/ticket IDs');
  await south.close();

  const live = tunnelRoom('QAMAP3', 'color', true); live.practice = false; live.visibility = 'public'; live.maxPlayers = 4;
  live.game.players[0].tickets = [TICKETS.find(t => t.long)];
  const target = TICKETS.find(t => t.a === 'LON' && t.b === 'VIE');
  live.game.shortDeck = [target, ...TICKETS.filter(t => !t.long && t.id !== target.id)];
  for (let i = 0; i < 2; i++) live.game.players[1].hand.push(live.game.deck.splice(live.game.deck.indexOf('white'), 1)[0]);
  app.rooms.set(live.code, live);
  const chooser = await page(live, 'preview-human'), builder = await page(live, 'preview-1');
  await chooser.locator('#drawtickets').click();
  await chooser.waitForFunction(() => !!game.ticketOffer && !!ticketMapView);
  await overview(chooser, []);
  await chooser.locator('.retained-choice .ticket-inspect').first().click(); await chooser.mouse.move(20, 20);
  await overview(chooser, []);
  assert.equal(await chooser.locator('.ticket-eye').first().isChecked(), true);
  assert.equal(await chooser.locator('#keep').isEnabled(), false, 'comparing a kept ticket does not select an offered one');
  await chooser.locator('.ticket-eye').first().click(); await chooser.mouse.move(20, 20); await overview(chooser, []);
  await chooser.locator('.keep').first().check(); await overview(chooser, [0]);
  await chooser.locator('.ticket-inspect').nth(1).hover(); await shade(chooser, 1);
  await chooser.mouse.move(20, 20); await overview(chooser, [0]);
  await chooser.screenshot({ path: path.join(out, 'new-soft-selected.png') });
  await chooser.locator('.keep').first().check(); await chooser.mouse.move(20, 20);
  await chooser.locator('#ticketZoomIn').click();
  const before = await chooser.evaluate(id => ({ camera: structuredClone(ticketMapCamera), deadline: game.ticketOffer.deadline, plan: ticketPlans.get(id).routes, choices: [...ticketChoices], pinned: pinnedTicket }), target.id);
  const claimed = live.game.routes.find(r => [r.a, r.b].includes('AMS') && [r.a, r.b].includes('FRA'));
  assert.ok(before.plan.includes(claimed.id));
  await builder.waitForFunction(() => game.current === seat);
  await builder.evaluate(id => { uiDialog = 'build'; buildTarget = { routeId: id }; showBuildDialog(); }, claimed.id);
  await builder.locator('#confirmBuild').click();
  await chooser.waitForFunction(id => game.routes.find(r => r.id === id).owner === 1, claimed.id);
  await chooser.waitForFunction(id => !ticketPlans.get(id).routes.includes(game.routes.find(r => r.a === 'AMS' && r.b === 'FRA' || r.a === 'FRA' && r.b === 'AMS').id), target.id);
  const after = await chooser.evaluate(() => ({ camera: structuredClone(ticketMapCamera), deadline: game.ticketOffer.deadline, choices: [...ticketChoices], pinned: pinnedTicket }));
  assert.deepEqual({ ...after, deadline: before.deadline }, { camera: before.camera, deadline: before.deadline, choices: before.choices, pinned: before.pinned });
  assert.equal(after.deadline, live.game.players[0].offer.deadline);
  assert.ok(after.deadline - before.deadline < 2000, "only the server construction pause may shift the offer deadline");
  assert.equal(await chooser.locator('#ticketMapNotice').innerText(), 'Recorrido actualizado');
  await chooser.screenshot({ path: path.join(out, 'new-live-reroute.png') });
  await chooser.locator('#minimizeTickets').click(); await chooser.locator('#pendingTickets').click();
  await chooser.waitForFunction(() => !!ticketMapView);
  assert.equal(await chooser.locator('.keep').first().isChecked(), true);
  assert.equal(await chooser.evaluate(() => ticketMapCamera.zoom), before.camera.zoom);
  await chooser.evaluate(() => { I18n.select('en'); location.reload(); });
  await chooser.waitForFunction(() => !!ticketMapView);
  assert.match(await chooser.locator('.ticket-plan').first().innerText(), /additional wagons/);
  assert.match(await chooser.locator('.keep').first().getAttribute('aria-label'), /^Keep /);
  await chooser.screenshot({ path: path.join(out, 'new-english.png') });
  report.checks.push('Concurrent real construction reroutes offered ticket while preserving checks, inspection, zoom and deadline; reopen and English');
  await chooser.locator('#minimizeTickets').click(); await chooser.locator('#viewRoutes').click();
  await overview(chooser, [0]);
  await chooser.locator('.ticket-inspect').first().click(); await chooser.mouse.move(20, 20); await overview(chooser, []);
  assert.equal(await chooser.evaluate(() => game.tickets.length), 1, 'viewing toggles highlight without discarding a kept ticket');
  assert.match(await chooser.locator('.keep').first().getAttribute('aria-label'), /^Highlight /);
  report.checks.push('Whole retained ticket compares independently; viewing kept tickets toggles highlight without discarding them');
  await chooser.close(); await builder.close();

  const tunnel = tunnelRoom('QAMAP4', 'color', true); tunnel.practice = false; tunnel.visibility = 'public'; tunnel.maxPlayers = 4; app.rooms.set(tunnel.code, tunnel);
  const actor = await page(tunnel, 'preview-human'), observer = await page(tunnel, 'preview-1', { reducedMotion: 'reduce' }), spectator = await page(tunnel, null);
  const route = tunnel.game.routes.find(r => r.tunnel && r.color === 'gray' && r.n === 2);
  await observer.evaluate(id => { const geometry = geometryFor(id), cell = geometry.cells[0]; zoom = 2.4; mapCenter = { x: cell.x, y: cell.y }; applyZoom(); }, route.id);
  const observerCamera = await observer.evaluate(() => ({ zoom, mapCenter }));
  await actor.evaluate(id => { uiDialog = 'build'; buildTarget = { routeId: id }; showBuildDialog(); }, route.id);
  await actor.locator('#confirmBuild').click();
  await observer.waitForFunction(() => game.sharedTunnel?.stage === 'reveal');
  await observer.locator('#dismissTunnel').click(); await spectator.locator('#dismissTunnel').click();
  assert.equal(await actor.locator('#dismissTunnel').count(), 0);
  assert.deepEqual(await observer.evaluate(() => ({ zoom, mapCenter })), observerCamera);
  const stats = await observer.evaluate(() => board3D.stats().tunnelCards);
  assert.equal(stats.visible, true); assert.equal(stats.cards.length, 3);
  await observer.waitForFunction(() => game.sharedTunnel?.stage === 'decision');
  assert.equal(await observer.locator('#overlay').isVisible(), false);
  assert.equal(await spectator.locator('#overlay').isVisible(), false);
  assert.deepEqual(await observer.evaluate(() => board3D.stats().tunnelCards.cards.map(c => c.color)), tunnel.game.pending.revealed);
  await observer.screenshot({ path: path.join(out, 'tunnel-on-board.png') });
  await observer.setViewportSize({ width: 390, height: 844 });
  await observer.screenshot({ path: path.join(out, 'tunnel-mobile.png') });
  assert.equal(await observer.locator('#viewTunnel').isVisible(), true);
  await spectator.locator('#viewTunnel').click();
  assert.equal(await spectator.locator('#overlay').isVisible(), true);
  assert.equal(await spectator.locator('#tunnelSequence .tunnel-reveal .traincard').count(), 3);
  await spectator.locator('#dismissTunnel').click();
  await actor.locator('#acceptTunnel').click();
  await observer.waitForFunction(() => game.sharedTunnel?.stage === 'result');
  assert.equal(await observer.locator('#overlay').isVisible(), false);
  assert.equal(tunnel.game.current, 0);
  await observer.screenshot({ path: path.join(out, 'tunnel-result-on-board.png') });
  await observer.waitForFunction(() => !game.sharedTunnel && game.current === 1);
  assert.equal(await observer.evaluate(() => board3D.stats().tunnelCards.visible), false);
  assert.equal(await observer.locator('#tunnelBoardNotice').isVisible(), false);
  report.checks.push('Tunnel cards on board, preserved camera, observer/spectator dismissal through all stages, reopen without replay, actor decision and server turn timing');
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(error => { report.failure = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  if (browser) await browser.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
});
