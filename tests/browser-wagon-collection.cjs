// Collection regression: actual geometry, Retina sizing and native horizontal scrolling.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-collection-'));
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'rooms.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server');
const out = path.resolve(process.env.QA_OUT || '.qa/wagon-collection');
const report = { layouts: [], checks: [], errors: [] };
let browser;

(async () => {
  try {
    fs.mkdirSync(out, { recursive: true });
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    report.browser = browser.version();
    for (const dpr of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, hasTouch: true });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      await page.goto(`http://127.0.0.1:${app.server.address().port}/rooms`);
      await page.locator('#create').click();
      await page.waitForFunction(() => !!wagonPreview);
      await page.locator('#roomColors [data-color="#d45748"]').click();
      await page.waitForFunction(() => members[seat]?.color === '#d45748' && !pendingRoomColor);
      // Inspect meshes actually submitted to WebGL, including every coupling's height.
      await page.evaluate(async () => {
        const THREE = await import('/vendor/three.module.js');
        const original = THREE.InstancedMesh.prototype.onBeforeRender;
        THREE.InstancedMesh.prototype.onBeforeRender = function (renderer, scene, camera, ...args) {
          if (renderer.domElement.closest('#wagonCollectionStage')) {
            const bounds = new THREE.Box3(), matrix = new THREE.Matrix4(), couplers = [];
            for (const mesh of scene.children.filter(m => m.isInstancedMesh && m.visible)) {
              mesh.computeBoundingBox(); bounds.union(mesh.boundingBox);
              for (let i = 0; i < mesh.count; i++) {
                mesh.getMatrixAt(i, matrix); const e = matrix.elements;
                if (mesh.geometry.name === 'box' && Math.abs(e[0] - 1.1) < .0001 && Math.abs(e[5] - 2) < .0001 && Math.abs(e[10] - 1) < .0001 && Math.abs(e[13]) < .0001) couplers.push([e[12], e[14]]);
              }
            }
            window.collectionGeometry = {
              couplers: couplers.sort((a, b) => a[0] - b[0]),
              min: bounds.min.clone().project(camera).toArray(), max: bounds.max.clone().project(camera).toArray(),
            };
          }
          return original.call(this, renderer, scene, camera, ...args);
        };
      });
      for (const [width, height] of [[1440,900], [768,1024], [390,844], [320,700], [844,390], [568,320]]) {
        await page.setViewportSize({ width, height });
        if (await page.locator('button[data-room-tab="settings"]').isVisible()) await page.locator('button[data-room-tab="settings"]').click();
        await page.locator('#openWagonCollection').click();
        await page.waitForFunction(() => !!wagonCollection && !!window.collectionGeometry);
        await page.waitForFunction(() => {
          const stage = document.querySelector('#wagonCollectionStage'), canvas = stage.querySelector('canvas');
          return canvas && Math.abs(canvas.getBoundingClientRect().height - stage.clientHeight) < 1;
        });
        const layout = await page.evaluate(() => {
          const dialog = document.querySelector('#wagonCollectionDialog'), stage = document.querySelector('#wagonCollectionStage');
          const rect = dialog.getBoundingClientRect(), canvas = stage.querySelector('canvas').getBoundingClientRect();
          return { dialogWidth: rect.width, dialogHeight: rect.height, inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
            dialogOverflows: dialog.scrollWidth > dialog.clientWidth || dialog.scrollHeight > dialog.clientHeight,
            verticalOverflow: stage.scrollHeight > stage.clientHeight, horizontalScroll: stage.scrollWidth > stage.clientWidth,
            canvasWidth: canvas.width, canvasHeight: canvas.height, scrollLeft: stage.scrollLeft, geometry: window.collectionGeometry };
        });
        assert.ok(layout.inViewport && !layout.dialogOverflows && !layout.verticalOverflow, JSON.stringify(layout));
        assert.ok(layout.horizontalScroll && layout.dialogHeight <= 330, 'compact modal with internal horizontal scrolling');
        assert.equal(layout.scrollLeft, 0, 'reopening starts at the first wagon');
        assert.equal(layout.geometry.couplers.length, 12, 'six actual wagons');
        assert.ok(layout.geometry.couplers.every(([, z]) => Math.abs(z - 1.8) < .0001), 'all six share one baseline');
        for (let i = 1; i < 6; i++) assert.ok(Math.abs(layout.geometry.couplers[2*i][0] - layout.geometry.couplers[2*i-1][0]) < 1.2, 'neighboring couplers meet');
        assert.ok([...layout.geometry.min, ...layout.geometry.max].every(v => v >= -1 && v <= 1), 'all real geometry fits the canvas');
        assert.equal(await page.locator('#wagonCollectionStage [data-variant]').count(), 6);
        const stage = page.locator('#wagonCollectionStage');
        if (dpr === 2) await page.locator('#wagonCollectionDialog').screenshot({ path: path.join(out, `collection-${width}.png`) });
        await stage.focus(); await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('#wagonCollectionStage').scrollLeft > 0);
        // Let native keyboard scrolling finish before capturing either endpoint.
        await page.waitForTimeout(250);
        await stage.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        assert.equal(await stage.evaluate(el => Math.abs(el.scrollLeft + el.clientWidth - el.scrollWidth) < 1), true, 'last wagon is reachable');
        assert.equal(await page.locator('#wagonCollectionDialog').evaluate(el => el.scrollLeft === 0 && el.scrollTop === 0), true);
        if (dpr === 2) {
          await stage.evaluate(el => el.blur());
          await page.locator('#wagonCollectionDialog').screenshot({ path: path.join(out, `collection-${width}-end.png`) });
        }
        report.layouts.push({ dpr, width, height, ...layout });
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !wagonCollection);
        assert.equal(await page.locator('#wagonCollectionStage canvas').count(), 0);
        assert.equal(await page.locator('#openWagonCollection').evaluate(el => el === document.activeElement), true);
        await page.evaluate(() => { window.collectionGeometry = null; });
      }
      if (dpr === 2) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#openWagonCollection').click();
        await page.waitForFunction(() => !!window.collectionGeometry);
        const stage = page.locator('#wagonCollectionStage'), box = await stage.boundingBox();
        const cdp = await context.newCDPSession(page), y = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 280, y }] });
        for (const x of [240, 200, 160, 120, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('#wagonCollectionStage').scrollLeft > 50);
        assert.equal(await stage.evaluate(el => el.scrollTop), 0);
        await cdp.detach();
        await page.setViewportSize({ width: 568, height: 320 });
        await page.waitForFunction(() => {
          const dialog = document.querySelector('#wagonCollectionDialog'), stage = document.querySelector('#wagonCollectionStage');
          return dialog.getBoundingClientRect().bottom <= innerHeight && stage.scrollHeight === stage.clientHeight && stage.querySelector('canvas').clientHeight === stage.clientHeight;
        });
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !wagonCollection);
        await page.evaluate(() => { window.collectionGeometry = null; });
        report.checks.push('Emulated touch swipe scrolls horizontally; rotating an open modal keeps it inside the viewport');
      }
      // Single-design families still fit and need no artificial scrolling.
      await page.setViewportSize({ width: 1440, height: 900 });
      const { WAGON_STYLES } = await import('../frontend/wagon-models.mjs');
      for (const style of WAGON_STYLES.filter(s => s.model !== 'passenger')) {
        await page.locator(`#roomColors [data-color="${style.color}"]`).click();
        await page.waitForFunction(color => members[seat]?.color === color && !pendingRoomColor, style.color);
        await page.locator('#openWagonCollection').click();
        await page.waitForFunction(() => !!window.collectionGeometry);
        const geometry = await page.evaluate(() => window.collectionGeometry);
        assert.ok([...geometry.min, ...geometry.max].every(v => v >= -1 && v <= 1), `${style.model} fits`);
        assert.equal(await page.locator('#wagonCollectionStage').evaluate(el => el.scrollWidth === el.clientWidth && el.scrollHeight === el.clientHeight), true, `${style.model} has no overflow`);
        await page.locator('#wagonCollectionDialog [data-close-dialog]').click(); await page.waitForFunction(() => !wagonCollection);
        await page.evaluate(() => { window.collectionGeometry = null; });
      }
      await context.close();
    }
    report.checks.push('Six connected wagons, first/last reachable, keyboard scrolling, fixed header and no vertical overflow at six viewport sizes and DPR 1/2', 'Escape/button close dispose canvas and restore focus; all single-design families fit');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ browser: report.browser, layouts: report.layouts.length, checks: report.checks, errors: report.errors }));
  } finally {
    await browser?.close(); await app.shutdown(); fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
