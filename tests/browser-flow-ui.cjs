// Real HTTP/WebSocket + Chrome, isolated from the developer's running game.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {chromium} = require('playwright');
const E = require('../backend/engine'), {tunnelRoom} = require('./helpers/tunnel-preview'), {resultsRoom} = require('./helpers/results-preview');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-flow-'));
Object.assign(process.env, {STATE_BACKEND:'file', STATE_FILE:path.join(temp,'state.json'), AUTH_ENABLED:'false'});
const app = require('../backend/server'), out = path.resolve('.qa/flow-ui');fs.mkdirSync(out,{recursive:true});
const report = {checks:[],errors:[],date:new Date().toISOString()};
let browser;
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base = 'http://127.0.0.1:'+app.server.address().port;
 browser = await chromium.launch({channel:'chrome',headless:true});
 async function page(url, options={}) {
  const context=await browser.newContext({viewport:{width:1440,height:900},...options});const p=await context.newPage();p.setDefaultTimeout(10000);
  const target=new URL(base+url), credential=new URLSearchParams(target.hash.slice(1)).get('recover');
  if(credential)await p.addInitScript(({code,credential})=>localStorage.setItem('rr-room-'+code,credential),{code:target.searchParams.get('room'),credential});
  p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  await p.goto(base+url);await p.waitForFunction(()=>!!game);return p;
 }
 const initial={code:'QAINIT',updated:Date.now(),visibility:'private',maxPlayers:2,game:E.newGame(['QA','Rival']),members:[{name:'QA',token:'init-a'},{name:'Rival',token:'init-b'}]};
 app.rooms.set(initial.code,initial);
 const ip=await page('/?room=QAINIT#recover=init-a');
 await ip.waitForSelector('#ticketMap');
 assert.equal(await ip.locator('.ticket-intro').count(),0);assert.equal(await ip.locator('#ticketMapCaption').count(),0);
 const ratio=()=>ip.locator('[data-countdown]').evaluate(el=>parseFloat(el.style.getPropertyValue('--time-left')));
 const before=await ratio();await ip.waitForTimeout(350);assert.ok(await ratio()<before);
 await ip.screenshot({path:path.join(out,'initial-desktop.png')});
 for(const [w,h] of [[390,844],[844,390]]) {await ip.setViewportSize({width:w,height:h});await ip.waitForTimeout(100);assert.equal(await ip.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await ip.locator('#keep').isVisible(),true);}
 await ip.screenshot({path:path.join(out,'initial-mobile-landscape.png')});await ip.close();
 report.checks.push('Initial tickets: shrinking bar, removed help, mobile/landscape controls');
 for(const kind of ['zero','color','decline']) {
  const room=tunnelRoom({zero:'QATUN0',color:'QATUN1',decline:'QATUN2'}[kind],kind,true);room.practice=false;room.visibility='public';room.maxPlayers=4;room.archiveFull=true;
  app.rooms.set(room.code,room);
  const actor=await page('/?room='+room.code+'#recover=preview-human');
  const rival=await page('/?room='+room.code+'#recover=preview-1',{reducedMotion:'reduce'});
  const spectator=await page('/?watch='+room.code);
  const route=room.game.routes.find(r=>r.tunnel&&r.color==='gray'&&r.n===2);
  // Open the same build dialog used by a route click; submit via its real control.
  await actor.evaluate(routeId=>{uiDialog='build';buildTarget={routeId};showBuildDialog();},route.id);
  assert.doesNotMatch(await actor.locator('#dialog').innerText(),/Revelaremos hasta/);
  if(kind==='zero')await actor.screenshot({path:path.join(out,'build-dialog.png')});
  await actor.locator('#confirmBuild').click();
  await Promise.all([actor,rival,spectator].map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='reveal')));
  assert.equal(room.game.current,0);assert.equal(room.game.routes[route.id].owner,null);
  for(const p of [actor,rival,spectator]) {
   assert.equal(await p.locator('#tunnelSequence').count(),p===actor?1:0);
   assert.equal(await p.locator('#overlay').isVisible(),p===actor);
   assert.equal(await p.locator('#dismissTunnel, #viewTunnel').count(),0);
   if(p!==actor)assert.equal(await p.locator('#tunnelBoardNotice').isVisible(),true);
  }
  // A direct command cannot bypass the modal or consume the following turn.
  await rival.evaluate(()=>send({type:'action',action:{type:'draw_train',index:-1}}));
  await rival.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('termine el túnel'));
  assert.equal(room.game.current,0);
  if(kind!=='zero') {
   await Promise.all([actor,rival,spectator].map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='decision')));
   assert.equal(await rival.locator('#acceptTunnel').count(),0);assert.equal(await spectator.locator('#acceptTunnel').count(),0);
   assert.match(await rival.locator('#tunnelBoardStatus').innerText(),/Probador · 3 de 3 cartas · Suplemento: 2/);
   await rival.reload();await rival.waitForFunction(()=>game?.sharedTunnel?.stage==='decision'&&board3D?.stats().tunnelCards.visible);
   assert.equal(await rival.locator('#overlay').isVisible(),false);
   assert.equal(await rival.evaluate(()=>board3D.stats().tunnelCards.cards.length),3);
   if(kind==='color') {await rival.screenshot({path:path.join(out,'tunnel-observer.png')});await actor.locator('#acceptTunnel').click();}
   else {assert.equal(await actor.locator('#acceptTunnel').isDisabled(),true);assert.match(await actor.locator('.tunnel-insufficient').innerText(),/Te faltan 2 cartas/);assert.doesNotMatch(await actor.locator('#dialog').innerText(),/Aún no se ha gastado|Al desistir conservas/);await actor.screenshot({path:path.join(out,'tunnel-shortfall.png')});await actor.locator('#declineTunnel').click();}
  }
  await Promise.all([actor,rival,spectator].map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='result')));
  assert.equal(room.game.current,0);
  assert.equal(await actor.locator('#dialogTitle').innerText(),kind==='decline'?'Túnel no construido':'Túnel construido');
  for(const p of [rival,spectator]) {
   assert.equal(await p.locator('#overlay').isVisible(),false);
   assert.equal(await p.locator('#tunnelBoardStatus').innerText(),kind==='decline'?'Túnel no construido':'Túnel construido');
  }
  await Promise.all([actor,rival,spectator].map(p=>p.waitForFunction(()=>!game.sharedTunnel&&game.current===1)));
  assert.ok(room.game.turnDeadline-Date.now()>59000);
  assert.equal(room.game.routes[route.id].owner,kind==='decline'?null:0);
  if(kind==='zero') {
   // Destination offers use the same presentation with a separate private clock.
   await rival.locator('#drawtickets').click(); await rival.locator('#confirmDestinationDraw').click();await rival.waitForSelector('#ticketMap');
   assert.equal(await rival.locator('.ticket-intro,#ticketMapCaption').count(),0);
   assert.doesNotMatch(await rival.locator('#dialog').innerText(),/Primero elige|Tus destinos permanecerán|La partida continúa/);
   await rival.screenshot({path:path.join(out,'new-tickets.png')});
   await rival.locator('.keep').first().check();
   assert.equal(await rival.locator('#minimizeTickets').innerText(),'Ver mapa');
   const deadline=await rival.evaluate(()=>game.ticketOffer.deadline);
   await rival.locator('#minimizeTickets').click();await rival.locator('#pendingTickets').click();
   assert.equal(await rival.locator('.keep').first().isChecked(),true);
   assert.equal(await rival.evaluate(()=>game.ticketOffer.deadline),deadline);
  }
  report.checks.push('Tunnel '+kind+': builder-only modal, rival/spectator on board, reconnect, authority, clocks, automatic close');
  await Promise.all([actor,rival,spectator].map(p=>p.close()));
 }
 const bot=tunnelRoom('QABOT0','zero',true);bot.practice=false;bot.visibility='public';bot.members[0].bot=true;
 const botRoute=bot.game.routes.find(r=>r.tunnel&&r.color==='gray'&&r.n===2);
 E.action(bot.game,0,{type:'claim',routeId:botRoute.id,color:'white'});app.rooms.set(bot.code,bot);
 const botView=await page('/?room=QABOT0#recover=preview-1'),botSpectator=await page('/?watch=QABOT0');
 for(const p of [botView,botSpectator]) {
  await p.waitForFunction(()=>game.sharedTunnel?.stage==='reveal');
  assert.equal(await p.locator('#overlay').isVisible(),false);
  assert.equal(await p.locator('#viewTunnel').count(),0);
 }
 await Promise.all([botView,botSpectator].map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='result')));
 for(const p of [botView,botSpectator]) {
  assert.equal(await p.locator('#overlay').isVisible(),false);
  assert.equal(await p.locator('#tunnelBoardStatus').innerText(),'Túnel construido');
 }
 await Promise.all([botView,botSpectator].map(p=>p.close()));
 report.checks.push('Bot tunnel stays on the board for both players and spectators');
 const result=resultsRoom();app.rooms.set(result.code,result);
 const rp=await page('/?room='+result.code+'#recover='+result.members[0].token);
 await rp.waitForSelector('.results-table');
 assert.equal(await rp.locator('.result-rules').count(),0);
 assert.equal(await rp.locator('.results-table tbody').count(),4);
 assert.equal(await rp.locator('.result-detail:visible').count(),0);
 await rp.screenshot({path:path.join(out,'results-table.png')});
 for(const category of ['routes','destinations','stations','express']) {
  await rp.locator(`[data-score-seat="0"] [data-score-category="${category}"]`).click();
  assert.equal(await rp.locator('.result-detail:visible').count(),1);
  assert.equal(await rp.locator('#scoreMap').count(),1);
  assert.equal(await rp.locator(`[data-score-seat="0"] [data-score-category="${category}"]`).getAttribute('aria-pressed'),'true');
 }
 await rp.locator('[data-score-seat="1"] [data-score-category="routes"]').click();
 assert.equal(await rp.locator('#score-detail-0').isVisible(),false);
 await rp.screenshot({path:path.join(out,'results-detail.png')});
 await rp.locator('[data-score-seat="1"] .result-heading').click();assert.equal(await rp.locator('.result-detail:visible').count(),0);
 await rp.locator('[data-score-seat="0"] [data-score-category="destinations"]').focus();await rp.keyboard.press('ArrowRight');
 assert.equal(await rp.locator('[data-score-seat="0"] [data-score-category="stations"]').getAttribute('aria-pressed'),'true');
 await rp.setViewportSize({width:390,height:844});
 await rp.locator('[data-score-seat="0"] [data-score-category="routes"]').click();await rp.waitForTimeout(150);
 const map=await rp.locator('.score-map-stage').boundingBox();assert.ok(map.width<390);assert.ok(map.x>=0&&map.x+map.width<=390);
 assert.equal(await rp.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await rp.screenshot({path:path.join(out,'results-mobile.png')});
 await rp.evaluate(()=>{I18n.select('en');location.reload();});await rp.waitForSelector('.results-table');
 assert.match(await rp.locator('.results-table thead').innerText(),/Routes/);
 report.checks.push('Results: summary, every category, one expanded row, keyboard, maps, mobile width, English');
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(error=>{report.failure=error.stack;process.exitCode=1;console.error(error);}).finally(async()=>{
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));if(browser)await browser.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
