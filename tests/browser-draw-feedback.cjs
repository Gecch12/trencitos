// Real HTTP/WS + Chrome; the remote persistence adapter is a local controlled double.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine');
const {fakeSupabase}=require('./helpers/fake-supabase'),{connect}=require('./helpers/ws-client');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-draw-feedback-'));
const api=fakeSupabase({roomDelta:true}),originalFetch=global.fetch;
Object.assign(process.env,{STATE_BACKEND:'supabase',STATE_FILE:path.join(temp,'state.json'),
  SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test_only',AUTH_ENABLED:'false'});
global.fetch=(url,options)=>String(url).startsWith('https://fixture.supabase.co')?api.fetch(url,options):originalFetch(url,options);
const app=require('../backend/server'),out=path.resolve(process.env.QA_OUT||'.qa/draw-feedback');fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),checks:[],timings:[],errors:[]};let browser,active,release;
const peers=[];
function fixture(code,{refresh=false,depleted=false}={}){
 const game=E.newGame(['Actor','Rival'],0,Date.now(),{turnSeconds:90,initialSeconds:90,ticketExtraSeconds:30});
 const cards=[...game.deck,...game.face,...game.players.flatMap(p=>p.hand)];
 game.players.forEach(p=>{p.hand=[];p.pending=[];p.tickets=[];});
 const take=color=>{const i=cards.indexOf(color);assert.ok(i>=0);return cards.splice(i,1)[0];};
 game.face=(refresh?['wild','wild','red','blue','green']:['red','red','blue','green','yellow']).map(take);
 game.players[0].hand=['orange','blue','green','white'].map(take);
 if(depleted){game.players[1].hand=cards.splice(0);game.deck=[];}
 else {cards.push(take(refresh?'wild':'orange'));game.deck=cards;}
 game.discard=[];game.phase='play';E.ensureTiming(game);
 return {code,game,updated:Date.now(),visibility:'public',maxPlayers:2,revision:0,
  members:game.players.map((p,i)=>({name:p.name,color:p.color,token:`draw-fixture-${code}-${i}`}))};
}
async function open(code,options={}){
 const room=fixture(code,options);app.rooms.set(code,room);
 const rival=await connect(app.server.address().port);peers.push(rival);
 rival.send({type:'join',code,token:room.members[1].token});await rival.next('state');
 const context=await browser.newContext({viewport:options.mobile?{width:390,height:844}:{width:1440,height:900},
  reducedMotion:options.reduced?'reduce':'no-preference'}),page=await context.newPage();active=page;
 page.setDefaultTimeout(12000);
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.addInitScript(({code,token})=>localStorage.setItem('rr-room-'+code,token),{code,token:room.members[0].token});
 await page.goto(`http://127.0.0.1:${app.server.address().port}/rooms?room=${code}`);
 await page.waitForFunction(()=>game?.phase==='play'&&!!board3D);await page.evaluate(()=>document.fonts.ready);await app.drain();
 if(options.mobile)await page.locator('[data-panel="cards"]').click();
 await page.evaluate(()=>{
  window.drawAudit={sent:[],clicks:[],flights:[],sounds:[],acks:[]};
  sock.addEventListener('message',event=>{const value=JSON.parse(event.data);for(const m of value.type==='batch'?value.messages:[value])
    if(m.type==='ack')drawAudit.acks.push({id:m.id,at:performance.now()});});
  const send=sock.send.bind(sock);sock.send=data=>{const m=JSON.parse(data);if(m.type==='action')drawAudit.sent.push({...m,at:performance.now()});send(data);};
  const sound=playSound;playSound=kind=>{drawAudit.sounds.push(kind);sound(kind);};
  document.addEventListener('click',event=>{if(event.target.closest('#market button'))drawAudit.clicks.push(performance.now());},true);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){
   if(node.classList?.contains('draw-flight')){
    const sample={at:performance.now(),src:node.querySelector('img')?.getAttribute('src'),pending:node.classList.contains('draw-flight-pending')};
    drawAudit.flights.push(sample);requestAnimationFrame(()=>sample.frameAt=performance.now());
   }
  }}).observe(document.body,{childList:true});
 });
 return {page,context,room,rival,before:room.game.players[0].hand.length};
}
const button=index=>index<0?'#drawblind':`#market [data-market-index="${index}"]`;
async function clicks(f,first,second){
 release=api.hold();await f.page.locator(button(first)).click();
 if(second!==undefined)await f.page.locator(button(second)).click();
 await f.page.waitForTimeout(450);
 assert.equal(await f.page.evaluate(()=>game.hand.length),f.before,'unconfirmed hand is unchanged');
 assert.equal(api.state.rooms.find(r=>r.code===f.room.code).game.players[0].hand.length,f.before,'no premature durable change');
 assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),1,'only first command crosses the socket');
 assert.equal(await f.page.locator('.draw-flight-pending').count(),second===undefined?1:2);
 const audit=await f.page.evaluate(()=>drawAudit);
 for(let i=0;i<audit.clicks.length;i++){
  const timing={case:f.room.code,click:i,feedbackMs:audit.flights[i].at-audit.clicks[i],frameMs:audit.flights[i].frameAt-audit.clicks[i]};
  report.timings.push(timing);assert.ok(timing.feedbackMs<50,JSON.stringify(timing));
 }
}
async function done(f,count){
 release();release=null;
 await f.page.waitForFunction(n=>!pendingAction&&!queuedDraw&&game.hand.length===n,f.before+count);
 await f.page.waitForFunction(()=>cardFlights.size===0);await app.drain();
 assert.equal(f.room.game.players[0].hand.length,f.before+count);
 assert.equal(api.state.rooms.find(r=>r.code===f.room.code).game.players[0].hand.length,f.before+count);
 const audit=await f.page.evaluate(()=>drawAudit);
 for(let i=0;i<audit.sent.length;i++){
  const ack=audit.acks.find(a=>a.id===audit.sent[i].id),timing=report.timings.find(t=>t.case===f.room.code&&t.click===i);
  if(ack&&timing)timing.confirmationMs=ack.at-audit.clicks[i];
 }
}
async function close(f){await f.context.close();f.rival.close();await app.drain();}
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 {
  const f=await open('QADR01');await clicks(f,-1,-1);
  assert.ok((await f.page.locator('.draw-flight img').evaluateAll(images=>images.map(i=>i.src))).every(src=>src.endsWith('/back.svg')));
  await f.page.evaluate(()=>act('draw_train',{index:-1}));
  assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),1);
  await f.page.screenshot({path:path.join(out,'pending-desktop.png'),animations:'allow'});
  await done(f,2);
  const audit=await f.page.evaluate(()=>drawAudit);assert.equal(audit.sent.length,2);assert.equal(audit.flights.length,2);
  assert.equal(audit.sounds.filter(s=>s==='card').length,2);assert.notEqual(audit.sent[0].id,audit.sent[1].id);
  assert.equal(audit.sent[1].revision,audit.sent[0].revision+1);
  assert.equal(E.view(f.room.game,1).events.filter(e=>e.type==='draw'&&e.index<0).some(e=>'color'in e),false);
  report.checks.push('Blind double click: immediate backs, bounded queue, two durable draws, no duplicate flights/sounds or rival disclosure');await close(f);
 }
 {
  const f=await open('QADR02');await clicks(f,0,1);await done(f,2);
  assert.deepEqual(await f.page.evaluate(()=>drawAudit.sent.map(m=>m.action.index)),[0,1]);
  assert.equal(f.room.game.players[0].hand.slice(-2).join(','),'red,red');
  assert.equal(await f.page.evaluate(()=>drawAudit.flights.length),2);await close(f);
  report.checks.push('Two visible equal-color cards retain their distinct original slots');
 }
 {
  const f=await open('QADR03',{depleted:true});await clicks(f,0,1);await done(f,2);
  assert.deepEqual(await f.page.evaluate(()=>drawAudit.sent.map(m=>m.action.index)),[0,0]);await close(f);
  report.checks.push('Depleted deck rebases the queued card after the first slot is removed');
 }
 {
  const f=await open('QADR04',{refresh:true});await clicks(f,2,3);await done(f,1);
  assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),1);
  assert.match(await f.page.locator('#toast').innerText(),/Elige tu segunda carta/);
  await f.page.waitForFunction(()=>!marketRefresh);assert.equal(await f.page.locator('.draw-flight').count(),0);await close(f);
  report.checks.push('Three locomotives renew the market and cancel the old queued choice');
 }
 {
  const f=await open('QADR05');f.room.revision++;
  await clicks(f,-1,1);await done(f,0);
  assert.equal(await f.page.locator('#drawblind').isEnabled(),true);
  assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),1);await close(f);
  report.checks.push('Stale action rejects both provisional cards, restores controls and never executes the queued choice');
 }
 {
  const f=await open('QADR06');await clicks(f,-1,1);
  await f.page.evaluate(()=>sock.close());await f.page.waitForFunction(()=>sock.readyState===WebSocket.CLOSED);
  release();release=null;
  await f.page.waitForFunction(n=>sock.readyState===WebSocket.OPEN&&!pendingAction&&game.hand.length===n,f.before+1);
  await app.drain();assert.equal(f.room.game.players[0].hand.length,f.before+1);
  assert.equal(await f.page.evaluate(()=>queuedDraw),null);assert.equal(await f.page.locator('.draw-flight').count(),0);
  assert.equal(await f.page.evaluate(()=>drawAudit.flights.length),2);await close(f);
  report.checks.push('Disconnect after send: one persisted draw, same-ID retry, canceled queue and no replayed animation');
 }
 {
  const f=await open('QADR07',{mobile:true,reduced:true});await clicks(f,0,2);
  const bounds=await f.page.locator('.draw-flight').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  assert.ok(bounds.every(r=>r.x>=0&&r.y>=0&&r.right<=390&&r.bottom<=844),JSON.stringify(bounds));
  await f.page.screenshot({path:path.join(out,'pending-mobile-reduced.png'),animations:'allow'});
  await done(f,2);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await close(f);
  report.checks.push('390px mobile and reduced motion preserve pending/confirmed semantics without overflow');
 }
 {
  const f=await open('QADR08');await clicks(f,-1,1);
  await f.page.setViewportSize({width:1100,height:850});release();release=null;
  await f.page.waitForFunction(n=>!pendingAction&&game.hand.length===n,f.before+1);
  assert.equal(await f.page.evaluate(()=>queuedDraw),null);assert.equal(await f.page.locator('.draw-flight').count(),0);await close(f);
  report.checks.push('Resize cancels provisional geometry and unsent choice without replaying the confirmed flight');
 }
 {
  const f=await open('QADR10');await f.page.evaluate(()=>drawFeedbackSupported=false);
  release=api.hold();await f.page.locator('#drawblind').click();await f.page.waitForTimeout(100);
  assert.equal(await f.page.locator('.draw-flight').count(),0);
  assert.equal(await f.page.locator('#drawblind').isDisabled(),true);
  await done(f,1);const audit=await f.page.evaluate(()=>drawAudit);
  assert.equal(audit.flights.length,1);assert.equal(audit.sounds.filter(s=>s==='card').length,1);
  await close(f);report.checks.push('Server without feedback capability keeps the legacy single confirmed animation');
 }
 {
  const f=await open('QADR09');await clicks(f,-1,1);api.fail=true;release();release=null;
  await f.page.waitForFunction(()=>storagePaused&&!pendingAction);
  assert.equal(await f.page.evaluate(()=>game.hand.length),f.before);assert.equal(await f.page.locator('.draw-flight').count(),0);
  assert.equal(await f.page.evaluate(()=>queuedDraw),null);assert.equal(await f.page.locator('#drawblind').isDisabled(),true);
  api.fail=false;await close(f);report.checks.push('Failed remote commit removes previews, rolls back hand and keeps play paused');
 }
 const health=await originalFetch(`http://127.0.0.1:${app.server.address().port}/healthz?timings=1`);report.server=await health.json();
 assert.ok(report.server.timingsMs['draw.commit']?.count>0);assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;console.error(error);await active?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{
 release?.();api.fail=false;await browser?.close();for(const p of peers)p.close();await app.shutdown();
 global.fetch=originalFetch;fs.rmSync(temp,{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
