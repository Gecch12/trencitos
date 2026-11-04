// Compare rendered pixels across the map boundary throughout focus transitions.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-background-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'state.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server'), E = require('../backend/engine');
const { ownershipRoom } = require('./helpers/ownership-preview');
const out = path.resolve(process.env.QA_OUT || '.qa/map-background');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [] };
let browser, page;

(async () => {
  await app.ready; await new Promise((resolve, reject) => app.server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });

  const room = ownershipRoom('QABKG1'); room.practice = false;
  room.members[0].token = 'a'.repeat(48);
  room.game.players[0].tickets = [E.TICKETS[2], E.TICKETS[8]];
  room.game.turnDeadline = Date.now() + 3600000; app.rooms.set(room.code, room);
  await page.goto(`${base}/?room=${room.code}#recover=${room.members[0].token}`);
  await page.waitForFunction(() => !!board3D && !!game);
  await page.locator('#toggleDestinations').click();
  await page.waitForFunction(() => board3D.stats().shadingStrength === 1);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('destinationSpotlight')).opacity === '1');
  await page.screenshot({ path: path.join(out, 'highlight-europe.png') });
  assert.equal(await page.locator('#toggleDestinations').getAttribute('aria-pressed'), 'true');
  report.checks.push({ name: 'Live destination highlight renders on the shared board' });

  // Exercise the production renderer with real geography and a future inland layout.
  // The test page is intercepted locally; it is never part of the public app.
  await page.route('**/__background-check', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html><meta charset="utf-8"><style>body{margin:0}#stage{position:relative;width:100vw;height:100vh}canvas{position:absolute;inset:0;width:100%;height:100%}</style>
    <div id="stage"></div><script src="/layouts/europe-v1.js"></script><script src="/layouts/south-america-v3.3-beta.js"></script><script src="/map-layout.js"></script></html>` }));
  await page.goto(`${base}/__background-check`);
  await page.evaluate(async () => {
    const { createBoard3D } = await import('/board-3d.js');
    const container = document.getElementById('stage');
    window.backgroundFixture = {
      create(kind) {
        this.board?.dispose();
        const layout = kind === 'south-america' ? SouthAmericaLayoutV33 : kind === 'europe' ? EuropeLayoutV1 : {
          // Fractional bounds also exercise rounded texture dimensions.
          bounds: { x: -17.5, y: -22.5, width: 610.25, height: 410.75 }, cities: {},
          background: { surface: 'land', ...(kind === 'custom' ? { color: '#c4ad83' } : {}) },
        };
        this.map = RailMap.createLayout(layout);
        this.board = createBoard3D({ container, map: this.map, network: [], onFailure: error => { throw error; } });
        this.resize();
        this.board.update({ routes: [], players: [] });
      },
      resize(zoom = 1) {
        const b = this.map.bounds, scale = Math.max(b.width / (container.clientWidth * .7), b.height * Math.cos(Math.PI / 7) / (container.clientHeight * .7)) / zoom;
        const width = container.clientWidth * scale, height = container.clientHeight * scale / Math.cos(Math.PI / 7);
        this.view = { x: b.x + (b.width - width) / 2, y: b.y + (b.height - height) / 2, width, height, scale };
        this.board.resize(this.view);
      },
      async capture(strength, duration = 0, interruptAt = null) {
        const board = this.board, b = this.map.bounds;
        const canvas = container.querySelector('canvas'), gl = canvas.getContext('webgl2');
        const pairs = [
          [[b.x + 8, b.y + 8], [b.x - 8, b.y + 8]],
          [[b.x + 8, b.y + 8], [b.x + 8, b.y - 8]],
          [[b.x + b.width - 8, b.y + 8], [b.x + b.width + 8, b.y + 8]],
          [[b.x + 8, b.y + b.height - 8], [b.x + 8, b.y + b.height + 8]],
        ];
        const pixel = ([x, y]) => {
          const p = board.project(x, y, -.1), ratio = canvas.width / container.clientWidth;
          const px = Math.floor(p.x * ratio), py = canvas.height - 1 - Math.floor(p.y * ratio);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) throw Error('Sample outside viewport');
          const rgba = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
          return [...rgba];
        };
        const update = value => board.update({ routes: [], players: [], spotlight: value ? { routes: [], endpoints: [], strength: value } : null, transitionMs: duration });
        let lastDraw = board.stats().draws, interrupted = false;
        board.resize(this.view); update(strength);
        return new Promise((resolve, reject) => {
          const frames = [];
          function sample() {
            try {
              const stats = board.stats();
              if (stats.draws !== lastDraw) {
                frames.push({ strength: stats.shadingStrength, pairs: pairs.map(pair => pair.map(pixel)) });
                lastDraw = stats.draws;
              }
              if (interruptAt !== null && !interrupted && stats.shadingStrength >= interruptAt) {
                interrupted = true; update(0);
              }
              if (!board.stats().shadingAnimating) resolve(frames);
              else requestAnimationFrame(sample);
            } catch (error) { reject(error); }
          }
          requestAnimationFrame(sample);
        });
      },
    };
  });

  function check(name, frames, animated = false) {
    assert.ok(frames.length, `${name}: sampled rendered frames`);
    if (animated) assert.ok(frames.some(frame => frame.strength > .01 && frame.strength < .99), `${name}: intermediate frames`);
    let maxDifference = 0;
    for (const frame of frames) for (const [inside, outside] of frame.pairs) {
      assert.equal(inside[3], 255, `${name}: opaque map pixel`);
      assert.equal(outside[3], 255, `${name}: opaque exterior pixel`);
      const difference = Math.max(...inside.slice(0, 3).map((value, i) => Math.abs(value - outside[i])));
      maxDifference = Math.max(maxDifference, difference);
      assert.ok(difference <= 1, `${name}: seam at strength ${frame.strength}: ${inside} / ${outside}`);
    }
    report.checks.push({ name, frames: frames.length, maxDifference });
  }
  for (const kind of ['europe', 'south-america', 'land', 'custom']) {
    await page.evaluate(kind => backgroundFixture.create(kind), kind);
    for (const [name, strength, duration] of [['normal', 0, 0], ['darkening', 1, 500], ['restoring', 0, 350], ['partial', .5, 180]]) {
      check(`${kind}: ${name}`, await page.evaluate(([strength, duration]) => backgroundFixture.capture(strength, duration), [strength, duration]), duration > 0);
    }
    await page.evaluate(() => backgroundFixture.capture(0));
    check(`${kind}: interrupted transition`, await page.evaluate(() => backgroundFixture.capture(1, 500, .25)), true);
    if (kind === 'land' || kind === 'custom') {
      const frames = await page.evaluate(() => backgroundFixture.capture(0));
      const expected = kind === 'land' ? [238, 230, 210] : [196, 173, 131];
      assert.deepEqual(frames.at(-1).pairs[0][0].slice(0, 3), expected);
      await page.evaluate(() => backgroundFixture.capture(1));
      await page.screenshot({ path: path.join(out, `highlight-${kind}.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { backgroundFixture.create('land'); backgroundFixture.resize(1.15); });
  check('land: mobile zoom darkening', await page.evaluate(() => backgroundFixture.capture(1, 500)), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => backgroundFixture.capture(0, 350));
  check('land: reduced motion', reduced);
  assert.ok(reduced.every(frame => frame.strength === 0));
  await page.evaluate(() => backgroundFixture.board.dispose());
  assert.equal(await page.locator('#stage').evaluate(element => element.style.backgroundColor), '');
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(async error => {
  report.failure = error.stack; process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
}).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  if (browser) await browser.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
});
