// Pixel regression: printed cells stay fixed while wagons hide, descend and settle.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-ground-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'state.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server'), out = path.resolve('.qa/ground-cells');
fs.mkdirSync(out, { recursive: true });
const report = { checks: [], errors: [] };
let browser, page;
(async () => {
  await app.ready; await new Promise((resolve, reject) => app.server.once('error', reject).listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.route('**/__ground-check', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html><meta charset="utf-8"><style>body{margin:0}#stage{position:relative;width:100vw;height:100vh}canvas{position:absolute;inset:0;width:100%;height:100%}.label{position:absolute;left:24px;color:#fff9e8;font:18px system-ui;pointer-events:none}</style>
    <div id="stage"></div><div class="label" style="top:130px">Ruta normal</div><div class="label" style="top:330px">Túnel</div><div class="label" style="top:530px">Ferri</div></html>` }));
  await page.goto(`http://127.0.0.1:${app.server.address().port}/__ground-check`);
  await page.evaluate(async () => {
    const { createBoard3D } = await import('/board-3d.js');
    const container = document.getElementById('stage');
    const routes = [
      { id: 0, color: 'red', owner: null, tunnel: false, ferry: 0 },
      { id: 1, color: 'gray', owner: null, tunnel: true, ferry: 0 },
      { id: 2, color: 'gray', owner: null, tunnel: false, ferry: 2 },
    ];
    const network = routes.map((r, i) => ({ id: r.id, d: `M80 ${50 + i * 60}H245`, points: [[80, 50 + i * 60], [245, 50 + i * 60]],
      cells: [105, 160, 215].map(x => ({ x, y: 50 + i * 60, angle: 0, width: 22, height: 8.5 })) }));
    const map = { bounds: { x: 0, y: 0, width: 300, height: 220 }, land: [], details: [], cities: {} };
    const board = createBoard3D({ container, map, network, onFailure: error => { throw error; } });
    const players = [{ color: '#782f49', placed: [], wagon: { model: 'wine' } }];
    const view = { x: 0, y: 5, width: 300, height: 210 / Math.cos(Math.PI / 7), scale: .3 };
    const gl = container.querySelector('canvas').getContext('webgl2');
    const points = network.flatMap(route => route.cells.map(cell => [cell.x, cell.y, .16]));
    // The outer tunnel marks are outside the wagon footprint even after landing.
    const marks = network[1].cells.map(cell => [cell.x - 8, cell.y + 5.5, .24]);
    const pixel = ([x, y, z]) => {
      const p = board.project(x, y, z), data = new Uint8Array(4);
      gl.readPixels(Math.floor(p.x * 2), gl.drawingBufferHeight - 1 - Math.floor(p.y * 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return [...data];
    };
    const snapshot = () => ({ ground: board.stats().ground, cells: points.map(pixel), marks: marks.map(pixel), animations: board.stats().animations });
    const update = () => board.update({ routes, players, routeColors: { red: '#cd4b42', gray: '#929da5' }, spotlight: { routes: [0, 1, 2], endpoints: [] } });
    board.resize(view); update();
    window.groundFixture = {
      board, view, routes, update, snapshot,
      capture() { board.resize(view); return new Promise(resolve => requestAnimationFrame(() => resolve(snapshot()))); },
      async build() {
        routes.forEach(route => { route.owner = 0; }); update();
        routes.forEach(route => board.animateConstruction({ routeId: route.id }, null, { delay: 500, duration: 500, hideDuringDelay: true }));
        return new Promise((resolve, reject) => {
          const frames = [];
          function sample() {
            try {
              frames.push(snapshot());
              if (board.stats().animations.length) requestAnimationFrame(sample);
              else resolve(frames);
            } catch (error) { reject(error); }
          }
          requestAnimationFrame(sample);
        });
      },
    };
  });
  const before = await page.evaluate(() => groundFixture.capture());
  assert.deepEqual(before.ground, { cells: 9, edges: 9, tunnelMarks: 24, ferryMarks: 2 });
  await page.screenshot({ path: path.join(out, 'before.png') });
  const frames = await page.evaluate(() => groundFixture.build());
  const hidden = frames.filter(frame => frame.animations.length && frame.animations.every(a => !a.visible));
  const moving = frames.filter(frame => frame.animations.some(a => a.visible && a.maxLift > 1));
  assert.ok(hidden.length > 2 && moving.length > 2, 'sample preparation and descent');
  for (const frame of frames) assert.deepEqual(frame.ground, before.ground, 'same printed geometry in every frame');
  for (const frame of hidden) {
    assert.deepEqual(frame.cells, before.cells, 'normal, tunnel and ferry cells remain visibly fixed while wagons are hidden');
    assert.deepEqual(frame.marks, before.marks, 'tunnel marks remain visibly fixed');
  }
  const after = frames.at(-1);
  assert.deepEqual(after.marks, before.marks, 'uncovered tunnel marks remain visible after occupation');
  assert.ok(after.cells.every((pixel, i) => pixel.some((channel, c) => channel !== before.cells[i][c])), 'wagons cover the cells at ground level');
  await page.screenshot({ path: path.join(out, 'occupied.png') });
  report.checks.push({ name: 'Permanent normal, tunnel and ferry ground beneath physical wagons', frames: frames.length, hidden: hidden.length, descending: moving.length });
  // Move the camera and restore the same view: geometry must not accumulate.
  await page.evaluate(() => { groundFixture.board.resize({ ...groundFixture.view, width: 240, scale: .24 }); });
  const restored = await page.evaluate(() => groundFixture.capture());
  assert.deepEqual(restored.cells, after.cells); assert.deepEqual(restored.ground, before.ground);
  report.checks.push({ name: 'Zoom and return preserve the occupied board without duplicated cells' });
  await page.evaluate(() => groundFixture.board.dispose());
  assert.deepEqual(report.errors, []); report.passed = true;
})().catch(async error => {
  report.failure = error.stack; process.exitCode = 1; console.error(error);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
}).finally(async () => {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  if (browser) await browser.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
});
