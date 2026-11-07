// Permanent bot, live WebSocket views, reconnect and closed HTTP replay.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {chromium} = require('playwright'), E = require('../backend/engine');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-bot-privacy-'));
Object.assign(process.env, {STATE_BACKEND:'file', STATE_FILE:path.join(temp, 'state.json'), AUTH_ENABLED:'false'});
const app = require('../backend/server'), out = path.resolve(process.env.QA_OUT || '.qa/bot-draw-privacy');
fs.mkdirSync(out, {recursive:true});
const report = {checks:[], errors:[]}; let browser;
(async () => {
  await app.ready; await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const game = E.newGame(['Humano', 'Bot QA']);
  for (const seat of [0, 1]) E.action(game, seat, {type:'choose_initial', indexes:[0, 1]});
  // The public market was exhausted; paid cards are available to recycle.
  // The real policy must draw blindly without changing the map definition.
  game.discard.push(...game.deck, ...game.face, ...game.players.flatMap(p => p.hand));
  game.deck = []; game.face = [];
  game.players.forEach(p => { p.hand = []; p.tickets = []; });
  game.current = 1; game.turnDeadline = Date.now() + 600000;
  const room = {code:'QABOTP', game, updated:Date.now(), visibility:'public', maxPlayers:2, archiveFull:true,
    members:[{name:'Humano', token:'qa-bot-privacy'}, {name:'Bot QA', bot:true}]};
  app.rooms.set(room.code, room);
  browser = await chromium.launch({channel:'chrome', headless:true});
  async function page(watch) {
    const p = await browser.newPage({viewport:{width:1440, height:1000}}); p.setDefaultTimeout(15000);
    p.on('pageerror', e => report.errors.push(e.message));
    p.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
    if (!watch) await p.addInitScript(() => localStorage.setItem('rr-room-QABOTP', 'qa-bot-privacy'));
    await p.goto(base + '/?' + (watch ? 'watch=' : 'room=') + room.code);
    try { await p.waitForFunction(() => !!game && !!board3D); }
    catch (error) { report.connection = await p.evaluate(() => ({text:document.body.innerText, state:typeof game === 'undefined' ? null : game?.phase})); throw error; }
    return p;
  }
  const human = await page(false), spectator = await page(true);
  const drawn = p => p.locator('.turn-history-row[data-actor="1"] .history-drawn-cards img');
  for (const p of [human, spectator]) {
    await p.waitForFunction(() => game.current === 0 && game.turnHistory.flatMap(r => r.events).filter(e => e.type === 'draw' && e.seat === 1).length === 2);
    assert.deepEqual(await drawn(p).evaluateAll(imgs => imgs.map(i => i.getAttribute('src'))), Array(2).fill('/assets/cards/back.svg'));
    assert.equal(await p.evaluate(() => {
      const events = game.turnHistory.flatMap(r => r.events).filter(e => e.type === 'draw' && e.seat === 1);
      return events.every(e => e.actor === 'bot' && e.data.index === -1 && !('color' in e.data)) &&
        game.history.filter(e => e.seat === 1 && e.draw).every(e => !('color' in e.draw)) &&
        !('color' in game.drawEvent);
    }), true);
  }
  const colors = room.game.journal.filter(e => e.type === 'draw' && e.seat === 1).map(e => e.data.color);
  assert.equal(colors.length, 2); assert.ok(colors.every(c => [...E.COLORS, 'wild'].includes(c)));
  const matchId = room.matchId;
  assert.equal((await human.request.get(base + '/api/history/' + matchId)).status(), 409);
  await human.reload(); await human.waitForFunction(() => !!game && game.current === 0);
  assert.deepEqual(await drawn(human).evaluateAll(imgs => imgs.map(i => i.getAttribute('src'))), Array(2).fill('/assets/cards/back.svg'));
  await human.locator('.history-panel').screenshot({path:path.join(out, 'bot-live.png')});
  report.checks.push('Real permanent bot chose two blind draws; human/spectator receive no colors, thumbnails stay hidden after reload; active replay is unavailable');
  E.finish(room.game); await human.reload(); await human.waitForFunction(() => game.phase === 'finished');
  assert.deepEqual(await drawn(human).evaluateAll(imgs => imgs.map(i => i.getAttribute('src'))), Array(2).fill('/assets/cards/back.svg'));
  const replay = await browser.newPage({viewport:{width:1440, height:1000}});
  replay.setDefaultTimeout(15000);
  replay.on('pageerror', e => report.errors.push(e.message));
  await replay.goto(base + '/replay?id=' + matchId);
  await replay.waitForFunction(() => !!game && document.getElementById('replayProgress')?.hidden);
  await replay.locator('#replayLast').click();
  for (const seat of [0, 1]) {
    await replay.locator(`#scores [data-player="${seat}"] .player-avatar`).click();
    assert.deepEqual(await replay.locator('.history-drawn-cards img').evaluateAll(imgs => imgs.map(i => i.getAttribute('src'))), colors.map(c => '/assets/cards/' + c + '.svg'));
  }
  await replay.locator('.history-panel').screenshot({path:path.join(out, 'bot-replay.png')});
  report.checks.push('Public closed replay reveals the exact bot draw colors in both human and bot perspectives');
  assert.deepEqual(report.errors, []);
})().then(() => console.log(JSON.stringify(report))).catch(error => {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
}).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close(); await app.shutdown(); fs.rmSync(temp, {recursive:true, force:true});
});
