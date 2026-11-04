// Run after mobile:server and mobile:android. Uses a real emulator WebView.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _android } = require('playwright');
const { mobilePort } = require('../scripts/mobile-config');
const beta = process.env.TRENCITOS_MOBILE_MODE === 'beta';
const pkg = beta ? 'com.trencitos.beta' : 'com.trencitos.dev';
const activity = `${pkg}/com.trencitos.dev.MainActivity`;
const output = path.resolve(__dirname, beta ? '../.qa/mobile-beta' : '../.qa/mobile');
fs.mkdirSync(output, { recursive: true });
const report = { checks: [], errors: [], graphicsWarnings: [] };

(async () => {
  const health = await fetch(`http://127.0.0.1:${mobilePort()}/healthz`);
  assert.equal(health.headers.get('x-trencitos-development'), 'capacitor');
  const devices = await _android.devices();
  const device = devices.find(item => item.serial() === (process.env.QA_ANDROID_SERIAL || 'emulator-5554'));
  assert.ok(device, 'Start the Android emulator first');
  device.setDefaultTimeout(30000);
  try {
    await device.shell(`am start -n ${activity}`);
    const webview = await device.webView({ pkg });
    const page = await webview.page();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') report.errors.push(message.text());
      else if (/GL ERROR|GL_INVALID|THREE.WebGLProgram/.test(message.text())) report.graphicsWarnings.push(message.text());
    });
    await page.goto(beta ? 'https://localhost/' : `http://10.0.2.2:${mobilePort()}/`);
    await page.waitForFunction(() => !document.querySelector('#create').disabled);
    report.runtime = await page.evaluate(() => ({ platform: Capacitor.getPlatform(), userAgent: navigator.userAgent, native: Capacitor.isNativePlatform(), appPlugin: !!Capacitor.Plugins.App }));
    assert.equal(report.runtime.platform, 'android');
    assert.equal(report.runtime.native, true);
    assert.equal(report.runtime.appPlugin, true);
    if (beta) {
      report.connection = await page.evaluate(async () => ({ origin: location.origin, socket: sock.url, protocol: sock.protocol,
        packaged: TrencitosConnection.packaged, account: await (await TrencitosConnection.request('/api/account')).json() }));
      assert.equal(report.connection.origin, 'https://localhost');
      assert.equal(report.connection.packaged, true);
      assert.equal(report.connection.protocol, 'trencitos.v1');
      assert.equal(report.connection.socket, `ws://10.0.2.2:${mobilePort()}/socket`);
      assert.equal(report.connection.account.mobile, true);
      report.checks.push('Packaged assets connect to the remote guest API and WebSocket through the native origin');
    }
    report.checks.push('Native Capacitor WebView and App plugin loaded; local server connected');
    if (process.env.QA_ROOM) {
      await page.locator('#openJoin').click();
      await page.locator('#code').fill(process.env.QA_ROOM);
      await page.locator('#join').click();
    } else {
      await page.locator('#create').click();
    }
    await page.locator('#roompanel:not(.hidden)').waitFor();
    report.room = (await page.locator('#roomcode').textContent()).trim();
    console.log('Android joined room ' + report.room);
    await page.screenshot({ path: path.join(output, 'android-lobby.png') });
    if (!process.env.QA_ROOM) {
      await page.locator('[data-add-bot]').first().click();
      await page.locator('#start').click();
    }
    await page.locator('#keep').waitFor({ timeout: 120000 });
    await page.locator('#dialog .ticket-choice input').nth(0).check();
    await page.locator('#dialog .ticket-choice input').nth(1).check();
    await page.locator('#keep').click();
    await page.waitForFunction(() => game?.phase === 'play' && board3D?.stats().draws > 0, null, { timeout: 120000 });
    report.board = await page.evaluate(() => {
      const { draws, calls, triangles, revision } = board3D.stats();
      const gl = document.querySelector('.board-3d-canvas').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { draws, calls, triangles, revision, renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) };
    });
    // Draw calls alone can pass while an emulator driver produces a blank canvas.
    // Sample the actual framebuffer during the render frame, before it is cleared.
    report.board.colors = await page.evaluate(() => new Promise(resolve => {
      applyZoom();
      requestAnimationFrame(() => {
        const canvas = document.querySelector('.board-3d-canvas'), gl = canvas.getContext('webgl2');
        const pixel = new Uint8Array(4), colors = new Set();
        for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
          gl.readPixels(Math.floor(x * canvas.width / 20), Math.floor(y * canvas.height / 20), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          if (pixel[3]) colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
        }
        resolve(colors.size);
      });
    }));
    assert.ok(report.board.colors > 8, 'The Three.js framebuffer must contain the map, not a uniform background');
    const before = await page.evaluate(() => ({ room, seat, tickets: game.tickets.length, players: game.players.length }));
    if (beta) {
      const native = await page.evaluate(async () => ({ history: await (await TrencitosConnection.request('/api/history')).json(), invite: TrencitosConnection.publicUrl('/?room=' + room) }));
      assert.ok(native.history.matches.length > 0);
      assert.equal(new URL(native.invite).origin, `http://10.0.2.2:${mobilePort()}`);
      report.checks.push('Native guest history contains the match and invitation uses the backend origin');
    }
    assert.ok(before.tickets >= 2);
    assert.ok(before.players >= 2);
    report.checks.push('Room joined, destinations confirmed through WebSocket, Three.js board rendered');
    await device.screenshot({ path: path.join(output, 'android-game.png') });

    await device.shell('input keyevent KEYCODE_HOME');
    const activities = (await device.shell('dumpsys activity activities')).toString();
    const resumedActivity = activities.split('\n').find(line => /topResumedActivity=|mResumedActivity:|ResumedActivity:/.test(line));
    assert.ok(resumedActivity && !resumedActivity.includes(pkg), 'Android Home must move the app to the background');
    const reopened = page.waitForEvent('websocket');
    await device.shell(`am start -n ${activity}`);
    await reopened;
    await page.waitForFunction(() => sock.readyState === WebSocket.OPEN && !!game && !!board3D);
    const after = await page.evaluate(() => ({ room, seat, tickets: game.tickets.length }));
    assert.equal(after.room, before.room);
    assert.equal(after.seat, before.seat);
    assert.equal(after.tickets, before.tickets);
    report.checks.push('Background/foreground reopens the socket and restores the same seat and destinations');
    await device.screenshot({ path: path.join(output, 'android-resumed.png') });
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, 'android-report.json'), JSON.stringify(report, null, 2) + '\n');
    await device.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
