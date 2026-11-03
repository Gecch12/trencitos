// A real host plus four permanent bots; production timers, protocol and rules.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {once}=require('node:events'),{chromium}=require('playwright');
const E=require('../backend/engine'),{chooseBotAction}=require('../backend/bots'),{verifyAudit}=require('../scripts/verify-match-audit');
const out=path.resolve(process.env.QA_OUT||'docs/qa/south-america'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'south-america-browser-'));
const report={date:new Date().toISOString(),errors:[],tests:[]};let app,browser,page;
const save=()=>fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
(async()=>{
  fs.mkdirSync(out,{recursive:true});Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(dir,'state.json'),AUTH_ENABLED:'false'});delete process.env.RENDER;
  app=require('../backend/server');await app.ready;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1460,height:940}});page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  await page.goto(base);await page.locator('#create').click();await page.waitForFunction(()=>!!room);
  await page.locator('[data-map-id="south-america"]').click();await page.waitForFunction(()=>roomMapRef.id==='south-america');
  const code=await page.locator('#roomcode').textContent();
  for(let n=2;n<=5;n++){await page.evaluate(()=>send({type:'add_bot'}));await page.waitForFunction(n=>members.length===n,n);}
  await page.screenshot({path:path.join(out,'lobby-four-bots.png')});await page.locator('#start').click();await page.waitForFunction(()=>game?.phase==='initial'&&board3D);
  const room=app.rooms.get(code);assert.equal(room.members.filter(m=>m.bot).length,4);await page.screenshot({path:path.join(out,'initial-desktop.png')});
  let actions=0,lastTurn=0;const deadline=Date.now()+15*60*1000;
  while(room.game.phase!=='finished'&&Date.now()<deadline){
    const g=room.game;
    if(Date.now()>=(g.construction?.until||0)&&!E.tunnelBusy(g)&&(g.players[0].pending.length||g.phase!=='tunnel'&&g.players[0].offer||g.current===0&&!['initial','closing'].includes(g.phase))){
      const action=chooseBotAction(g,0);assert.ok(action);
      await page.waitForFunction(()=>!pendingAction&&!marketRefresh&&!constructionBusy());
      const revision=room.revision;await page.evaluate(a=>act(a.type,a),action);
      await page.waitForFunction(r=>game.revision>r,revision);actions++;
    }
    if(g.turnSerial>=lastTurn+25){lastTurn=g.turnSerial;console.log(`South America host + four bots: turn ${lastTurn}`);report.turns=lastTurn;save();}
    await page.waitForTimeout(260);
  }
  assert.equal(room.game.phase,'finished');assert.equal(room.game.finalRemaining,0);
  await page.waitForFunction(()=>game?.phase==='finished');await page.screenshot({path:path.join(out,'finished-desktop.png')});
  const stats=await page.evaluate(()=>board3D.stats()),expected=room.game.routes.filter(r=>r.owner!==null).reduce((sum,r)=>sum+r.n,0);assert.equal(stats.wagons,expected);
  const audit=await(await context.request.get(`${base}/api/history/${room.matchId}/audit`)).json();assert.equal(verifyAudit(audit).integrity,true);
  await page.goto(`${base}/replay?id=${room.matchId}`);await page.waitForFunction(()=>game&&board3D);
  await page.locator('#replayLast').click();await page.waitForFunction(()=>game.phase==='finished');assert.equal(await page.evaluate(()=>board3D.stats().wagons),expected);
  await page.locator('#replayViewer').selectOption('-1');assert.deepEqual(await page.evaluate(()=>[game.hand,game.tickets]),[[],[]]);
  await page.screenshot({path:path.join(out,'replay-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'replay-mobile.png')});
  assert.equal(await page.locator('.board-3d-canvas').count(),1);assert.deepEqual(report.errors,[]);
  report.tests=['map selection','host + four permanent bots','natural finish','rendered wagons match ownership','audit hash chain','replay seek','public privacy','desktop and mobile'];
  report.game={turns:room.game.turnSerial,hostActions:actions,bots:4,wagons:expected,scores:room.game.result.map(({name,score,winner})=>({name,score,winner}))};report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{if(browser)await browser.close();if(app)await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});save();console.log(JSON.stringify(report));});
