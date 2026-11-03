const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {once}=require('node:events'),{chromium}=require('playwright'),E=require('../backend/engine'),Bots=require('../backend/bots');
const {random}=require('./helpers/bot-match'),{identity,cookie}=require('./helpers/map-recording');
const {createMatchArchive}=require('../backend/match-archive'),{saveCheckpoint}=require('../backend/room-store');
const out=path.resolve(process.env.QA_OUT||'docs/qa/replay-analysis'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'replay-analysis-'));
const report={date:new Date().toISOString(),errors:[],tests:[]};let browser,app;
(async()=>{
 fs.mkdirSync(out,{recursive:true});const rng=random(20261103),game=E.newGame(['Cóndor','Jaguar','Llama','Capibara'],0,0,null,{mapRef:{id:'south-america',version:'3.3-beta'},random:rng});
 const room={code:'REPLAY',visibility:'public',archiveFull:true,game,members:game.players.map((p,i)=>({name:p.name,color:p.color,bot:i>0,guestId:i?'other':identity.guestId}))};
 const archive=createMatchArchive(),capture=()=>{archive.capture(room);archive.commit(archive.prepare());};capture();let now=0;
 for(let steps=0;game.phase!=='finished'&&steps<1500;steps++){
  if(E.tunnelBusy(game)){now=Math.max(now,game.pending.until);E.expire(game,now,rng);}
  else{let seat=game.phase==='initial'?game.players.findIndex(p=>p.pending.length):game.phase==='tunnel'?-1:game.players.findIndex(p=>p.offer);if(seat<0)seat=game.current;const action=Bots.chooseBotAction(game,seat,rng);assert.ok(action);E.action(game,seat,action,{now:++now,random:rng});}capture();
 }
 assert.equal(game.phase,'finished');const file=path.join(dir,'state.json');saveCheckpoint(file,{rooms:[],archive:archive.state});
 Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false'});delete process.env.RENDER;app=require('../backend/server');await app.ready;app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});report.browser=browser.version();
 for(const full of [true,false]){
  const context=await browser.newContext({viewport:{width:1460,height:940}});if(full)await context.addCookies([{name:'trencitos_guest',value:cookie.split('=')[1],url:base,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.stack));
  await page.route('**/api/history/*',async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.continue();});
  await page.goto(`${base}/replay?id=${room.matchId}`);await page.locator('#replayLoading[open]').waitFor();assert.match(await page.locator('#replayLoading').innerText(),/Preparando/);
  await page.waitForFunction(()=>game&&board3D&&!document.querySelector('#replayLoading[open]'));
  const response=await(await context.request.get(`${base}/api/history/${room.matchId}?analysis=1`)).json();assert.equal(response.full,full);
  assert.ok(await page.locator('.replay-history-row').count()>100);assert.equal(await page.locator('#replayControls').evaluate(n=>n.parentElement.id),'gameSidebar');
  await page.locator('#replayNextBuild').click();assert.ok(await page.locator('.replay-history-row.is-current').count());
  if(full){await page.locator('[data-viewer="2"]').click();await page.locator('#replayNext').click();assert.equal(await page.evaluate(()=>seat),2);assert.equal(await page.locator('[data-viewer="2"]').getAttribute('aria-pressed'),'true');}
  await page.locator('#replayLast').click();await page.waitForFunction(()=>game.phase==='finished');
  await page.locator('.replay-analysis summary').click();
  if(full){for(const result of game.result)assert.equal(response.analysis.at(-1).players[result.seat].projectedScore,result.score);assert.match(await page.locator('#replayStats').innerText(),/Puntuación si terminara ahora/);}
  else {assert.equal(await page.locator('#replaySecretsOpen').count(),0);assert.ok(!JSON.stringify(response.analysis).includes('projectedScore'));assert.deepEqual(await page.evaluate(()=>[game.hand,game.tickets]),[[],[]]);}
  await page.screenshot({path:path.join(out,(full?'participant':'public')+'-desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal(await page.locator('#replayControls').evaluate(n=>n.parentElement.tagName),'BODY');assert.equal(await page.locator('#replayDock').getAttribute('open'),null);
  await page.locator('#replayDock > summary').click();await page.locator('#replayFirst').click();await page.screenshot({path:path.join(out,(full?'participant':'public')+'-mobile.png')});
  assert.ok(await page.locator('#replayControls').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));report.tests.push({full,frames:response.frames.length,history:true,loading:true,viewpoint:true,milestones:true,stats:true,mobile:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(error=>{report.failure=error.stack;process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(app)await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));});
