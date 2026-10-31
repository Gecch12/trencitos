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
    await page.goto(base);
    await page.locator('#homeTabPractice').click();
    const { WAGON_STYLES } = await import('../wagon-models.mjs');
    const refinedModels = ['coal', 'stone', 'steel', 'mail', 'goods'];
    for (const style of WAGON_STYLES) {
      await page.locator(`#practiceColors [data-color="${style.color}"]`).click();
      await page.waitForFunction(model => document.getElementById('wagonPreview').dataset.model === model, style.model);
      assert.equal(await page.locator('#wagonPreviewStage canvas').count(), 1);
      assert.equal(await page.locator('#wagonPreviewName').innerText(), style.label);
      if (refinedModels.includes(style.model)) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator('#wagonPreview').screenshot({path:path.join(out,`wagon-${style.model}.png`)});
      }
    }
    await page.locator('#practiceColors [data-color="#b88929"]').click();
    await page.waitForFunction(() => document.getElementById('wagonPreview').dataset.model === 'auto-carrier');
    await page.waitForTimeout(150);
    await page.screenshot({path:path.join(out,'wagon-preview-desktop.png'),fullPage:true});
    await page.locator('#wagonPreview').screenshot({path:path.join(out,'wagon-preview-detail.png')});
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'wagon-preview-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1060});
    await page.locator('#homeTabCreate').click();
    assert.equal(await page.locator('#wagonPreviewStage canvas').count(),0);
    await page.locator('#createCode').fill('838301'); await page.locator('#create').click();
    await page.waitForFunction(()=>!!room && !!wagonPreview);
    assert.equal(await page.locator('#roompanel #wagonPreview').count(),1);
    await page.locator('#roomColors [data-color="#458ad4"]').click();
    await page.waitForFunction(()=>document.getElementById('wagonPreview').dataset.model==='tanker' && members[seat].color==='#458ad4');
    await page.evaluate(()=>localStorage.setItem('rr-board','2d'));
    await page.goto(`${base}/?room=830104&board=2d#recover=${token}`);
    await page.waitForFunction(() => game && board3D);
    assert.equal(await page.evaluate(() => board3D.stats().wagons), 225);
    assert.equal(await page.locator('#boardMode').count(),0);
    assert.equal(await page.locator('.avatar-insignia,.player-insignia,.ownership-mark,[data-symbol]').count(),0);
    assert.equal(await page.locator('#wagonPreviewStage canvas').count(),0);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const before = await page.evaluate(() => board3D.stats());
    await page.reload(); await page.waitForFunction(()=>game && board3D);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const after = await page.evaluate(() => board3D.stats());
    assert.equal(after.geometries,before.geometries); assert.equal(after.textures,before.textures);
    // Stress the revised families together at the full five-player piece bound.
    const refinedDense = await page.evaluate(async models => {
      const { WAGON_STYLES } = await import('/wagon-models.mjs');
      game.players.forEach((p, i) => { p.color = WAGON_STYLES.find(s => s.model === models[i]).color; });
      renderBoard(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return board3D.stats();
    }, refinedModels);
    assert.equal(refinedDense.wagons,225);
    assert.deepEqual(Object.keys(refinedDense.models).sort(),[...refinedModels].sort());
    await page.screenshot({path:path.join(out,'wagons-refined-board.png'),fullPage:true});
    const refinedPerformance = await page.evaluate(async () => {
      zoom = 1.8; mapCenter = {x:360,y:310}; applyZoom();
      const intervals = [], cpu = []; let previous = performance.now();
      for (let i = 0; i < 90; i++) {
        await new Promise(requestAnimationFrame); const now = performance.now();
        if (i > 10) intervals.push(now - previous); previous = now;
        const start = performance.now(); mapCenter.x += i % 2 ? -2 : 2; applyZoom();
        if (i > 10) cpu.push(performance.now() - start);
      }
      const summary = a => { a.sort((x,y)=>x-y); return {n:a.length,median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)]}; };
      const gl = document.querySelector('.board-3d-canvas').getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {cpuCameraMs:summary(cpu),frameIntervalMs:summary(intervals),renderer:debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)};
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const idleDraws = await page.evaluate(() => board3D.stats().draws);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => board3D.stats().draws),idleDraws);

    const unavailable = await context.newPage();
    await unavailable.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type.startsWith('webgl') && !window.allow3D) return null;
        return original.call(this, type, ...args);
      };
    });
    await unavailable.goto(`${base}/?room=830103#recover=${token}`);
    await unavailable.waitForFunction(() => game && board3DFailed);
    assert.equal(await unavailable.locator('#boardStatus').isVisible(), true);
    assert.equal(await unavailable.locator('#board').isVisible(), false);
    await unavailable.evaluate(() => { window.allow3D = true; });
    await unavailable.locator('#retryBoard').click();
    await unavailable.waitForFunction(() => !!board3D);
    assert.equal(await unavailable.evaluate(() => room), '830103');
    await unavailable.close();

    await page.route('**/__wagon-gallery', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><meta charset="utf-8"><title>Vagones · Trencitos</title><style>
      *{box-sizing:border-box}body{margin:0;background:#eee6d2;font-family:system-ui;color:#203e46}header{padding:42px 60px 0;height:140px}h1{margin:0;font-size:36px;letter-spacing:-1.4px}p{color:#5f716d;margin:10px 0}#stage{position:relative;width:1440px;height:1600px}canvas{position:absolute;inset:0}.label{position:absolute;transform:translateX(-50%);text-align:center;font-size:17px;font-weight:650;white-space:nowrap}.label small{display:block;font-weight:450;font-size:13px;color:#65756e;margin-top:5px}
      </style><header><h1>Una familia de vagones</h1><p>Dieciocho colores · Cargas y siluetas propias · Piezas reales del tablero 3D</p></header><div id="stage"></div></html>` }));
    await page.goto(`${base}/__wagon-gallery`);
    const catalog = await page.evaluate(async () => {
      const { createBoard3D } = await import('/board-3d.js');
      const { WAGON_STYLES } = await import('/wagon-models.mjs');
      const container = document.getElementById('stage');
      const network = WAGON_STYLES.map((s, i) => ({ d: '', cells: [{ x: 38 + i % 4 * 72, y: 48 + Math.floor(i / 4) * 62, angle: -22 }] }));
      const map = { bounds: { x: 0, y: 0, width: 980, height: 660 }, land: ['M0 0H980V660H0Z'], details: [], cities: {} };
      const board = createBoard3D({ container, map, network, onFailure: e => { throw e; } });
      const routes = network.map((_, id) => ({ id, owner: id }));
      const players = WAGON_STYLES.map(s => ({ color: s.color, placed: [] }));
      board.resize({ x: 0, y: 0, width: 290, height: 1600 * 290 / 1440, scale: 290 / 1440 }); board.update({ routes, players });
      for (const [i, s] of WAGON_STYLES.entries()) {
        const cell = network[i].cells[0], p = board.project(cell.x, cell.y + 8, 0);
        const label = document.createElement('div'); label.className = 'label'; label.style.left = `${p.x}px`; label.style.top = `${p.y + 28}px`;
        label.innerHTML = `${s.label}<small>${['Rojo','Azul','Verde','Ámbar','Morado','Marrón','Amarillo','Negro','Gris','Magenta','Turquesa','Azul noche','Borgoña','Verde oliva','Marfil','Coral','Lavanda','Azul hielo'][i]}</small>`; container.append(label);
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const stats = board.stats();
      window.gallery = { board, network, routes, players };
      return stats;
    });
    assert.equal(catalog.wagons, WAGON_STYLES.length); assert.equal(Object.keys(catalog.models).length, WAGON_STYLES.length);
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
    // Close views of the revised models, rendered live with the actual preview.
    await page.route('**/__cargo-gallery', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><meta charset="utf-8"><title>Cargas · Trencitos</title><style>
      *{box-sizing:border-box}body{margin:0;padding:34px 36px;background:#edf2ef;color:#203e46;font-family:system-ui}h1{font-size:30px;letter-spacing:-1px;margin:0 0 6px}header p{margin:0 0 26px;color:#627b7e;font-size:15px}main{display:grid;grid-template-columns:repeat(6,1fr);gap:16px}article{grid-column:span 2;background:#fafaf3;border:1px solid #d2ddd4;border-radius:16px;overflow:hidden}article:nth-child(n+4){grid-column:span 3}.stage{height:224px}canvas{display:block}footer{padding:0 20px 20px}h2{font-size:18px;margin:0 0 5px}footer p{font-size:13px;color:#627b7e;margin:0}
      </style><header><h1>Cargas con identidad propia</h1><p>Los cinco modelos actualizados · Vista previa real del juego</p></header><main></main></html>`}));
    await page.setViewportSize({width:1200,height:760});
    await page.goto(`${base}/__cargo-gallery`);
    await page.evaluate(async models => {
      const { createWagonPreview } = await import('/wagon-preview.js');
      const { WAGON_STYLES } = await import('/wagon-models.mjs');
      const descriptions = ['Tolva profunda · Carbón fragmentado','Bloques de cantera · Vetas y amarres','Acero laminado · Hueco central y cinchos','Coche postal · Ventanillas y sobres','Contenedores · Paneles acanalados'];
      window.previews = models.map((model,i) => {
        const style = WAGON_STYLES.find(s => s.model === model);
        const article = document.createElement('article'); article.innerHTML = '<div class="stage"></div><footer><h2></h2><p></p></footer>';
        article.querySelector('h2').textContent = style.label; article.querySelector('p').textContent = descriptions[i];
        document.querySelector('main').append(article);
        const preview = createWagonPreview({container:article.querySelector('.stage'),onFailure:()=>{throw new Error('Preview failed');}});
        preview.update(style.color); return preview;
      });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, refinedModels);
    await page.screenshot({path:path.join(out,'wagons-refined.png'),fullPage:true});
    await page.evaluate(() => previews.forEach(p=>p.dispose()));
    assert.deepEqual(errors, []);
    const report = { date: new Date().toISOString(), browser: browser.version(), tests: ['all 18 previews match selection', 'five revised cargo previews captured', '225 wagons across the five revised families', 'dense revised models pan and remain idle without changes', 'yellow auto carrier preview', 'mobile without overflow', 'room preview follows authoritative color', '3D ignores old 2D preferences and query', 'no owner symbols', 'resources stable across reload', 'WebGL startup failure and retry preserve the room', 'all 18 board models render', 'highlight/reset preserves model counts'], catalog, dense: after, refinedDense, refinedPerformance, errors };
    fs.writeFileSync(path.join(out, 'wagons-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await context.close(); await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50));
