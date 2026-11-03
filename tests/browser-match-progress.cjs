// Real WebSocket commands and recorded HTTP replay, with an isolated file store.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-progress-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),out=path.resolve(process.env.QA_OUT||'.qa/match-progress');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[]};let browser;
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const g=E.newGame(['Ana','Luis']);for(let i=0;i<2;i++)E.action(g,i,{type:'choose_initial',indexes:[0,1]});
 const ticket=E.definition(g).map.tickets.find(t=>t.a==='PAR'&&t.b==='VIE');
 const pathIds=E.connectionPath(g.routes,ticket.a,ticket.b),target=g.routes.find(r=>pathIds.includes(r.id)&&!r.tunnel&&!r.ferry&&r.color!=='gray');
 const spare=g.routes.find(r=>!pathIds.includes(r.id)&&[r.a,r.b].includes('BRE')&&[r.a,r.b].includes('DIE'));
 for(const r of g.routes)if(pathIds.includes(r.id)&&r.id!==target.id||r.id===spare.id){r.owner=0;g.players[0].trains-=r.n;g.players[0].score+=E.SCORE[r.n];}
 g.players[0].tickets=[ticket];g.players[1].tickets=[];g.players[0].hand=Array(10).fill(target.color);
 const room={code:'QAPROG',game:g,updated:Date.now(),visibility:'public',maxPlayers:2,archiveFull:true,members:[{name:'Ana',token:'progress-a'},{name:'Luis',token:'progress-b'}]};app.rooms.set(room.code,room);
 async function page(token,{mobile=false,language='es',watch=false}={}){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),p=await context.newPage();p.setDefaultTimeout(15000);
  p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  await p.addInitScript(({token,language})=>{if(token)localStorage.setItem('rr-room-QAPROG',token);if(!localStorage.getItem('rr-language'))localStorage.setItem('rr-language',language);},{token,language});
  await p.goto(base+(watch?'/?watch=QAPROG':'/?room=QAPROG'));await p.waitForFunction(()=>!!game&&!!board3D);return p;
 }
 const owner=await page('progress-a'),rival=await page('progress-b'),spectator=await page(null,{watch:true});
 await owner.keyboard.press('h');
 assert.equal(await owner.evaluate(()=>board3D.stats().spotlightRoutes.length),pathIds.length);assert.equal(await owner.evaluate(()=>board3D.stats().completedRoutes.length),0);
 await owner.evaluate(routeId=>{uiDialog='build';buildTarget={routeId};showBuildDialog();},target.id);await owner.locator('#confirmBuild').click();
 await owner.waitForFunction(id=>game.routes.find(r=>r.id===id).owner===0,target.id);await owner.waitForFunction(()=>!constructionBusy());
 await owner.waitForFunction(()=>board3D.stats().completedRoutes.length>0);
 assert.deepEqual((await owner.evaluate(()=>board3D.stats().completedRoutes)).sort(),pathIds.sort());
 assert.equal(await owner.evaluate(()=>board3D.stats().spotlightRoutes.length),pathIds.length+1);
 const ownerScore=await owner.locator('[data-player="0"] [data-metric="points"] strong').innerText();
 await rival.waitForFunction(()=>game.routes.some(r=>r.owner===0));
 const publicScore=await rival.locator('[data-player="0"] [data-metric="points"] strong').innerText();assert.equal(+ownerScore-(+publicScore),ticket.p);
 assert.equal(await spectator.locator('[data-player="0"] [data-metric="points"] strong').innerText(),publicScore);
 assert.equal(await owner.locator('[data-player="0"] .live-bonus').innerText(),'★ +10');
 const longest=owner.locator('#historyEntries .history-system');
 assert.equal(await longest.count(),1);assert.match(await longest.innerText(),/Ana lidera el camino más largo · \+10 provisional/);
 assert.equal(await longest.locator('.history-system-icon svg').count(),1);
 assert.equal(await longest.locator('.history-avatar').count(),0);
 assert.match(await longest.evaluate(el=>el.previousElementSibling.textContent),/Construyó/);
 assert.doesNotMatch(await longest.evaluate(el=>el.previousElementSibling.textContent),/camino más largo/);
 await owner.locator('.live-score-details summary').click();assert.match(await owner.locator('.live-score-details').innerText(),/Destinos cumplidos · privados/);
 const pulse=await owner.evaluate(()=>board3D.stats().goldOpacity);await owner.waitForTimeout(350);assert.notEqual(await owner.evaluate(()=>board3D.stats().goldOpacity),pulse);
 assert.equal(await owner.locator('.live-score-details dl').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+10,r.y+10)?.closest('dl')===el;}),true);
 await owner.screenshot({path:path.join(out,'desktop-gold-score.png')});
 await owner.emulateMedia({reducedMotion:'reduce'});await owner.waitForTimeout(100);const draws=await owner.evaluate(()=>board3D.stats().draws);await owner.waitForTimeout(180);assert.equal(await owner.evaluate(()=>board3D.stats().draws),draws);
 report.checks.push('H shows all own tracks, only completed connection glows; reduced motion stops the loop; owner-only destination points and public +10');
 await rival.locator('#drawblind').click();await rival.waitForFunction(()=>!pendingAction);await rival.locator('#drawblind').click();await rival.waitForFunction(()=>game.current===0);
 await owner.waitForFunction(()=>game.turnHistory.some(r=>r.events.filter(e=>e.type==='draw').length===2));
 const row=owner.locator('.turn-history-row').filter({hasText:'Luis'}).filter({hasText:'Robó'});assert.equal(await row.count(),1);assert.equal(await row.locator('img[src$="back.svg"]').count(),2);
 const ownRow=rival.locator('.turn-history-row').filter({hasText:'Luis'}).filter({hasText:'Robó'});assert.equal(await ownRow.locator('img[src$="back.svg"]').count(),2);
 assert.equal(await rival.evaluate(()=>game.turnHistory.flatMap(r=>r.events).filter(e=>e.type==='draw').every(e=>!!e.data.color)),true);
 assert.equal(await owner.evaluate(()=>game.turnHistory.flatMap(r=>r.events).filter(e=>e.type==='draw').every(e=>!('color' in e.data))),true);
 assert.equal(await spectator.evaluate(()=>game.turnHistory.flatMap(r=>r.events).filter(e=>e.type==='draw').every(e=>!('color' in e.data))),true);
 assert.match((await ownRow.innerText()).trim(),/^Luis\s+Robó$/);
 assert.doesNotMatch(await owner.locator('#historyEntries').innerText(),/\bT\d+\b/);
 assert.deepEqual(await ownRow.locator('img').evaluateAll(imgs=>imgs.map(img=>{const r=img.getBoundingClientRect();return [r.width,r.height];})),[[18,25],[18,25]]);
 const avatarCenters=await owner.evaluate(()=>{
  const row=document.querySelector('.turn-history-row[data-actor="0"]'),fixture=document.createElement('div');fixture.className='turn-history-row';
  fixture.innerHTML=playerAvatar(1,true,'bot');row.after(fixture);
  const offsets=[row.querySelector('.history-avatar'),fixture.querySelector('.history-avatar')].map(el=>{
   const circle=el.getBoundingClientRect(),symbol=el.querySelector('svg').getBoundingClientRect();
   return {x:Math.abs(circle.x+circle.width/2-symbol.x-symbol.width/2),y:Math.abs(circle.y+circle.height/2-symbol.y-symbol.height/2)};
  });fixture.remove();return offsets;
 });assert.ok(avatarCenters.every(d=>d.x<.1&&d.y<.1));
 await owner.locator('.history-panel').screenshot({path:path.join(out,'history-compact-desktop.png')});
 await owner.locator('#drawtickets').click();await owner.waitForSelector('#keep');await owner.locator('.keep').first().check();await owner.locator('#keep').click();
 await owner.waitForFunction(()=>!game.ticketOffer);assert.match(await owner.locator('#historyEntries').innerText(),/recibió 3, conservó 1, descartó 2/);
 report.checks.push('Real draws show compact backs even for the owner, server still filters rival/spectator colors; centered human/bot avatars, no turn labels; longest route is a separate system row');
 report.checks.push('Ticket offer and confirmation produce one row with received/kept/discarded');
 await rival.close();await owner.waitForFunction(()=>game.turnHistory.some(r=>r.events.some(e=>e.type==='disconnected')));
 const returned=await page('progress-b');await owner.waitForFunction(()=>game.turnHistory.some(r=>r.events.some(e=>e.type==='connected')));
 await owner.reload();await owner.waitForFunction(()=>!!game&&!!board3D);assert.match(await owner.locator('#historyEntries').innerText(),/Se desconectó/);
 await owner.setViewportSize({width:390,height:844});await owner.waitForTimeout(100);await owner.locator('[data-player="0"]').click();await owner.locator('#compactPlayerDetail summary').click();
 assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await owner.screenshot({path:path.join(out,'mobile-score.png')});
 await owner.locator('[data-panel="history"]').click();await longest.scrollIntoViewIfNeeded();
 assert.equal(await owner.locator('#history').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await owner.locator('.history-panel').screenshot({path:path.join(out,'history-compact-mobile.png')});
 report.checks.push('Disconnect/reconnect are visible and survive reload; mobile score breakdown does not overflow');
 await owner.evaluate(()=>localStorage.setItem('rr-language','en'));await owner.reload();await owner.waitForFunction(()=>!!game&&!!board3D);await owner.locator('[data-player="0"]').click();assert.match(await owner.locator('#compactPlayerDetail').innerText(),/Your score/);
 assert.match(await owner.locator('#historyEntries .history-system').innerText(),/Ana leads the longest route/);
 const matchId=room.matchId;
 // Finish in the fixture, then publish through an ordinary reconnect, keeping
 // the public replay authorization and HTTP transport real.
 E.finish(g);await returned.reload();await returned.waitForFunction(()=>game.phase==='finished');
 const replay=await browser.newPage({viewport:{width:1440,height:1000}});replay.on('pageerror',e=>report.errors.push(e.message));
 await replay.goto(base+'/replay?id='+matchId);await replay.waitForSelector('#replayLast');await replay.locator('#replayLast').click();await replay.waitForTimeout(150);
 assert.ok(await replay.locator('.turn-history-row.replay-history-row').count()>0);assert.equal(await replay.locator('.turn-history-row').filter({hasText:'Luis'}).filter({hasText:'Robó'}).count(),1);
 assert.equal(await replay.locator('.turn-history-row').filter({hasText:'Luis'}).filter({hasText:'Robó'}).locator('img[src$="back.svg"]').count(),0);
 assert.equal(await replay.locator('#replayViewer option').count(),3);
 for(const value of ['-1','0','1']){
  await replay.locator('#replayViewer').selectOption(value);
  assert.equal(await replay.locator('.history-drawn-cards img[src$="back.svg"]').count(),0);
 }
 await replay.locator('#replaySecretsOpen').click();await replay.waitForSelector('#replaySecrets[open]');
 assert.match(await replay.locator('#replaySecretsContent').innerText(),/Mazos y descartes/);
 assert.equal(await replay.locator('a[href$="/audit"]').count(),0);
 await replay.keyboard.press('Escape');
 const replayMilestone=replay.locator('#historyEntries .history-system');assert.equal(await replayMilestone.count(),1);
 const milestoneStep=+(await replayMilestone.getAttribute('data-step'));
 await replay.locator('#replayFirst').click();assert.equal(await replayMilestone.getAttribute('aria-current'),'false');
 assert.match(await replayMilestone.getAttribute('class'),/is-future/);
 await replayMilestone.click();assert.equal(await replayMilestone.getAttribute('aria-current'),'step');
 assert.equal(+(await replay.locator('#replaySeek').inputValue()),milestoneStep);
 await replay.locator('#replayLast').click();
 await replay.screenshot({path:path.join(out,'public-replay.png')});report.checks.push('English copy and public replay: all perspectives, real draw colors, full card/deck details and restricted identity audit');
 assert.deepEqual(report.errors,[]);
})().then(()=>{console.log(JSON.stringify(report));}).catch(error=>{report.failure=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});});
