// Compact lobby preview: one real wagon, all viewports/families, camera and resource checks.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-gallery-'));
const out = path.resolve(process.env.QA_OUT || '.qa/wagon-compact-preview');
Object.assign(process.env, { STATE_BACKEND: 'file', STATE_FILE: path.join(temp, 'rooms.json'), AUTH_ENABLED: 'false' });
const app = require('../backend/server');
const report = { checks: [], layouts: [], errors: [] };
let browser;

(async () => {
  try {
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    report.browser = browser.version();
    const page = await browser.newPage({ viewport: { width: 2048, height: 1131 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.addInitScript(() => {
      window.previewDraws = 0;
      for (const method of ['drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function (...args) {
          if (this.canvas.closest('#wagonPreviewStage')) window.previewDraws++;
          return original.apply(this, args);
        };
      }
    });
    fs.mkdirSync(out, { recursive: true });
    const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const capture = async () => {
      await page.evaluate(async () => { window.capturePreview = true; await syncWagonPreview(); });
      await frames();
      return page.evaluate(() => window.previewGeometry);
    };
    const choose = async color => {
      await page.locator(`#roomColors [data-color="${color}"]`).click();
      await page.waitForFunction(color => members[seat]?.color === color && !pendingRoomColor && !!wagonPreview, color);
      await frames();
    };
    await page.goto(base + '/rooms');
    // Inspect the actual drawn meshes/camera, not DOM placeholders for the images.
    await page.evaluate(async () => {
      const THREE = await import('/vendor/three.module.js');
      const original = THREE.InstancedMesh.prototype.onBeforeRender;
      THREE.InstancedMesh.prototype.onBeforeRender = function (renderer, scene, camera, ...args) {
        if (window.capturePreview && renderer.domElement.closest('#wagonPreviewStage')) {
          window.capturePreview = false;
          const bounds = new THREE.Box3(), projected = new THREE.Box3(), point = new THREE.Vector3(), matrix = new THREE.Matrix4(), couplers = [];
          for (const mesh of scene.children.filter(mesh => mesh.isInstancedMesh && mesh.visible)) {
            mesh.computeBoundingBox(); bounds.union(mesh.boundingBox);
            const positions = mesh.geometry.getAttribute('position');
            for (let index = 0; index < mesh.count; index++) {
              mesh.getMatrixAt(index, matrix); const e = matrix.elements;
              if (mesh.geometry.name === 'box' && Math.abs(e[0] - 1.1) < .0001 && Math.abs(e[5] - 2) < .0001 && Math.abs(e[10] - 1) < .0001
                && Math.abs(e[13]) < .0001 && Math.abs(e[14] - 1.8) < .0001) couplers.push(e[12]);
              // Empty corners of the whole model's AABB can extend past the
              // tilted camera even when every real vertex is inside the frame.
              for (let vertex = 0; vertex < positions.count; vertex++) {
                projected.expandByPoint(point.fromBufferAttribute(positions, vertex).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld).project(camera));
              }
            }
          }
          window.previewGeometry = {
            min: bounds.min.toArray(), max: bounds.max.toArray(), couplers: couplers.sort((a, b) => a - b),
            direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
            projectedMin: projected.min.toArray(), projectedMax: projected.max.toArray(),
          };
        }
        return original.call(this, renderer, scene, camera, ...args);
      };
    });
    await page.locator('#create').click();
    await page.waitForFunction(() => !!room && !!wagonPreview);
    await choose('#d45748');
    await page.evaluate(() => { window.firstPreviewCanvas = document.querySelector('#wagonPreviewStage canvas'); });
    assert.equal(await page.locator('#wagonPreviewStage canvas').count(), 1);
    assert.equal(await page.locator('#wagonPreviewStage .wagon-preview-item').count(), 0);
    assert.match(await page.locator('#wagonPreview').innerText(), /Pasajeros/);
    assert.equal(await page.locator('#openWagonCollection').isVisible(), true);
    assert.ok(await page.evaluate(() => previewDraws > 0), 'real WebGL draw calls');
    report.checks.push('One real compact wagon and a visible collection entry');

    for (const [width, height, count] of [[2048,1131,1], [1440,900,1], [768,1024,1], [600,900,1], [601,900,1], [390,844,1], [844,390,1], [320,700,1]]) {
      await page.setViewportSize({ width, height });
      if (await page.locator('button[data-room-tab="settings"]').isVisible()) await page.locator('button[data-room-tab="settings"]').click();
      await page.locator('#wagonPreview').scrollIntoViewIfNeeded();
      const geometry = await capture();
      const layout = await page.evaluate(() => {
        const gallery = document.querySelector('#wagonPreview'), appearance = document.querySelector('.appearance-setting');
        return {
          visibleCount: document.querySelectorAll('.wagon-preview-item:not([hidden])').length,
          galleryWidth: gallery.getBoundingClientRect().width, sectionWidth: appearance.getBoundingClientRect().width,
          galleryHeight: gallery.getBoundingClientRect().height,
          scrollable: gallery.scrollWidth > gallery.clientWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(layout.visibleCount, 0, `${width}×${height}px single preview needs no variant labels`);
      assert.ok(layout.galleryWidth <= layout.sectionWidth + 2, 'fits appearance section');
      assert.equal(layout.overflow, false);
      assert.ok(layout.galleryHeight <= 160, 'compact height');
      assert.equal(layout.scrollable, false, 'no horizontal scrolling, including mobile');
      assert.ok(geometry.direction[0] < -.2 && geometry.direction[1] > .5 && geometry.direction[2] < -.2,
        'compact preview shows front, side and roof');
      assert.equal(geometry.couplers.length, 2, 'actual drawn wagon count');
      assert.ok(geometry.projectedMin.every(value => value >= -1) && geometry.projectedMax.every(value => value <= 1),
        `all geometry fits inside the camera: ${JSON.stringify({ width, height, geometry })}`);
      report.layouts.push({ width, height, ...layout, geometry });
      await page.screenshot({ path: path.join(out, `lobby-${width}.png`) });
      await page.locator('#wagonPreview').screenshot({ path: path.join(out, `gallery-${width}.png`) });
      if (width === 390) {
        await page.locator('button[data-room-tab="players"]').click();
        await page.locator('button[data-room-tab="settings"]').click();
        await page.locator('#wagonPreview').scrollIntoViewIfNeeded();
        await frames();
        assert.equal(await page.locator('.wagon-preview-item:not([hidden])').count(), 0);
      }
    }
    report.checks.push('One 3/4 wagon at all eight viewport sizes, no clipping or scrolling; actual couplers confirm one model');

    await page.setViewportSize({ width: 1440, height: 900 });
    const { WAGON_STYLES } = await import('../frontend/wagon-models.mjs');
    for (const style of WAGON_STYLES) {
      await choose(style.color);
      const count = 0;
      assert.equal(await page.locator('.wagon-preview-item').count(), count, style.model);
      assert.equal(await page.locator('.wagon-preview-item:not([hidden])').count(), count, style.model);
      assert.ok((await page.locator('#wagonPreviewStage').getAttribute('aria-label')).startsWith(style.label + ','));
      assert.ok((await page.locator('#wagonPreview').innerText()).length > 0);
      assert.equal(await page.evaluate(() => firstPreviewCanvas === document.querySelector('#wagonPreviewStage canvas')), true);
    }
    await page.locator('#wagonPreview').screenshot({ path: path.join(out, 'single-design.png') });
    await choose('#d45748');
    await page.locator('#wagonPreview').scrollIntoViewIfNeeded();
    await frames();
    const before = await page.locator('#wagonPreview').screenshot();
    const draws = await page.evaluate(() => previewDraws);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => previewDraws), draws, 'no rendering loop while idle');
    await choose('#458ad4'); await choose('#d45748');
    await page.locator('#wagonPreview').scrollIntoViewIfNeeded(); await frames();
    assert.deepEqual(await page.locator('#wagonPreview').screenshot(), before, 'returning to a color preserves its example appearances');
    report.checks.push('All 21 families reuse the compact canvas, stay stable on return and do not redraw continuously');

    await page.evaluate(() => I18n.select('en')); await page.reload();
    await page.waitForFunction(() => !!wagonPreview);
    assert.ok((await page.locator('#wagonPreview').innerText()).length > 0);
    assert.equal(await page.locator('#wagonPreviewName').innerText(), 'Passengers');
    assert.equal(await page.locator('#openWagonCollection').innerText(), 'View all 6 wagons');
    await page.locator('#wagonPreview').screenshot({ path: path.join(out, 'gallery-english.png') });
    report.checks.push('Reload retains selection; English caption and collection link are translated');

    await page.evaluate(() => document.querySelector('#wagonPreviewStage canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    assert.equal(await page.locator('#wagonPreviewError').isVisible(), true);
    assert.equal(await page.locator('#wagonPreviewStage canvas').count(), 0);
    await choose('#458ad4');
    assert.equal(await page.locator('#wagonPreviewError').isVisible(), false);
    assert.equal(await page.locator('#wagonPreviewStage canvas').count(), 1);
    await page.locator('#leaveLobby').click();
    await page.waitForFunction(() => !room);
    assert.equal(await page.locator('#wagonPreviewStage canvas').count(), 0);
    assert.equal(await page.locator('.wagon-preview-item').count(), 0);
    report.checks.push('Context loss shows fallback, a later selection restores preview, and leaving disposes canvas and items');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close(); await app.shutdown();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
