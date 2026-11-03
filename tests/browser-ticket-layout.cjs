// Real bot worker, HTTP/WebSocket and Chrome with a disposable local file backend.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const E = require('../backend/engine'), { plan } = require('../frontend/destination-planner');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-ticket-layout-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'state.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server'), out = path.resolve('.qa/ticket-layout');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], measurements: [], date: new Date().toISOString() };
let browser;

function fixture(code, mapRef) {
  let seed = 29;
  const random = max => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % max);
  const game = E.newGame(['Planificador', 'Bot 1', 'Bot 2', 'Bot 3'], 0, Date.now(),
    { turnSeconds: 90, ticketExtraSeconds: 30, initialSeconds: 90 }, { mapRef, random });
  const tickets = E.contextFor(game).tickets;
  // A long owned list, mixing completed and pending destinations as in the report.
  game.players.forEach((player, i) => { player.pending = []; player.tickets = tickets.slice(i ? 10 + (i - 1) * 2 : 0, i ? 12 + (i - 1) * 2 : 10); });
  game.shortDeck = tickets.filter(t => !t.long && !game.players.some(p => p.tickets.some(owned => owned.id === t.id)));
  const completed = plan(game, 0, game.players[0].tickets[0], { doubleRoutesMinPlayers: 4 });
  for (const id of completed.routes) {
    const route = game.routes.find(r => r.id === id); route.owner = 0;
    game.players[0].trains -= route.n; game.players[0].score += E.SCORE[route.n];
  }
  // Preserve the card supply while giving each bot enough cards to build now.
  const cards = [...game.deck, ...game.face, ...game.players.flatMap(p => p.hand)];
  const take = color => { const index = cards.indexOf(color); assert.ok(index >= 0); return cards.splice(index, 1)[0]; };
  game.players[0].hand = ['yellow', 'purple', 'yellow', 'purple'].map(take);
  for (const [i, colors] of [['orange', 'blue'], ['white', 'red'], ['black', 'green']].entries())
    game.players[i + 1].hand = colors.flatMap(color => Array.from({ length: 8 }, () => take(color))).concat([take('wild'), take('wild')]);
  game.face = ['yellow', 'purple', 'yellow', 'purple', 'wild'].map(take); game.deck = cards;
  game.phase = 'play'; E.ensureTiming(game);
  return { code, mapRef, game, updated: Date.now(), visibility: 'private', maxPlayers: 4,
    members: game.players.map((p, i) => ({ name: p.name, ...(i ? { bot: true } : { token: 'layout-human' }) })) };
}

async function measure(p, label) {
  const value = await p.evaluate(() => {
    const dialog = document.querySelector('#dialog'), list = document.querySelector('.ticket-collections');
    const d = dialog.getBoundingClientRect(), button = document.querySelector('.ticket-confirm button').getBoundingClientRect();
    return { height: d.height, scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight,
      top: d.top, bottom: d.bottom, viewport: innerHeight, width: innerWidth,
      buttonTop: button.top, buttonBottom: button.bottom,
      listHeight: list.clientHeight, listScrollHeight: list.scrollHeight,
      canvases: document.querySelectorAll('#ticketMap canvas').length };
  });
  report.measurements.push({ label, ...value });
  assert.ok(value.scrollHeight <= value.clientHeight + 1, `${label}: no outer blank overflow ${JSON.stringify(value)}`);
  assert.ok(value.top >= 0 && value.bottom <= value.viewport, `${label}: modal fits viewport`);
  assert.ok(value.buttonTop >= value.top && value.buttonBottom <= value.bottom, `${label}: confirmation stays visible`);
  assert.ok(value.listHeight > 45 && value.listScrollHeight > value.listHeight, `${label}: long list scrolls internally`);
  assert.equal(value.canvases, 1);
  return value;
}

