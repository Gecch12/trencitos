// Local replay acceptance: real HTTP streaming, the live table and shared effects.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {once}=require('node:events'),{chromium}=require('playwright'),E=require('../backend/engine');
const {createMatchArchive}=require('../backend/match-archive'),{saveCheckpoint}=require('../backend/room-store');
const {streamReplay}=require('../game/queries/replay-view'),Replay=require('../shared/replay-state');
const out=path.resolve(process.env.QA_OUT||'.qa/replay-experience/browser'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'replay-experience-'));
const report={date:new Date().toISOString(),errors:[],tests:[]};let browser,app,releaseSlow;
function fixture(){
 const game=E.newGame(['Ángel','Bot 1','Bot 2','Bot 3'],0,Date.now(),null,{random:n=>n-1});
 const room={code:'REPLAY',visibility:'public',archiveFull:true,game,members:game.players.map((p,i)=>({name:p.name,color:p.color,bot:i>0}))};
 const archive=createMatchArchive(),save=()=>{archive.capture(room);archive.commit(archive.prepare());};save();
 E.observe(game,event=>{room.archiveAction=event;save();});
 for(const seat of [0,1,2,3])E.action(game,seat,{type:'choose_initial',indexes:[0,1]},{random:n=>n-1});
 game.face=['wild','wild','red','blue','green'];game.deck=['orange','yellow','purple','white','wild'];game.discard=[];save();
 E.action(game,0,{type:'draw_train',index:2},{random:n=>n-1});
 E.action(game,0,{type:'draw_train',index:-1},{random:n=>n-1});
 E.action(game,1,{type:'draw_train',index:-1},{random:n=>n-1});
 E.action(game,1,{type:'draw_train',index:game.face.findIndex(c=>c!=='wild')},{random:n=>n-1});
 const route=game.routes.find(r=>!r.tunnel&&!r.ferry&&r.n===2&&r.color==='gray');assert.ok(route);
 game.players[2].hand=['red','red'];save();E.action(game,2,{type:'claim',routeId:route.id,color:'red',wildCount:0},{random:n=>n-1});
 E.finish(game,true);save();return archive.state.matches[room.matchId];
}
function readMatch(file,id){
 const {frameStore,...record}=JSON.parse(fs.readFileSync(file)).archive.matches[id];
 record.frames=fs.readFileSync(file+'.archive/'+crypto.createHash('sha256').update(id).digest('hex')+'.jsonl','utf8').split('\n').filter(Boolean).slice(0,frameStore.count).map(JSON.parse);
 return record;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const record=fixture(),matches={[record.id]:record};
 const real=process.env.QA_MATCH_FILE?readMatch(process.env.QA_MATCH_FILE,process.env.QA_MATCH_ID):null;if(real)matches[real.id]=real;
 const file=path.join(dir,'state.json');saveCheckpoint(file,{rooms:[],archive:{matches,claims:{}}});
 Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false'});delete process.env.RENDER;
 app=require('../backend/server');await app.ready;
 const handler=app.server.listeners('request')[0];app.server.removeListener('request',handler);
 app.server.on('request',async(req,res)=>{
  if(!req.url.startsWith('/__qa/'))return handler(req,res);
  res.setHeader('Content-Type','application/x-ndjson');let count=0;
  for await(const line of streamReplay(record,{full:true,compact:true},record.frames)){
   if(req.url==='/__qa/broken'&&count===2)break;
   res.write(line);count++;if(req.url==='/__qa/slow'&&count===2)await new Promise(resolve=>{releaseSlow=resolve;});
  }
  res.end();
 });
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});report.browser=browser.version();
 async function open({width=1460,height=940,reducedMotion='no-preference',id=record.id,source}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion});const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.errors.push(e.stack));page.on('websocket',()=>report.errors.push('Replay opened a game WebSocket'));
  if(source)await page.route('**/api/history/*',route=>route.continue({url:base+'/__qa/'+source}));
  await page.addInitScript(()=>{
   window.replayEffects=[];new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){
    if(node.classList?.contains('draw-flight'))replayEffects.push({type:'draw',colors:[...node.querySelectorAll('img')].map(i=>i.dataset.cardColor),duration:node.getAnimations()[0]?.effect.getTiming().duration});
    if(node.classList?.contains('market-refresh-layer'))replayEffects.push({type:'renewal',cards:node.children.length});
   }}).observe(document,{subtree:true,childList:true});
  });
  await page.goto(`${base}/replay?id=${id}`);return page;
 }
 const slow=await open({source:'slow'});await slow.waitForFunction(()=>!!game&&!document.querySelector('#replayLoading[open]'));
 assert.equal(await slow.locator('#replayProgress').isVisible(),true,'first state is usable before the rest of the stream');
 assert.equal(await slow.locator('#replayLast').isDisabled(),true);releaseSlow();releaseSlow=null;
 await slow.waitForFunction(()=>document.getElementById('replayProgress').hidden);await slow.context().close();report.tests.push('First paint while the remaining frames are held on the server');
 const cursor=Replay.cursor(),steps=[];let prior=0;
 for(const [i,frame]of record.frames.entries()){
  const state=cursor.push(frame);for(const e of state.game.events||[])if(e.id>prior)steps.push({...e,step:i});prior=Math.max(prior,...(state.game.events||[]).map(e=>e.id));
 }
 const publicDraw=steps.find(e=>e.type==='draw'&&e.index>=0),blind=steps.find(e=>e.type==='draw'&&e.index===-1),build=steps.find(e=>e.type==='build');assert.ok(publicDraw&&blind&&build);
 const page=await open();await page.waitForFunction(()=>game&&board3D&&document.getElementById('replayProgress').hidden);
 assert.equal(await page.locator('#replayControls').evaluate(n=>n.parentElement.tagName),'BODY');
 assert.equal(await page.locator('#replayNext').isVisible(),true,'desktop replay transport remains visible over the map');
 const seek=async(p,n)=>{await p.locator('#replaySeek').evaluate((input,n)=>{input.value=n;input.dispatchEvent(new Event('input',{bubbles:true}));},n);};
 assert.equal(await page.locator('#replayViewer,#replaySecretsOpen,#replaySecrets,#replayStats,#replayMilestones,#replayNextBuild,#replayEvent,#replayMarket').count(),0);
 assert.equal(await page.locator('#scores .player-avatar').count(),4);assert.equal(await page.locator('#scores .player-avatar.is-bot').count(),3);
 assert.equal(await page.locator('#market').isVisible(),true);
 await page.locator('#scores [data-player="2"] .player-avatar').click();assert.equal(await page.evaluate(()=>seat),2);assert.equal(await page.locator('#scores [data-player="2"]').getAttribute('aria-pressed'),'true');
 await page.locator('#scores [data-player="0"] .player-avatar').click();
 await seek(page,publicDraw.step-1);await page.evaluate(()=>replayEffects=[]);await page.locator('#replayNext').click();
 await page.waitForFunction(()=>replayEffects.some(e=>e.type==='draw'));assert.equal((await page.evaluate(()=>replayEffects.find(e=>e.type==='draw'))).duration,680);
 await page.waitForFunction(()=>replayEffects.some(e=>e.type==='renewal'));await page.waitForFunction(()=>!marketRefresh);
 assert.deepEqual(await page.locator('#market [data-market-index] img').evaluateAll(imgs=>imgs.map(i=>i.dataset.cardColor)),await page.evaluate(()=>game.face));
 await seek(page,blind.step-1);const beforeHand=await page.evaluate(()=>game.hand.length);await page.evaluate(()=>replayEffects=[]);await page.locator('#replayNext').click();await page.waitForFunction(()=>replayEffects.some(e=>e.type==='draw'));
 assert.deepEqual((await page.evaluate(()=>replayEffects.find(e=>e.type==='draw'))).colors,['back',blind.color]);
 assert.equal(await page.locator('#handCount').innerText(),`${beforeHand} cartas`);
 await page.waitForFunction(()=>drawPresentations.size===0);assert.equal(await page.locator('#handCount').innerText(),`${beforeHand+1} cartas`);
 await page.locator('#replayFirst').click();assert.equal(await page.locator('.draw-flight,.market-refresh-layer').count(),0);
 await page.locator('#replaySpeed').selectOption('4');await seek(page,blind.step-1);await page.evaluate(()=>replayEffects=[]);await page.locator('#replayNext').click();
 await page.waitForFunction(()=>replayEffects.some(e=>e.type==='draw'));assert.equal((await page.evaluate(()=>replayEffects.find(e=>e.type==='draw'))).duration,170);
 await page.locator('#scores [data-player="1"] .player-avatar').click();await seek(page,blind.step-1);await page.evaluate(()=>replayEffects=[]);await page.locator('#replayNext').click();await page.waitForFunction(()=>replayEffects.some(e=>e.type==='draw'));
 assert.deepEqual((await page.evaluate(()=>replayEffects.find(e=>e.type==='draw'))).colors,[blind.color]);
 await page.locator('#replaySpeed').selectOption('1');await seek(page,build.step-1);await page.locator('#replayNext').click();await page.waitForFunction(()=>!!constructionFocus);
 await page.locator('#replayFirst').click();assert.equal(await page.evaluate(()=>constructionFocus),null);
 await seek(page,blind.step-1);await page.evaluate(()=>replayEffects=[]);await page.locator('#replayPlay').click();await page.waitForFunction(()=>replayEffects.some(e=>e.type==='draw'));await page.locator('#replayPlay').click();assert.equal(await page.locator('.draw-flight').count(),0);
 await seek(page,publicDraw.step-1);const initial=page.locator('[data-history-id="initial:0"]');assert.equal(await initial.locator('.history-ticket').count(),4);
 assert.equal(await initial.locator('.history-ticket-status.kept').count(),2);assert.equal(await initial.locator('.history-ticket-status.discarded').count(),2);assert.doesNotMatch(await initial.innerText(),/Ofrecidos|Conservados|Descartados|conservó|descartó/);
 const stable=await initial.elementHandle();await page.locator('#replayNext').click();assert.equal(await stable.evaluate(n=>n.isConnected),true,'unchanged rows are not recreated');
 await page.screenshot({path:path.join(out,'desktop.png')});
 await seek(page,build.step);
 const highlighted=await page.locator('#historyEntries .is-current').evaluateAll(rows=>rows.map(row=>{
  const r=row.getBoundingClientRect(),s=getComputedStyle(row),avatar=row.querySelector('.history-avatar')?.getBoundingClientRect();
  return {width:r.width,available:row.parentElement.clientWidth,radius:s.borderRadius,avatarInset:avatar?avatar.left-r.left:null,padding:s.paddingLeft};
 }));
 assert.ok(highlighted.some(row=>row.avatarInset!==null));
 for(const row of highlighted){assert.ok(Math.abs(row.width-row.available)<1);assert.equal(row.radius,'0px');assert.ok(parseFloat(row.padding)>=10);if(row.avatarInset!==null)assert.ok(row.avatarInset>=10);}
 await page.locator('#history').screenshot({path:path.join(out,'history-highlight.png')});
 await page.locator('#replayLast').click();assert.equal(await page.locator('#replaySeek').evaluate(n=>n.value===n.max),true);
 await page.locator('#replayControls').screenshot({path:path.join(out,'progress-complete.png')});
 report.tests.push('Normal player avatars and market; one destination list; stable history DOM; visible/blind/rival draws with hand count on landing, renewal, construction, pause, seek and 4× speed');
 // Reusing event IDs from the just-finished live game must not hide replay cards.
 await page.locator('#scores [data-player="0"] .player-avatar').click();
 for(const speed of ['0.5','1','2','4','8']){
  await page.locator('#replaySpeed').selectOption(speed);await seek(page,publicDraw.step-1);
  await page.evaluate(ids=>{ids.forEach(id=>handledDrawEvents.add(id));replayEffects=[];},steps.filter(e=>e.type==='draw'&&e.seat===0).map(e=>e.id));
  await page.locator('#replayPlay').click();
  await page.waitForFunction(n=>Number(document.getElementById('replaySeek').value)>=n,blind.step);
  await page.waitForFunction(()=>drawPresentations.size===0);
  assert.ok((await page.evaluate(()=>replayEffects.filter(e=>e.type==='draw').length))>=2,`both own draws animate at ${speed}x despite live receipts`);
  assert.equal(await page.locator('#handCount').innerText(),`${await page.evaluate(()=>game.hand.length)} cartas`);
  assert.equal(await page.locator('#hand .is-arriving').count(),0);
  if(await page.locator('#replayPlay').getAttribute('aria-label')==='Pausar')await page.locator('#replayPlay').click();
  assert.equal(await page.locator('.draw-flight,.market-refresh-layer').count(),0);
 }
 report.tests.push('Continuous 0.5/1/2/4/8x replay ignores live draw receipts and always settles the recorded hand');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
 await seek(page,publicDraw.step-1);await page.locator('#replayNext').click();
 assert.equal(await page.locator('#market').isVisible(),true);assert.equal(await page.locator('#replayControls').evaluate(n=>n.parentElement.tagName),'BODY');
 assert.ok(await page.locator('#replayControls').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
 await page.screenshot({path:path.join(out,'mobile.png')});
 await page.locator('[data-panel="history"]').click();await page.screenshot({path:path.join(out,'mobile-history.png')});report.tests.push('Mobile reuses the live market, hand, player strip and history panels');
 await page.context().close();
 const reduced=await open({reducedMotion:'reduce'});await reduced.waitForFunction(()=>game&&document.getElementById('replayProgress').hidden);await seek(reduced,blind.step-1);await reduced.evaluate(()=>replayEffects=[]);await reduced.locator('#replayNext').click();await reduced.waitForTimeout(200);assert.ok(!(await reduced.evaluate(()=>replayEffects)).some(e=>e.type==='draw'));await reduced.context().close();report.tests.push('Reduced motion respects the existing preference');
 const broken=await open({source:'broken'});await broken.locator('#retryReplay').waitFor();assert.equal(await broken.locator('#replayLoading').getAttribute('open'),'');await broken.context().close();report.tests.push('Interrupted stream is reported as an error, never a complete recording');
 if(real){
  const p=await open({id:real.id,width:1900,height:1080});await p.waitForFunction(()=>game&&board3D&&!document.querySelector('#replayLoading[open]'));
  report.firstUsableMs=await p.evaluate(()=>performance.now());await p.waitForFunction(()=>document.getElementById('replayProgress').hidden);
  await seek(p,114);await p.screenshot({path:path.join(out,'recorded-match.png')});
  await p.locator('#replayLast').click();assert.equal(await p.locator('#replayPosition').innerText(),`${real.steps}/${real.steps}`);
  report.tests.push(`Recorded local match: ${real.steps} steps, first paint, step 115 and final state`);await p.context().close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(error=>{report.failure=error.stack;process.exitCode=1;}).finally(async()=>{
 releaseSlow?.();if(browser)await browser.close();if(app)await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
});
