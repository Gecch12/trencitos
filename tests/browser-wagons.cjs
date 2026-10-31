// Actual Three.js renderer in Chrome. The catalog is a local QA fixture, not an app route.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { start } = require('./helpers/threejs-preview');
const out = path.resolve(__dirname, '../docs/qa');
(async () => {
  const { server, token, port } = await start(Number(process.env.QA_PORT || 3122));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const base = `http://127.0.0.1:${port}`;
  try {
    await page.goto(`${base}/?room=830104#recover=${token}`);
    await page.waitForFunction(() => game && board3D);
    assert.equal(await page.evaluate(() => board3D.stats().wagons), 225);
    await page.evaluate(() => setBoardMode(false));
    await page.reload(); await page.waitForFunction(() => game);
    assert.equal(await page.evaluate(() => !!board3D), false);
    await page.evaluate(() => setBoardMode(true));
    await page.waitForFunction(() => board3D?.stats().wagons === 225);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const before = await page.evaluate(() => board3D.stats());
    await page.evaluate(async () => { await setBoardMode(false); await setBoardMode(true); });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const after = await page.evaluate(() => board3D.stats());
    assert.equal(after.geometries, before.geometries); assert.equal(after.textures, before.textures);

    await page.route('**/__wagon-gallery', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><meta charset="utf-8"><title>Vagones · Trencitos</title><style>
      *{box-sizing:border-box}body{margin:0;background:#eee6d2;font-family:system-ui;color:#203e46}header{padding:42px 60px 0;height:140px}h1{margin:0;font-size:36px;letter-spacing:-1.4px}p{color:#5f716d;margin:10px 0}#stage{position:relative;width:1440px;height:900px}canvas{position:absolute;inset:0}.label{position:absolute;transform:translateX(-50%);text-align:center;font-size:17px;font-weight:650;white-space:nowrap}.label small{display:block;font-weight:450;font-size:13px;color:#65756e;margin-top:5px}
      </style><header><h1>Una familia de vagones</h1><p>Once colores · Cargas y siluetas propias · Piezas reales del tablero 3D</p></header><div id="stage"></div></html>` }));
    await page.goto(`${base}/__wagon-gallery`);
    const catalog = await page.evaluate(async () => {
      const { createBoard3D } = await import('/board-3d.js');
      const { WAGON_STYLES } = await import('/wagon-models.mjs');
      const container = document.getElementById('stage');
      const network = WAGON_STYLES.map((s, i) => ({ d: '', cells: [{ x: 38 + i % 4 * 72, y: 48 + Math.floor(i / 4) * 62, angle: -22 }] }));
      const map = { bounds: { x: 0, y: 0, width: 980, height: 660 }, land: ['M0 0H980V660H0Z'], details: [], cities: {} };
      const board = createBoard3D({ container, map, network, onFailure: e => { throw e; } });
      const routes = network.map((_, id) => ({ id, owner: id }));
      const marks = ['M0-2.8A2.8 2.8 0 1 0 0 2.8A2.8 2.8 0 1 0 0-2.8', 'M0-3L3 2H-3Z', 'M0-3L3 0 0 3-3 0Z'];
      const players = WAGON_STYLES.map((s, i) => ({ color: s.color, placed: [], mark: marks[i % 3] }));
      board.resize({ x: 0, y: 0, width: 290, height: 900 * 290 / 1440, scale: 290 / 1440 }); board.update({ routes, players });
      for (const [i, s] of WAGON_STYLES.entries()) {
        const cell = network[i].cells[0], p = board.project(cell.x, cell.y + 8, 0);
        const label = document.createElement('div'); label.className = 'label'; label.style.left = `${p.x}px`; label.style.top = `${p.y + 28}px`;
        label.innerHTML = `${s.label}<small>${['Rojo','Azul','Verde','Amarillo','Morado','Marrón','Dorado','Negro','Gris','Magenta','Turquesa'][i]}</small>`; container.append(label);
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const stats = board.stats();
      window.gallery = { board, network, routes, players };
      return stats;
    });
    assert.equal(catalog.wagons, 11); assert.equal(Object.keys(catalog.models).length, 11);
    await page.screenshot({ path: path.join(out, 'wagons-catalog.png'), fullPage: true });
    // Highlight/reset redraws all parts, preserving every model and owner.
    const reset = await page.evaluate(async () => {
      const { board, routes, players } = gallery;
      board.update({ routes, players, highlight: 6 });
      await new Promise(requestAnimationFrame);
      board.update({ routes, players }); await new Promise(requestAnimationFrame);
      return board.stats();
    });
    assert.deepEqual(reset.models, catalog.models); assert.equal(reset.geometries, catalog.geometries);
    assert.deepEqual(errors, []);
    const report = { date: new Date().toISOString(), browser: browser.version(), tests: ['3D default', '2D preference survives reload', '3D disposal/recreation resource counts stable', 'all 11 models render', 'highlight/reset preserves model counts'], catalog, dense: after, errors };
    fs.writeFileSync(path.join(out, 'wagons-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await context.close(); await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50));
