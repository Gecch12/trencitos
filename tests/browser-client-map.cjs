// Real app/replay/Three.js with an injected test layout catalog. The live map
// catalog/selector still offers Europe only; this is not two-map room acceptance.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {once}=require('node:events'), {chromium}=require('playwright');
const {engine,layout,reference}=require('./helpers/client-map'), {identity,cookie}=require('./helpers/map-recording');
const {createMatchArchive}=require('../backend/match-archive'), {saveCheckpoint}=require('../backend/room-store');
const out=path.resolve(process.env.QA_OUT || 'docs/qa/client-map'), directory=fs.mkdtempSync(path.join(os.tmpdir(),'client-map-'));
const report={date:new Date().toISOString(),scope:'Replay HTTP and actual app with injected test layout catalog; no second-map live lobby',tests:[],errors:[]};
let app,browser;
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const game=engine.newGame(['Fixture A','Fixture B'],0,Date.now(),null,{mapRef:reference,random:()=>.5});
  game.phase='play'; game.players.forEach(p=>{p.pending=[];p.tickets=[];});
  game.players[0].tickets=engine.contextFor(game).tickets.slice(0,2); game.players[0].hand=['red','red']; game.players[1].hand=['green'];
  const room={code:'CLIENT',visibility:'public',archiveFull:true,game,members:game.players.map((p,i)=>({name:p.name,color:p.color,guestId:i?'other':identity.guestId}))};
  const archive=createMatchArchive({engine}), save=()=>{archive.capture(room);archive.commit(archive.prepare());};
  save(); engine.action(game,0,{type:'claim',routeId:'rail"[odd]',color:'red',wildCount:0}); save();
  engine.action(game,1,{type:'claim',routeId:'last',color:'green',wildCount:0}); save(); engine.finish(game,true); save();
  const record=archive.state.matches[room.matchId], file=path.join(directory,'state.json');
  saveCheckpoint(file,{rooms:[],archive:{matches:{[record.id]:record},claims:{}}});
  Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false'}); delete process.env.RENDER;
  app=require('../backend/server');await app.ready;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});report.browser=browser.version();
  for(const mode of ['unsupported','desktop','mobile']){
    const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1460,height:940},reducedMotion:'reduce'});
    await context.addCookies([{name:'trencitos_guest',value:cookie.split('=')[1],url:base,httpOnly:true,sameSite:'Lax'}]);
    if(mode!=='unsupported'){
      const source=fs.readFileSync(require.resolve('../frontend/match-presentation'),'utf8');
      // Inject only the catalog dependency. Production source/functions remain unchanged.
      await context.route('**/match-presentation.js',route=>route.fulfill({contentType:'text/javascript',body:source+`\n{const create=MatchPresentation.create;MatchPresentation.create=options=>create({...options,layouts:[EuropeLayoutV1,${JSON.stringify(layout)}]});}`}));
    }
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
    await page.goto(`${base}/replay?id=${record.id}`);
    if(mode==='unsupported'){
      await page.locator('#unsupportedMapHome').waitFor();
      assert.equal(await page.evaluate(()=>game),null);assert.equal(await page.locator('.board-3d-canvas').count(),0);
      assert.match(await page.locator('#dialog').innerText(),/diseño de este mapa/);
      report.tests.push({mode,rejectedWithoutEuropeFallback:true});
    }else{
      await page.waitForFunction(()=>game && board3D);
      assert.deepEqual(await page.evaluate(()=>[matchContext.cityName('A'),boardMap.bounds.width,MAP_GEOMETRY.length]),['Alpha',540,4]);
      const paths=await page.evaluate(()=>game.routes.map(r=>({id:r.id,cells:geometryFor(r.id).cells.length,expected:r.n})));
      assert.ok(paths.every(p=>p.cells===p.expected));
      // Quoted ticket IDs survive HTML attributes, DOM lookup, selection and SVG previews.
      if(mode==='mobile')await page.locator('[data-panel="destinations"]').click();
      await page.locator('#ticketList [data-destination]').first().click();
      assert.deepEqual(await page.evaluate(()=>[...ticketChoices]),[0]);
      assert.equal(await page.locator('#dialog [data-ticket-id]').first().getAttribute('data-ticket-id'),'ticket"[odd]');
      await page.locator('#closeRoutes').click();
      const routeIndex=await page.locator('#board [data-route-id]').evaluateAll(nodes=>nodes.findIndex(n=>n.dataset.routeId==='rail"[odd]'));
      await page.locator('#board [data-route-id]').nth(routeIndex).focus();await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>selected),'rail"[odd]');
      await page.keyboard.press('Escape');
      await page.locator('#replayLast').click();await page.waitForFunction(()=>game.phase==='finished');
      assert.equal(await page.evaluate(()=>board3D.stats().wagons),3);
      assert.ok(await page.evaluate(()=>game.ticketPaths.some(p=>p.routes.includes('rail"[odd]'))));
      await page.locator('#replaySecretsOpen').click();assert.match(await page.locator('#replaySecretsContent').innerText(),/Alpha/);
      await page.evaluate(()=>document.getElementById('replaySecrets').close());
      await page.locator('#replayViewer').selectOption('-1');
      assert.deepEqual(await page.evaluate(()=>[game.hand,game.tickets]),[[],[]]);
      await page.locator('#replayFirst').click();await page.waitForFunction(()=>game.phase==='play');
      await page.locator('#replayLast').click();await page.waitForFunction(()=>game.phase==='finished');
      assert.equal(await page.locator('.board-3d-canvas').count(),1);
      report.tests.push({mode,opaqueRoutes:paths.map(p=>p.id),quotedTicketSelection:true,seek:true,privacy:true,wagons:3});
    }
    await page.screenshot({path:path.join(out,mode+'.png'),fullPage:true});await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(error=>{report.failure=error.stack;process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();if(app)await app.shutdown();fs.rmSync(directory,{recursive:true,force:true});
  fs.writeFileSync(path.join(out,'client-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
});