(async () => {
  await app.ready; await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [code, mapRef] of [['QALAY1', { id: 'europe', version: '1' }], ['QALAY2', { id: 'south-america', version: '3.3-beta' }]]) {
    const room = fixture(code, mapRef); app.rooms.set(code, room);
    const context = await browser.newContext({ viewport: { width: 1340, height: 880 } });
    await context.addInitScript(code => localStorage.setItem(`rr-room-${code}`, 'layout-human'), code);
    const p = await context.newPage(); p.setDefaultTimeout(15000);
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
    await p.goto(`http://127.0.0.1:${app.server.address().port}/?room=${code}`);
    await p.waitForFunction(() => !!game && !!board3D);
    await p.locator('#drawtickets').click();
    await p.waitForFunction(() => !!game.ticketOffer && !!ticketMapView);
    assert.equal(await p.locator('.ticket-eye:checked').count(), 10);
    assert.equal(await p.locator('.retained-choice.is-highlighted').count(), 10);
    assert.ok(await p.locator('.retained-choice.is-complete .ticket-eye:checked').count() > 0);
    assert.ok(await p.locator('.retained-choice:not(.is-complete) .ticket-eye:checked').count() > 0);
    assert.equal(await p.locator('.keep:checked').count(), 0);
    assert.equal(await p.locator('#keep').isEnabled(), false);
    await measure(p, `${mapRef.id}: offered, all owned checked`);
    await p.locator('.ticket-eye').first().uncheck();
    await p.locator('.keep').first().check();
    await p.locator('#ticketZoomIn').click(); await p.mouse.move(5, 5);
    const before = await p.evaluate(() => {
      window.layoutOriginalOffer = game.ticketOffer.id;
      return { retained: [...retainedVisible], choices: [...ticketChoices], camera: structuredClone(ticketMapCamera) };
    });
    // The real server's worker chooses and submits moves for all three bots.
    await p.waitForFunction(() => game.routes.filter(r => r.owner !== null && r.owner !== seat).length >= 2,
      null, { timeout: 45000 });
    await p.waitForFunction(() => game.current === seat && game.turnWaiting && !game.sharedTunnel,
      null, { timeout: 45000 });
    assert.equal(await p.locator('#dialog.ticket-dialog').isVisible(), true);
    assert.deepEqual(await p.evaluate(() => ({ retained: [...retainedVisible], choices: [...ticketChoices], camera: structuredClone(ticketMapCamera) })), before);
    assert.equal(await p.evaluate(() => game.ticketOffer.id === layoutOriginalOffer), true);
    const builds = await p.evaluate(() => game.routes.filter(r => r.owner !== null && r.owner !== seat).map(r => ({ id: r.id, owner: r.owner })));
    report.checks.push(`${mapRef.id}: ${builds.length} routes built by real bots while the same offer stays open; choices and camera preserved`);
    await measure(p, `${mapRef.id}: after bot constructions`);
    // Scroll to the end of the long list: no empty tail may escape into the dialog.
    await p.locator('.ticket-collections').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await measure(p, `${mapRef.id}: end of list`);
    await p.screenshot({ path: path.join(out, `${mapRef.id}-bots-desktop.png`) });
    for (const [width, height] of [[1280, 720], [768, 1024], [390, 844], [844, 390]]) {
      await p.setViewportSize({ width, height });
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await measure(p, `${mapRef.id}: ${width}x${height}`);
      await p.locator('.ticket-eye').last().focus(); await p.keyboard.press('Space');
      assert.equal(await p.locator('.ticket-eye').last().isChecked(), false);
      await p.keyboard.press('Space');
      await p.screenshot({ path: path.join(out, `${mapRef.id}-${width}x${height}.png`) });
    }
    // Confirm only the offered choice through the regular action; owned tickets survive.
    const owned = room.game.players[0].tickets.map(t => t.id), offered = room.game.players[0].offer.tickets[0].id;
    // The server advances the seat before the last construction animation ends.
    await p.waitForFunction(() => !constructionBusy() && !pendingAction);
    await p.locator('#keep').click();
    await p.waitForFunction(() => !game.ticketOffer).catch(async error => {
      report.confirmationFailure = await p.evaluate(() => ({ phase: game.phase, offer: game.ticketOffer,
        choices: [...ticketChoices], toast: document.querySelector('#toast').textContent,
        error: document.querySelector('#errorMsg')?.textContent }));
      await p.screenshot({ path: path.join(out, 'confirmation-failure.png') }); throw error;
    });
    assert.deepEqual(room.game.players[0].tickets.map(t => t.id), [...owned, offered]);
    report.checks.push(`${mapRef.id}: all 10 owned destinations prechecked, including completed; independent new choice; desktop/tablet/mobile/landscape layout and keyboard checked`);
    await context.close();
  }
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(error => { report.failure = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  await browser?.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
});
