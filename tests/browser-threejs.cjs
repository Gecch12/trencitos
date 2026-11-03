/* Run from this worktree: npm run test:board3d. Chrome channel may be overridden.
 * Browser QA + real WS full-game driver, not part of the fast unit-test suite. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { start } = require('./helpers/threejs-preview');
const { connect } = require('./helpers/ws-client');
const { chooseBotAction } = require('../bots');
const { tunnelBusy } = require('../engine');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'docs/qa');
const report = { date: new Date().toISOString(), platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, tests: [], errors: [] };
const save = () => fs.writeFileSync(path.join(out, 'threejs-report.json'), JSON.stringify(report, null, 2) + '\n');
(async () => {
  const { server, rooms, token, port } = await start(Number(process.env.QA_PORT || 3119));
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1460, height: 940 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage(), peers = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') report.errors.push(e.text()); });
  async function open(code, mode = '3d', p = page) {
    await p.goto(`${base}/?room=${code}&board=${mode}#recover=${token}`);
    await p.waitForFunction(mode => game && (mode !== '3d' || !!board3D), mode);
    await p.waitForFunction(() => !document.getElementById('game').classList.contains('hidden'));
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
  }
  async function settled() { await page.waitForFunction(() => !pendingAction); await page.evaluate(() => new Promise(requestAnimationFrame)); }
  try {
    // Pointer click -> shared menu -> payment -> real WS -> authoritative view.
    const results = [];
    for (const [code, mode] of [['830101', '3d'], ['830102', '3d']]) {
      await open(code, mode);
      const target = await page.evaluate(() => {
        const r = game.routes.find(r => !r.tunnel && !GameUI.construction(game, seat, { routeId: r.id }).reason);
        const cell = MAP_GEOMETRY[r.id].cells[0], matrix = document.getElementById('board').getScreenCTM();
        const point = new DOMPoint(cell.x, cell.y).matrixTransform(matrix);
        return { id: r.id, x: point.x, y: point.y };
      });
      await page.mouse.click(target.x, target.y);
      await page.locator('#startBuild').click(); await page.locator('#confirmBuild').click();
      await page.waitForFunction(id => game.routes[id].owner === 0, target.id); await settled();
      results.push(await page.evaluate(id => ({ id, owner: game.routes[id].owner, hand: [...game.hand].sort(), trains: game.players[0].trains, score: game.players[0].score, private: game.players.every(p => !('hand' in p) && !('tickets' in p)), wagons: board3D?.stats().wagons }), target.id));
    }
    const { wagons, ...threeResult } = results[1]; const { wagons: unused, ...twoResult } = results[0];
    assert.deepEqual(threeResult, twoResult); assert.ok(wagons > 0); assert.equal(threeResult.private, true);
    report.tests.push({ name: 'same route/payment/result in independent 3D rooms via pointer UI', results }); save();
    await open('830103');
    await page.locator('#board [data-city="PAR"]').focus(); await page.keyboard.press('Enter');
    await page.locator('#startBuild').click(); await page.locator('#confirmBuild').click();
    await page.waitForFunction(() => game.players[0].placed.includes('PAR')); await settled();
    assert.equal(await page.evaluate(() => board3D.stats().stations), 1);
    report.tests.push({ name: 'station construction from keyboard through authoritative server', passed: true });
    // Zero-surcharge tunnel: Three must wait for the same reveal presentation.
    await open('830105');
    const tunnelId = await page.evaluate(() => game.routes.find(r => r.tunnel && r.color === 'gray' && r.n === 2).id);
    await page.locator(`#board [data-route-id="${tunnelId}"]`).focus(); await page.keyboard.press('Enter');
    await page.locator('#startBuild').click(); await page.locator('#confirmBuild').click();
    await page.waitForFunction(id => game.routes[id].owner === 0, tunnelId);
    await page.waitForFunction(() => !tunnelReveal?.build, null, { timeout: 15000 }); await settled();
    assert.ok(await page.evaluate(() => board3D.stats().wagons >= 2));
    report.tests.push({ name: 'zero surcharge tunnel resolves and appears after reveal', passed: true }); save();
    await open('830104');
    await page.screenshot({ path: path.join(out, 'threejs-desktop.png') });
    // Pointer selection reaches the elevated station roof, not only its ground anchor.
    const roof = await page.evaluate(() => { const p = board3D.project(...RailMap.cities.PAR, 18); return { x:p.x, y:p.y + document.getElementById('mapscroll').getBoundingClientRect().top }; });
    await page.mouse.click(roof.x, roof.y); assert.match(await page.locator('#mapMenu').innerText(), /Paris/);
    await page.locator('#mapMenu .menu-close').click();
    report.tests.push({name:'pointer selects elevated station roof',passed:true});
    // Performance: warm render; alternate panning on consecutive animation frames.
    report.performance = [];
    for (const mode of ['3d']) {
      await page.evaluate(async mode => { zoom = 1.8; mapCenter = { x: 360, y: 310 }; applyZoom(); }, mode);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const measured = await page.evaluate(async () => {
        const samples = [], intervals = []; let previous = performance.now();
        for (let i = 0; i < 90; i++) {
          await new Promise(requestAnimationFrame); const now = performance.now();
          if (i > 10) intervals.push(now - previous); previous = now;
          const start = performance.now(); mapCenter.x += i % 2 ? -2 : 2; applyZoom();
          if (i > 10) samples.push(performance.now() - start);
        }
        const summary = a => { a.sort((x,y) => x-y); return { n: a.length, median: a[Math.floor(a.length / 2)], p95: a[Math.floor(a.length * .95)], max: a.at(-1) }; };
        const canvas = document.querySelector('.board-3d-canvas'), gl = canvas?.getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return { cpuCameraMs: summary(samples), frameIntervalMs: summary(intervals), stats: board3D?.stats(), renderer: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) };
      });
      report.performance.push({ mode, viewport: '1460x940', ...measured });
    }
    // Render-on-demand must be idle when the board is unchanged.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await page.evaluate(() => board3D.stats().draws); await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => board3D.stats().draws), before);
    report.tests.push({ name: 'no continuous WebGL loop while idle', passed: true });
    // Viewport, zoom extremes, label overlaps and short leaders.
    report.legibility = [];
    for (const [width, height] of [[1460,940], [768,1024], [390,844]]) {
      await page.setViewportSize({width,height});
      for (const z of [.25, 1, 6]) {
        await page.evaluate(z => { zoom = z; mapCenter = { x:430,y:320 }; applyZoom(); }, z);
        const check = await page.evaluate(() => {
          const boxes = [...document.querySelectorAll('#board [data-city-label]')].filter(g => getComputedStyle(g).display !== 'none').map(g => {
            const r = g.querySelector('text').getBoundingClientRect(); return { key:g.dataset.cityLabel, x:r.x,y:r.y,width:r.width,height:r.height };
          });
          const overlaps = [];
          for (const [i,a] of boxes.entries()) for (const b of boxes.slice(i+1)) if (Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1) overlaps.push([a.key,b.key]);
          return { visible:boxes.length, overlaps, overflow:document.documentElement.scrollWidth > innerWidth, projectionError:Math.max(...Object.values(RailMap.cities).map(([x,y])=>{ const p=board3D.project(x,y), v=mapViewSize(); return Math.hypot(p.x-(x-v.x)/v.scale,p.y-(y-v.y)/v.scaleY); })) };
        });
        assert.deepEqual(check.overlaps, []); assert.equal(check.overflow,false); assert.ok(check.projectionError < .01);
        report.legibility.push({width,height,zoom:z,...check});
      }
      await page.locator('#mapscroll').press('Home');
      if (width===390) await page.screenshot({path:path.join(out,'threejs-mobile.png')});
    }
    // Real touch events through CDP (viewport emulation, not a physical phone).
    const cdp = await context.newCDPSession(page);
    const touch = (id,x,y) => ({id,x,y,radiusX:8,radiusY:8,force:1});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,140,350),touch(2,240,350)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,100,350),touch(2,280,350)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const pinch = await page.evaluate(() => ({zoom, menu:!document.getElementById('mapMenu').classList.contains('hidden')}));
    assert.ok(pinch.zoom > 1.5); assert.equal(pinch.menu,false);
    report.tests.push({name:'two-finger pinch zoom without accidental selection',...pinch});
    await page.locator('#board [data-city="MOS"]').focus();
    assert.equal(await page.locator('#board [data-city-label="MOS"]').evaluate(g=>getComputedStyle(g).display !== 'none'),true);
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#mapMenu').isVisible(),true);
    report.tests.push({name:'keyboard focuses offscreen city, reveals its label and opens menu',passed:true});
    // Context loss preserves the room and offers explicit 3D retry.
    await page.evaluate(() => document.querySelector('.board-3d-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => !board3D);
    assert.equal(await page.locator('#board .route-group').count(),101);
    assert.equal(await page.locator('#boardStatus').isVisible(),true);
    await page.locator('#retryBoard').click(); await page.waitForFunction(() => !!board3D);
    report.tests.push({name:'context loss offers 3D retry without losing the room',passed:true}); save();
    // Complete normal game: one rendered client, three independent WS peers.
    await page.setViewportSize({width:1460,height:940});
    await page.goto(base + '/?board=3d');
    await page.locator('#create').click(); await page.waitForFunction(()=>!!room);
    const matchCode = await page.locator('#roomcode').textContent();
    for (let i=1;i<4;i++) { const peer=await connect(port); peers.push(peer); peer.send({type:'join',code:matchCode,name:`QA ${i}`}); await peer.next('lobby'); }
    await page.locator('#start').click(); await page.waitForFunction(()=>game?.phase==='initial');
    const r = rooms.get(matchCode); const counts = {}; let actions=0, reconnect=false;
    while(r.game.phase !== 'finished' && actions < 1000) {
      const g=r.game;
      // Reveal/result are server-timed stages. Wait for the authorized view;
      // bots correctly produce no action until a decision or next turn exists.
      if (tunnelBusy(g)) {
        await page.waitForFunction(() => game?.phase !== 'tunnel' || game.sharedTunnel?.stage === 'decision');
        continue;
      }
      let seat=g.phase==='initial'?g.players.findIndex(p=>p.pending.length):g.players.findIndex(p=>p.offer);
      if(seat<0)seat=g.current;
      const offer=g.players[seat].offer;
      const action=offer?{type:'keep_tickets',offerId:offer.id,indexes:[0]}:chooseBotAction(g,seat);
      assert.ok(action,`No action at ${g.phase}`);
      const nextRevision=(r.revision||0)+1;
      if(seat===0) { await page.waitForFunction(()=>!pendingAction); await page.evaluate(a=>act(a.type,a),action); }
      else {
        const id = `qa-action-${actions}`, peer = peers[seat-1];
        peer.send({type:'action',id,revision:r.revision,action});
        try { await peer.next('ack', m => m.id === id, 3000); }
        catch (e) { report.rejected = { seat, action, revision:r.revision, error:await peer.next('error',()=>true,100).catch(()=>null) }; throw e; }
      }
      await page.waitForFunction(rev=>game?.revision>=rev,nextRevision);
      // Respect the unchanged server limit (45 messages / 10 s / peer).
      await page.waitForTimeout(90);
      actions++; counts[action.type]=(counts[action.type]||0)+1;
      if(actions===50) {
        const previous=await page.evaluate(()=>({hand:game.hand,routes:game.routes.map(r=>r.owner)}));
        await page.reload(); await page.waitForFunction(()=>game && !!board3D);
        assert.deepEqual(await page.evaluate(()=>({hand:game.hand,routes:game.routes.map(r=>r.owner)})),previous); reconnect=true;
      }
      if(actions%75===0) { console.log(`Full game: ${actions} accepted actions, ${g.phase}`); save(); }
    }
    assert.equal(r.game.phase,'finished'); assert.ok(reconnect); await settled();
    assert.equal(await page.evaluate(()=>game.result.length),4);
    await page.screenshot({path:path.join(out,'threejs-finished.png')});
    report.fullGame={actions,counts,reconnect,phase:r.game.phase,results:r.game.result.map(({seat,score})=>({seat,score})),renderedWagons:await page.evaluate(()=>board3D.stats().wagons)};
    assert.equal(report.errors.length,0,report.errors.join('\n'));
    report.passed=true; save(); console.log(JSON.stringify({passed:true,actions,tests:report.tests.length,performance:report.performance.map(({mode,cpuCameraMs,frameIntervalMs})=>({mode,cpuCameraMs,frameIntervalMs}))}));
  } catch(e) { await page.screenshot({path:path.join(out,"threejs-failure.png")}); report.failure=e.stack; save(); throw e; }
  finally { peers.forEach(p=>p.close()); await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
