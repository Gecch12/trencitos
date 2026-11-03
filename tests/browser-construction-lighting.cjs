// Authoritative builds in isolated rooms, with frame-by-frame lighting evidence.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-construction-lighting-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'state.json'), AUTH_ENABLED: 'false' });
const E = require('../backend/engine'), { ownershipRoom } = require('./helpers/ownership-preview');
const app = require('../backend/server'), out = path.resolve('.qa/construction-lighting');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [], date: new Date().toISOString() };
let browser, page;
(async () => {
  await app.ready; await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { window.recordLighting = false; });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
  async function open(code, reduced = false, actorSeat = 0) {
    const room = ownershipRoom(code); room.practice = false; room.visibility = 'private'; room.maxPlayers = 5;
    room.members[0].token = 'a'.repeat(48);
    room.game.players[0].tickets = [E.TICKETS[2], E.TICKETS[8]];
    room.members[1].token = 'b'.repeat(48);
    if (actorSeat) { room.game.current=actorSeat; room.game.players[actorSeat].hand.push(...room.game.players[0].hand.splice(0)); }
    room.game.turnDeadline = Date.now() + 90000; app.rooms.set(code, room);
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.goto(`http://127.0.0.1:${app.server.address().port}/?room=${code}#recover=${room.members[0].token}`);
    await page.waitForFunction(actorSeat => !!game && !!board3D && game.current === actorSeat, actorSeat);
    await page.mouse.move(10, 10);
    return room;
  }
  async function prepare(station = false, acting = page) {
    const target = await acting.evaluate(station => {
      const target = station ? { city: 'PAR' } : { routeId: game.routes.find(r => !r.tunnel && !GameUI.construction(game, seat, { routeId: r.id }).reason).id };
      uiDialog = 'build'; buildTarget = target; showBuildDialog(); return target;
    }, station);
    return target;
  }
  async function record() {
    await page.evaluate(() => {
      window.lightingSamples = []; recordLighting = true;
      function sample(t) {
        const s = board3D.stats();
        lightingSamples.push({ t, shade: s.shadingStrength, moving: s.shadingAnimating, animations: s.animations, focus: !!constructionFocus, routes: s.spotlightRoutes });
        if (recordLighting) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  }
  async function finished() {
    await page.waitForFunction(() => !constructionFocus && !board3D.stats().shadingAnimating && !board3D.stats().animations.length && !constructionBusy());
    return page.evaluate(() => { recordLighting = false; return lightingSamples; });
  }
  async function construction(name, { station = false, highlight = false, opponent = false } = {}) {
    const room=await open(name, false, opponent?1:0);
    let acting=page;
    if(opponent){acting=await context.newPage();await acting.goto(`http://127.0.0.1:${app.server.address().port}/?room=${name}#recover=${room.members[1].token}`);await acting.waitForFunction(()=>!!game&&seat===1&&!!board3D);}
    if (highlight) await page.locator('#toggleDestinations').click();
    const target = await prepare(station,acting);
    await record(); await acting.locator('#confirmBuild').click();
    await page.waitForFunction(() => board3D.stats().animations.length > 0);
    if (!highlight) {
      await page.waitForFunction(() => board3D.stats().shadingStrength > .05 && board3D.stats().shadingStrength < .95);
      await page.screenshot({ path: path.join(out, `${name}-shading.png`) });
    }
    const samples = await finished(), active = samples.filter(s => s.animations.length);
    const hidden = active.filter(s => !s.animations[0].visible), shown = active.filter(s => s.animations[0].visible);
    assert.ok(hidden.length > 2, 'pieces stay hidden during the preparation');
    assert.ok(shown.length > 2, 'existing placement animation remains visible');
    assert.ok(shown[0].t - hidden[0].t >= 450, '500ms shade precedes appearance');
    assert.ok(shown.every(s => s.shade > .999), 'pieces appear only after shading is complete');
    if(opponent)assert.ok(shown.every(s=>s.routes.includes(target.routeId)),'rival construction stays illuminated during landing');
    const lifts = shown.map(s => s.animations[0].maxLift);
    assert.ok(lifts[0] > 10 && lifts.at(-1) < 1, 'existing raised start and landing');
    assert.ok(lifts.every((n, i) => !i || n <= lifts[i - 1] + .01), 'existing continuous descent');
    assert.ok(shown.at(-1).t - shown[0].t > 350 && shown.at(-1).t - shown[0].t < 600, 'existing 500ms flight duration');
    const ending = samples.filter(s => s.t > active.at(-1).t);
    if (highlight) {
      assert.ok(ending.every(s => s.shade === 1), 'active destination highlight survives construction');
      assert.equal(await page.locator('#toggleDestinations').getAttribute('aria-pressed'), 'true');
    } else {
      const returning = ending.filter(s => s.moving && s.shade > .001 && s.shade < .999);
      assert.ok(returning.length > 3, 'restoration has intermediate colors');
      assert.ok(returning.at(-1).t - returning[0].t >= 250, '350ms restoration is not clamped to a short fade');
      assert.equal(samples.at(-1).shade, 0);
    }
    if(opponent){assert.ok(!samples.at(-1).routes.includes(target.routeId),'rival route returns to the persistent highlight');await acting.close();}
    await page.screenshot({ path: path.join(out, `${name}-settled.png`) });
    fs.writeFileSync(path.join(out, `${name}-frames.json`), JSON.stringify(samples));
    report.checks.push({ name, target, frames: samples.length, appearanceAfterMs: Math.round(shown[0].t - hidden[0].t), flightMs: Math.round(shown.at(-1).t - shown[0].t), highlight });
    await page.reload(); await page.waitForFunction(() => !!board3D && !!game);
    assert.deepEqual(await page.evaluate(() => board3D.stats().animations), [], 'reconnect does not repeat construction');
  }
  await construction('QALIT1');
  await construction('QALIT2', { station: true });
  await construction('QALIT3', { highlight: true });
  await construction('QALIT6', { highlight: true, opponent: true });

  await open('QALIT4', true); const reducedTarget = await prepare();
  await page.locator('#confirmBuild').click();
  await page.waitForFunction(id => game.routes.find(r => r.id === id).owner === seat, reducedTarget.routeId);
  assert.deepEqual(await page.evaluate(() => board3D.stats().animations), []);
  assert.equal(await page.evaluate(() => board3D.stats().shadingAnimating), false);
  assert.equal(await page.evaluate(() => board3D.stats().shadingStrength), 0);
  report.checks.push({ name: 'Reduced motion presents the final state immediately' });

  await open('QALIT5'); await prepare(); await page.locator('#confirmBuild').click();
  await page.waitForFunction(() => board3D.stats().animations.some(a => !a.visible));
  await page.setViewportSize({ width: 1000, height: 740 });
  await page.waitForFunction(() => !constructionFocus && !board3D.stats().animations.length);
  assert.equal(await page.evaluate(() => board3D.stats().shadingStrength), 0);
  await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(() => board3D.stats().shadingStrength), 0);
  report.checks.push({ name: 'Resize cancels pending appearance and lighting without leaving a stale timer' });
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(async error => {
  report.failure = error.stack; process.exitCode = 1; console.error(error);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
}).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  if (browser) await browser.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
});
