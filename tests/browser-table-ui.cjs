// Responsive table, real HTTP/WebSocket actions, isolated file state.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {chromium} = require('playwright'), E = require('../backend/engine');
const {ownershipRoom} = require('./helpers/ownership-preview');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-table-'));
Object.assign(process.env, {STATE_BACKEND:'file', STATE_FILE:path.join(temp,'state.json'), AUTH_ENABLED:'false'});
const app = require('../backend/server'), out = path.resolve(process.env.QA_OUT || '.qa/board-first');
fs.mkdirSync(out, {recursive:true});
const report = {checks:[], errors:[], layouts:[]}; let browser;
(async () => {
  await app.ready; await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const room = ownershipRoom('QATABL'); room.practice = false; room.visibility = 'public'; room.archiveFull = true; room.maxPlayers = 5;
  const g = room.game; g.turnDeadline = Date.now() + 600000;
  g.players[0].score = 124; // Three-digit public score layout.
  g.players[0].tickets = E.TICKETS.filter(t => [2,8,12].includes(t.id));
  for (const color of [...E.COLORS,'wild']) {
    const i = g.deck.indexOf(color); if (i >= 0) g.players[0].hand.push(g.deck.splice(i,1)[0]);
  }
  app.rooms.set(room.code,room);
  browser = await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
  async function page(seat) {
    const p = await browser.newPage({viewport:{width:390,height:844}}); p.setDefaultTimeout(10000);
    p.on('pageerror',error => report.errors.push(error.message));
    p.on('console',message => { if(message.type() === 'error') report.errors.push(message.text()); });
    if (seat >= 0) await p.addInitScript(({code,token}) => localStorage.setItem('rr-room-'+code,token), {code:room.code,token:room.members[seat].token});
    await p.goto(base+'/?'+(seat < 0 ? 'watch=' : 'room=')+room.code);
    await p.waitForFunction(() => !!game && !!board3D); return p;
  }
  const p = await page(0), rival = await page(1), watcher = await page(-1);
  for (const client of [p,rival,watcher]) assert.equal(await client.locator('[data-player="0"] [data-metric="points"] strong').innerText(),'124');
  await p.locator('[data-player="0"]').click(); await p.locator('.live-score-details summary').click();
  assert.match(await p.locator('#compactPlayerDetail').innerText(),/Destinos cumplidos · privados/);
  await p.keyboard.press('Escape');
  await rival.locator('[data-player="0"]').click(); assert.equal(await rival.locator('.live-score-details').count(),0); await rival.keyboard.press('Escape');
  report.checks.push('Public construction score matches owner/rival/spectator; private breakdown only belongs to owner');
  const camera = () => p.evaluate(() => ({zoom,center:{...mapCenter},view:mapViewSize()}));
  await p.evaluate(() => { window.originalBoard = board3D; window.originalCanvas = document.querySelector('#mapscroll canvas'); });
  for (const [width,height,compact] of [[320,568,true],[390,844,true],[430,932,true],[700,900,false],[768,1024,false],[1024,768,false],[1280,720,false],[1366,768,false],[1440,900,false],[1920,1080,false],[844,390,true],[390,844,true]]) {
    await p.setViewportSize({width,height}); await p.waitForTimeout(120);
    const before = await camera();
    const layout = await p.evaluate(() => {
      const rect = el => el.getBoundingClientRect().toJSON();
      const onTop = el => {const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
      return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
        cards:[...document.querySelectorAll('#market button')].map(el=>({rect:rect(el),onTop:onTop(el)})),
        hand:[...document.querySelectorAll('#hand .traincard')].map(rect),clockVisible:onTop(document.querySelector('#compactClock')),
        tools:[...document.querySelectorAll('.table-tools button:not(.hidden), #tableRules, #playerDetailsToggle, .session-controls > summary, #drawtickets')].filter(el=>el.getClientRects().length).map(el=>({id:el.id,rect:rect(el),onTop:onTop(el)})),
        sidebar:rect(document.querySelector('#gameSidebar')),dock:rect(document.querySelector('#handdock')),
        market:rect(document.querySelector('#market')),scores:rect(document.querySelector('#scores')),history:rect(document.querySelector('#history')),
        destinations:rect(document.querySelector('.dockdestinations')),handRect:rect(document.querySelector('#hand')),
        boardUnchanged:board3D===window.originalBoard && document.querySelector('#mapscroll canvas')===window.originalCanvas,
        unique:['market','hand','scores','history','drawtickets','turnBanner'].every(id=>document.querySelectorAll('#'+id).length===1),
        safe:mapSafeArea(document.querySelector('#mapscroll').getBoundingClientRect(),true)};
    });
    assert.equal(layout.overflow,false); assert.equal(layout.cards.length,6); assert.equal(layout.hand.length,9);
    assert.ok(layout.cards.every(c=>c.rect.width>=44 && c.rect.height>=44 && c.onTop),JSON.stringify(layout));
    assert.ok(layout.hand.every(r=>r.x>=0 && r.right<=width && r.bottom<=height));
    assert.ok(layout.tools.every(t=>t.rect.width>=44 && t.rect.height>=(t.id==='drawtickets'&&!compact?34:44) && t.onTop));
    const stableMarket=await p.evaluate(()=>{
      const status=document.getElementById('drawstats'),saved=status.textContent;
      const bounds=()=>document.getElementById('market').getBoundingClientRect().toJSON();
      status.textContent='';const empty=bounds();status.textContent='0/2';const active=bounds();
      status.textContent='Roba una carta más';const reminder=bounds();status.textContent=saved;
      return {empty,active,reminder};
    });
    assert.deepEqual(stableMarket.empty,stableMarket.active,'draw count cannot move the market');
    assert.deepEqual(stableMarket.empty,stableMarket.reminder,'second-draw reminder cannot move the market');
    if(!compact){const button=layout.tools.find(t=>t.id==='drawtickets').rect;assert.ok(Math.abs(button.width/layout.market.width-1/3)<.02);assert.ok(Math.abs(button.right-layout.market.right)<2);}
    assert.equal(layout.clockVisible,true,'active clock must not be clipped');
    assert.equal(layout.boardUnchanged,true,'resizing must preserve the renderer and canvas');
    assert.equal(layout.unique,true,'resizing must not duplicate controls');
    if (compact) {
      assert.equal(layout.sidebar.width,0); assert.equal(layout.dock.width,0);
      assert.ok(layout.scores.y<height/3 && layout.market.y>height/2,'phone players stay above the board and draws below it');
      await p.locator('#playerDetailsToggle').click(); await p.waitForTimeout(50); assert.deepEqual(await camera(),before);
      await p.locator('#playerDetailsToggle').click();
      await p.locator('[data-panel="history"]').click(); await p.waitForTimeout(50); assert.deepEqual(await camera(),before);
      const panel=await p.locator('#compactPanel').boundingBox();assert.ok(panel.y>=0 && panel.y+panel.height<=height);
    } else {
      assert.ok(layout.sidebar.x>width/2 && layout.sidebar.right<=width);
      assert.ok(layout.history.height>0 && layout.history.bottom<layout.market.y);
      assert.ok(layout.market.x>=layout.sidebar.x && layout.scores.y>layout.market.bottom && layout.scores.bottom<=layout.sidebar.bottom,JSON.stringify({width,height,sidebar:layout.sidebar,scores:layout.scores,market:layout.market}));
      assert.ok(layout.handRect.y>=layout.dock.y && layout.destinations.y>=layout.dock.y && layout.dock.bottom<=height);
      assert.equal(await p.locator('#compactHud').isVisible(),false);
      assert.equal(await p.locator('#compactPlayers').isVisible(),false);
      await p.locator('#tableRules').click(); await p.waitForTimeout(50); assert.deepEqual(await camera(),before);
    }
    await p.keyboard.press('Escape');
    await p.screenshot({path:path.join(out,`table-${width}x${height}.png`)}); report.layouts.push(layout);
  }
  report.checks.push('Distinct phone/tablet/desktop layouts: permanent sidebar and hand/destinations on larger screens; phone portrait/landscape preserved; unique controls and unchanged renderer across rotations; 44px market/tools and stable camera on panel open');
  await p.setViewportSize({width:390,height:844});
  await p.locator('[data-panel="rules"]').click(); assert.match(await p.locator('#tableRulesContent').innerText(),/2 vagones o menos/);
  assert.deepEqual(await p.locator('#tableRulesContent tr').last().locator('td').allTextContents(),['1','2','4','7','15','21']);
  await p.screenshot({path:path.join(out,'table-rules.png')});
  await p.locator('#closeTablePanel').click();
  await p.locator('[data-panel="chat"]').click(); assert.equal(await p.locator('#tableChatInput').isDisabled(),false);
  await p.screenshot({path:path.join(out,'table-chat.png')});
  await p.keyboard.press('Escape'); await p.locator('#hand').press('Enter');assert.equal(await p.locator('#tableHandDetail .traincard').count(),9);
  await p.keyboard.press('Escape');
  await p.locator('[data-panel="destinations"]').click();await p.locator('#viewRoutes').click();
  await p.waitForSelector('#ticketMap');await p.keyboard.press('Escape');
  assert.equal(await p.locator('#overlay').isVisible(),false);
  assert.equal(await p.locator('[data-panel="destinations"]').evaluate(el=>document.activeElement===el),true);
  report.checks.push('Rules derive match values; chat opens with enabled composer; keyboard opens full hand and Escape closes panels');
  const count=g.players[0].hand.length;
  await p.locator('#drawblind').click(); await p.waitForFunction(()=>game.drawCount===1 && !pendingAction);
  assert.equal(g.players[0].hand.length,count+1); assert.match(await p.locator('#drawstats').innerText(),/Roba una carta más/);
  await p.locator('#drawblind').click(); await p.waitForFunction(()=>game.current===1);
  assert.equal(g.players[0].hand.length,count+2); await rival.waitForFunction(()=>game.current===1);
  assert.equal(await p.locator('#turnBanner').evaluate(el=>el.parentElement.dataset.player),'1');
  assert.equal(await p.locator('#drawblind').isDisabled(),true);
  await p.locator('[data-panel="history"]').click(); await p.locator('#history').evaluate(el=>el.scrollTop=0);await p.waitForTimeout(80);
  const scroll=await p.locator('#history').evaluate(el=>el.scrollTop);
  await rival.locator('#drawblind').click();await rival.waitForFunction(()=>game.drawCount===1 && !pendingAction);
  await rival.locator('#drawblind').click();await p.waitForFunction(()=>game.current===2);
  assert.equal(await p.locator('#history').evaluate(el=>el.scrollTop),scroll);
  assert.equal(await p.locator('#historyLatest').isVisible(),true);assert.equal(await p.locator('#historyScrollbar').isVisible(),true);
  await p.screenshot({path:path.join(out,'table-history.png')});
  await p.locator('#historyLatest').click();assert.equal(await p.locator('#historyUnread').isVisible(),false);
  await p.locator('#history').evaluate(el=>el.scrollTop=0);await p.waitForTimeout(50);
  const beforeFocus=await camera(); await p.locator('.history-route-focus').first().click();
  assert.equal(await p.locator('#returnMapView').isVisible(),true);assert.ok((await camera()).zoom>=2);
  await p.locator('#returnMapView').click();assert.deepEqual(await camera(),beforeFocus);
  report.checks.push('Two real draws update authoritative hand, second-draw hint and active clock; rival draws preserve reading position with unread/scrollbar; history route focuses and returns camera');
  await p.evaluate(()=>localStorage.setItem('rr-language','en'));await p.reload();await p.waitForFunction(()=>!!game&&!!board3D);
  await p.locator('[data-panel="rules"]').click();assert.match(await p.locator('#tableRulesContent').innerText(),/2 trains or fewer/);
  // A real construction triggers the final-round notice through server rules.
  const route=g.routes.find(r=>r.owner===null && r.n===2 && r.color==='orange' && !r.tunnel && !r.ferry);
  g.players[2].trains=4;g.players[2].hand.push('orange','orange');
  const builder=await page(2);
  await builder.evaluate(id=>{buildTarget={routeId:id};uiDialog='build';showBuildDialog();},route.id);
  await builder.locator('#confirmBuild').click();
  await p.waitForFunction(id=>game.routes.find(r=>r.id===id).owner===2,route.id);
  assert.equal(g.players[2].trains,2);assert.equal(g.players[2].score,6);
  await p.waitForFunction(()=>!document.getElementById('finalRoundNotice').classList.contains('hidden'));
  assert.match(await p.locator('#finalRoundNotice').innerText(),/Final round/);
  report.checks.push('Actual route payment updates ownership/score/trains and triggers the final round at exactly two remaining trains; English rule help');
  assert.deepEqual(report.errors,[]);
})().then(()=>console.log(JSON.stringify({checks:report.checks,errors:report.errors,viewports:report.layouts.map(l=>[l.width,l.height])}))).catch(error=>{report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
