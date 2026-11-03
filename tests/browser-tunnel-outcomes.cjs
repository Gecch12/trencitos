// Full tunnel story over HTTP/WebSockets, with a separate server and temporary data.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine'),{tunnelRoom}=require('./helpers/tunnel-preview');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-tunnel-outcomes-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),out=path.resolve('.qa/tunnel-outcomes');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[]};let browser;
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const clients=await Promise.all([{}, {reducedMotion:'reduce'}, {}].map(async options=>{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},...options});const page=await ctx.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});return page;
 }));
 const [actor,rival,spectator]=clients;
 for(const [index,kind] of ['zero','mixed','wild','decline','insufficient','timeout'].entries()) {
  const room=tunnelRoom('QATOU'+index,kind==='insufficient'?'decline':kind==='wild'?'wild':kind==='zero'?'zero':'color',true);
  room.practice=false;room.visibility='public';room.maxPlayers=4;app.rooms.set(room.code,room);
  const route=room.game.routes.find(r=>r.tunnel&&r.color==='gray'&&r.n===2),original=[...room.game.players[0].hand];
  await Promise.all(clients.map(async(p,i)=>{
   await p.addInitScript(({code,token})=>{localStorage.setItem('rr-room-'+code,token);localStorage.setItem('rr-language','es');},{code:room.code,token:i===0?'preview-human':'preview-1'});
   await p.goto(base+(i===2?'/?watch=':'/?room=')+room.code);await p.waitForFunction(()=>!!game);
  }));
  await actor.evaluate(id=>{uiDialog='build';buildTarget={routeId:id};showBuildDialog();},route.id);
  assert.match(await actor.locator('.payment-heading').innerText(),/Cartas que reservas/);
  if(kind==='mixed'||kind==='wild') {
   await actor.locator('.change-payment summary').click();
   await actor.locator('#wildMore').click();
  }
  await actor.locator('#confirmBuild').click();
  await Promise.all(clients.map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='reveal')));
  if(kind==='timeout')room.game.pending.turnRemaining=900;
  const reserved={...room.game.pending.base};
  for(const p of clients) {
   assert.deepEqual(await p.evaluate(()=>game.sharedTunnel.base),reserved);
   assert.equal(await p.locator('[data-tunnel-payment="base"] .payment-chip').count(),reserved.regular&&reserved.wild?2:1);
  }
  if(kind!=='zero') {
   await Promise.all(clients.map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='decision')));
   assert.equal(await rival.locator('input[name="tunnelPayment"]').count(),0);
   assert.equal(await spectator.evaluate(()=>game.sharedTunnel.extra),undefined);
   if(kind==='mixed') {
    await actor.locator('input[name="tunnelPayment"][value="1"]').check();
    assert.equal(await actor.locator('[data-tunnel-payment="total"] .payment-icons').getAttribute('aria-label'),'2 de color blanco + 2 locomotoras');
    await actor.screenshot({path:path.join(out,'decision-desktop.png')});
    for(const [width,height] of [[390,844],[844,390]]) {
     await actor.setViewportSize({width,height});
     const sizes=await actor.locator('#dialog').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(sizes.scroll<=sizes.client+1);
     await actor.locator('#acceptTunnel').scrollIntoViewIfNeeded();await actor.screenshot({path:path.join(out,`decision-${width}.png`)});
    }
    await actor.setViewportSize({width:1440,height:900});await actor.locator('#dialog').evaluate(el=>el.scrollTop=0);
   }
   if(kind==='insufficient')assert.equal(await actor.locator('#acceptTunnel').isDisabled(),true);
   if(kind==='decline')assert.equal(await actor.locator('#acceptTunnel').isEnabled(),true);
   if(kind==='decline'||kind==='insufficient')await actor.locator('#declineTunnel').click();
   else if(kind!=='timeout')await actor.locator('#acceptTunnel').click();
  }
  await Promise.all(clients.map(p=>p.waitForFunction(()=>game.sharedTunnel?.stage==='result')));
  const built=['zero','mixed','wild'].includes(kind),until=room.game.pending.until,receipt={...room.game.pending};
  assert.equal(until-receipt.resultStartedAt,3000);assert.equal(room.game.current,0);
  for(const p of clients) {
   assert.equal(await p.locator('#dialogTitle').innerText(),built?'Túnel construido':'Túnel no construido');
   assert.deepEqual(await p.evaluate(()=>game.sharedTunnel.base),reserved);
   if(built)assert.deepEqual(await p.evaluate(()=>game.sharedTunnel.extra),receipt.extra);
   else {
    assert.equal(await p.locator('[data-tunnel-payment="total"] .payment-icons').getAttribute('aria-label'),'0 cartas');
    assert.equal(await p.locator('.tunnel-return-target').count(),1);
   }
  }
  assert.equal(await rival.evaluate(()=>document.querySelector('#dialog').getAnimations({subtree:true}).length),0);
  if(kind==='timeout')assert.match(await actor.locator('.tunnel-outcome').innerText(),/Tiempo agotado/);
  if(kind==='mixed'||kind==='decline') {
   assert.ok(await actor.evaluate(()=>tunnelReveal.animations.length)>0);
   await actor.waitForFunction(()=>[...document.querySelectorAll('.tunnel-flight')].some(el=>Number(getComputedStyle(el).opacity)>.1));
   await Promise.all([actor.screenshot({path:path.join(out,`${kind}-result-motion.png`)}),rival.screenshot({path:path.join(out,`${kind}-result-reduced.png`)})]);
  }
  if(kind==='mixed') {
   await spectator.reload();await spectator.waitForFunction(()=>game?.sharedTunnel?.stage==='result');
   assert.equal(await spectator.evaluate(()=>game.sharedTunnel.until),until);
   const times=await spectator.evaluate(()=>tunnelReveal.animations.map(a=>a.currentTime));assert.ok(times.every(n=>n>300));
   await spectator.screenshot({path:path.join(out,'result-reconnect.png')});
  }
  if(kind==='insufficient') {
   await actor.setViewportSize({width:390,height:844});await actor.screenshot({path:path.join(out,'returned-mobile.png')});
   assert.equal(await actor.locator('.tunnel-flight').count(),0); // Resizing cancels in-flight copies.
   await actor.setViewportSize({width:1440,height:900});
  }
  await Promise.all(clients.map(p=>p.waitForFunction(()=>!game.sharedTunnel&&game.current===1)));
  assert.equal(await actor.locator('.tunnel-flight').count(),0);
  assert.ok(room.game.turnDeadline-Date.now()>59000);
  assert.equal(room.game.routes[route.id].owner,built?0:null);
  if(!built)assert.deepEqual(room.game.players[0].hand,original);
  else assert.equal(room.game.players[0].hand.length,original.length-reserved.regular-reserved.wild-receipt.extra.regular-receipt.extra.wild);
  report.checks.push(kind+': exact public receipt, private options, shared outcome, clock and card conservation');
 }
 // Exercise the real English render with an already-serialized outcome.
 const room=tunnelRoom('QATEN0','color',true);room.practice=false;room.visibility='public';app.rooms.set(room.code,room);
 const route=room.game.routes.find(r=>r.tunnel&&r.color==='gray'&&r.n===2);
 E.action(room.game,0,{type:'claim',routeId:route.id,color:'white'});E.expire(room.game,room.game.pending.until);
 E.action(room.game,0,{type:'decline_tunnel'},{now:Date.now()});
 await spectator.addInitScript(()=>localStorage.setItem('rr-language','en'));await spectator.goto(base+'/?watch=QATEN0');
 await spectator.waitForSelector('.tunnel-return-target');assert.match(await spectator.locator('#dialog').innerText(),/Base returned/);
 assert.match(await spectator.locator('#dialog').innerText(),/They keep their cards/);
 await spectator.screenshot({path:path.join(out,'returned-english.png')});
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(browser)await browser.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
