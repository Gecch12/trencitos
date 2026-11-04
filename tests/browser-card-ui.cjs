// Isolated HTTP/WebSocket + Chrome regression for visual card interactions.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine'),{resultsRoom}=require('./helpers/results-preview');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-card-ui-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),out=path.resolve(process.env.QA_OUT||'.qa/card-ui');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],date:new Date().toISOString()};let browser;
function room(code,refresh) {
 const game=E.newGame(['Angel','Rival']);
 const deck=[...game.deck,...game.face,...game.players.flatMap(p=>p.hand)];
 game.players.forEach(p=>{p.pending=[];p.hand=[];p.tickets=[];});game.deck=deck;game.face=[];game.phase='play';
 const take=c=>{const i=deck.indexOf(c);assert.ok(i>=0);return deck.splice(i,1)[0];};
 game.players[0].hand=['red','red','red','blue','blue','green','green','yellow','white','purple','orange','wild','wild'].map(take);
 game.face=(refresh?['wild','wild','red','blue','green']:['red','blue','green','yellow','black']).map(take);
 deck.push(take(refresh?'wild':'orange'));E.ensureTiming(game);
 return {code,game,updated:Date.now(),visibility:'public',maxPlayers:2,members:game.players.map((p,i)=>({name:p.name,color:p.color,token:'qa-'+i}))};
}
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 async function page(room,seat,options={}) {
  const context=await browser.newContext({viewport:{width:1440,height:900},...options});const p=await context.newPage();p.setDefaultTimeout(10000);
  if(seat>=0)await p.addInitScript(({code,token})=>localStorage.setItem('rr-room-'+code,token),{code:room.code,token:room.members[seat].token});
  p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push({message:e.text().slice(0,240),location:e.location()});});
  await p.goto(base+'/?'+(seat<0?'watch=':'room=')+room.code);await p.waitForFunction(()=>!!game);
  if(room.game.phase!=='finished')await p.locator('[data-panel="history"]').click();
  return p;
 }
 const normal=room('QACARD',false);app.rooms.set(normal.code,normal);
 const actor=await page(normal,0),rival=await page(normal,1),spectator=await page(normal,-1);
 for(const p of [rival,spectator])await p.evaluate(()=>{
  window.observedDrawFlights=[];
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)
   if(node.classList?.contains('draw-flight'))observedDrawFlights.push({color:node.querySelector('img').dataset.cardColor,
    duration:node.getAnimations()[0].effect.getTiming().duration});
  }).observe(document.body,{childList:true});
 });
 await actor.locator('#drawblind').click();await actor.waitForFunction(()=>game.history.some(e=>e.draw));
 // Drawn cards are separate from initial hands, refills and market renewals.
 const drawnCards='.history-drawn-cards img';
 for(const p of [actor,rival,spectator])await p.waitForSelector(drawnCards);
 assert.match(await actor.locator(drawnCards).last().getAttribute('src'),/back.svg/);
 assert.equal(await actor.evaluate(()=>game.history.find(e=>e.draw).draw.color),'orange');
 for(const p of [rival,spectator])assert.match(await p.locator(drawnCards).last().getAttribute('src'),/back.svg/);
 for(const p of [rival,spectator]){
  await p.waitForFunction(()=>observedDrawFlights.length);
  assert.deepEqual(await p.evaluate(()=>observedDrawFlights[0]),{color:'back',duration:680});
 }
 assert.equal(await actor.locator('.market-refresh-layer').count(),0);
 await actor.locator('[data-market-index="0"]').click();
 await Promise.all([actor,rival,spectator].map(p=>p.waitForFunction(()=>game.history.filter(e=>e.draw).length===2)));
 for(const p of [actor,rival,spectator])assert.deepEqual(await p.locator(drawnCards).evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src'))),['/assets/cards/back.svg','/assets/cards/red.svg']);
 await rival.reload();await rival.waitForFunction(()=>!!game);await rival.locator('[data-panel="history"]').click();await rival.waitForSelector(drawnCards);
 assert.match(await rival.locator(drawnCards).first().getAttribute('src'),/back.svg/);
 await rival.locator('#history').screenshot({path:path.join(out,'history.png')});
 report.checks.push('Public/blind thumbnails for actor, rival and spectator; reload; ordinary draws stay immediate');
 await Promise.all([actor,rival,spectator].map(p=>p.close()));
 for(const variant of ['normal','resize','reduced','interrupt']) {
  const r=room({normal:'QAREF0',resize:'QAREF1',reduced:'QAREF2',interrupt:'QAREF3'}[variant],true);app.rooms.set(r.code,r);
  const a=await page(r,0,variant==='reduced'?{reducedMotion:'reduce'}:{}),b=await page(r,1);
  // Observe both clients at insertion, including the 120 ms crossfade. A
  // round trip to the rival can outlast the actor's animation on a busy runner.
  for(const client of [a,b])await client.evaluate(()=>{
   window.refreshSeen=[];
   new MutationObserver(()=>{
    const layer=document.querySelector('.market-refresh-layer');if(!layer||refreshSeen.length)return;
    const seen={cards:layer.children.length,disabled:[...document.querySelectorAll('#market button')].every(b=>b.disabled),durations:layer.getAnimations({subtree:true}).map(a=>a.effect.getTiming().duration)};
    const send=sock.send;let sent=0;
    sock.send=function(...args){sent++;return send.apply(this,args);};
    try{act('draw_train',{index:0});}finally{sock.send=send;}
    seen.blockedDrawSent=sent;refreshSeen.push(seen);
   }).observe(document.querySelector('#market'),{childList:true,subtree:true});
  });
  await a.locator('[data-market-index="2"]').click();await a.waitForFunction(()=>window.refreshSeen.length);
  const seen=await a.evaluate(()=>window.refreshSeen[0]);assert.equal(seen.cards,10);assert.equal(seen.disabled,true);assert.equal(seen.blockedDrawSent,0);assert.ok(seen.durations.every(d=>d===(variant==='reduced'?120:1200)));
  if(variant==='normal') {
   assert.equal(await a.locator('[data-history-id^="turn:"] .history-market-refresh img').count(),5);
   await b.waitForFunction(()=>refreshSeen.length);
   await a.waitForTimeout(250);await a.locator('#market').screenshot({path:path.join(out,'market-renewal.png'),animations:'allow'});
  } else if(variant==='resize') await a.setViewportSize({width:1000,height:800});
  else if(variant==='interrupt') {
   // An authoritative newer action arriving during a rival's animation must win.
   await a.evaluate(()=>cancelMarketRefresh());
   const index=r.game.face.findIndex(c=>c!=='wild');await a.locator(`[data-market-index="${index}"]`).click();
   await b.waitForFunction(()=>game.current===1);
   assert.equal(await b.evaluate(()=>!!marketRefresh),true,'a newer state must not cut the observed renewal short');
  }
  await a.waitForFunction(()=>!marketRefresh);await b.waitForFunction(()=>!marketRefresh);
  assert.equal(await a.locator('.market-refresh-layer').count(),0);
  assert.equal(await a.locator('[data-market-index]').count(),5);
  assert.deepEqual(await a.locator('[data-market-index] img').evaluateAll(imgs=>imgs.map(i=>i.dataset.cardColor)),r.game.face);
  await a.reload();await a.waitForFunction(()=>!!game);assert.equal(await a.locator('.market-refresh-layer').count(),0);
  await Promise.all([a,b].map(p=>p.close()));
 }
 report.checks.push('Renewal: actual third wildcard, shared animation, input lock, reduced motion, resize, newer state and reconnect');
 const build=room('QABULD',false);app.rooms.set(build.code,build);const p=await page(build,0);
 const route=build.game.routes.find(r=>r.color==='gray'&&r.n===2&&!r.ferry);
 await p.evaluate(routeId=>{buildTarget={routeId};uiDialog='build';showBuildDialog();},route.id);
 await p.locator('.change-payment summary').click();
 assert.equal(await p.locator('.change-payment summary').innerText(),'Cambiar cartas');
 assert.doesNotMatch(await p.locator('.payment-color-grid').innerText(),/Rojo|Azul|disponible/);
 await p.locator('[name="buildColor"][value="red"]').check();await p.locator('#wildMore').click();
 assert.equal(await p.locator('#paymentPreview .traincard').count(),2);
 assert.equal(await p.locator('#paymentPreview .payment-symbol').allTextContents().then(a=>a.join('')),'+=');
 assert.match(await p.locator('.payment-sum').innerText(),/^2/);
 await p.screenshot({path:path.join(out,'payment-desktop.png')});
 await p.locator('#wildMore').click();assert.equal(await p.locator('#paymentPreview .traincard').count(),1);
 assert.equal(await p.locator('#paymentPreview img').getAttribute('data-card-color'),'wild');
 await p.locator('#wildLess').click();
 for(const [w,h]of [[390,844],[844,390]]) {
  await p.setViewportSize({width:w,height:h});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const eq=await p.locator('#paymentPreview').boundingBox();assert.ok(eq.x>=0&&eq.x+eq.width<=w);
  await p.screenshot({path:path.join(out,`payment-${w}.png`)});
 }
 await p.evaluate(()=>{I18n.select('en');location.reload();});await p.waitForFunction(()=>!!game);
 await p.evaluate(routeId=>{buildTarget={routeId};uiDialog='build';showBuildDialog();},route.id);
 assert.match(await p.locator('.payment-sum').innerText(),/cards/);await p.close();
 report.checks.push('Visual equation, live stepper/all-wild, compact stock, mobile/landscape, English');
 const results=resultsRoom('QABOTS');results.members[1].bot=true;app.rooms.set(results.code,results);
 const result=await page(results,0);await result.waitForSelector('.results-table');
 assert.equal(await result.locator('.result-rules').count(),0);
 assert.equal(await result.locator('.result-heading .is-bot rect').evaluate(n=>getComputedStyle(n).fill),'rgb(255, 249, 233)');
 assert.equal(await result.locator('.result-heading .is-bot svg').evaluate(n=>getComputedStyle(n).stroke),'rgb(33, 65, 78)');
 await result.screenshot({path:path.join(out,'results-bot.png')});
 report.checks.push('Bot avatar white fill/dark outline and final table without tie explanation');
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 if(browser)await browser.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
