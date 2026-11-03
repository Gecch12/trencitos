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
 game.logs=[];game.history=[];game.events=[];game.eventSerial=0;
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
 page.on('console',event=>{if(event.type()==='error')report.errors.push({message:event.text().slice(0,240),location:event.location()});});
 await page.addInitScript(({code,token})=>localStorage.setItem('rr-room-'+code,token),{code,token:room.members[0].token});
 await page.goto(`http://127.0.0.1:${app.server.address().port}/rooms?room=${code}`);
 await page.waitForFunction(()=>game?.phase==='play'&&!!board3D);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>cardArtworkReady);await app.drain();
 if(options.mobile)await page.locator('[data-panel="cards"]').click();
 await page.evaluate(()=>{
  window.drawAudit={sent:[],clicks:[],flights:[],sounds:[],acks:[],handFrames:[],states:[],reveals:[],landings:[]};
  sock.addEventListener('message',event=>{const value=JSON.parse(event.data);for(const m of value.type==='batch'?value.messages:[value])
    if(m.type==='ack')drawAudit.acks.push({id:m.id,at:performance.now()});});
  const send=sock.send.bind(sock);sock.send=data=>{const m=JSON.parse(data);if(m.type==='action')drawAudit.sent.push({...m,at:performance.now()});send(data);};
  const sampleReveal=(node,sampledAt)=>{
   const color=node.dataset.revealedColor,front=node.querySelector('.draw-flight-front');
   if(color&&!drawAudit.reveals.some(r=>r.id===node.dataset.drawId)&&(!front||(front.complete&&front.naturalWidth>0&&new DOMMatrixReadOnly(getComputedStyle(node.querySelector('.draw-flight-face')).transform).m11<-.9)))
    drawAudit.reveals.push({id:node.dataset.drawId,at:performance.now(),color,sampledAt});
  };
  // A finished WAAPI promise can remove the node before this frame's rAF runs
  // on a busy software-rendered runner. Inspect the actual final transform and
  // decoded image before removal too; never infer a reveal from an ACK/landing.
  const finish=finishDrawPresentation;finishDrawPresentation=draw=>{
   if(draw.flight?.node.isConnected)sampleReveal(draw.flight.node,'before-landing');
   finish(draw);requestAnimationFrame(()=>drawAudit.landings.push({id:draw.id,at:performance.now(),color:draw.event?.color||draw.intent.color,imagesReady:[...document.querySelectorAll('#hand img')].every(i=>i.complete&&i.naturalWidth>0)}));
  };
  const sampleReveals=()=>{for(const node of document.querySelectorAll('.draw-flight-pending'))sampleReveal(node,'frame');
   requestAnimationFrame(sampleReveals);};requestAnimationFrame(sampleReveals);
  const sound=playSound;playSound=kind=>{drawAudit.sounds.push(kind);sound(kind);};
  document.addEventListener('click',event=>{if(event.target.closest('#market button')){
   const index=drawAudit.clicks.push(performance.now())-1;
   requestAnimationFrame(()=>drawAudit.handFrames.push({index,at:performance.now(),
    count:Number(document.getElementById('handCount').textContent.match(/\d+/)[0]),
    groups:[...document.querySelectorAll('#hand .traincard')].map(card=>({color:card.className.match(/suit-(\w+)/)[1],count:Number(card.querySelector('.cardcount').textContent.replace(/\D/g,''))}))}));
  }},true);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){
   if(node.classList?.contains('draw-flight')){
    const sample={at:performance.now(),color:node.querySelector('img')?.dataset.cardColor,pending:node.classList.contains('draw-flight-pending')};
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
 const choices=[first,...(second===undefined?[]:[second])];
 const pipeline=await f.page.evaluate(()=>drawPipelineSupported);
 assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),pipeline?choices.length:1,'second intent crosses the socket before first persistence/ACK');
 assert.equal(await f.page.locator('#hand .suit-back').count(),0,'unknown cards never occupy the hand');
 const audit=await f.page.evaluate(()=>drawAudit);
 for(let i=0;i<audit.clicks.length;i++){
  const frame=audit.handFrames.find(frame=>frame.index===i);
  const timing={case:f.room.code,click:i,feedbackMs:audit.flights[i].at-audit.clicks[i],frameMs:audit.flights[i].frameAt-audit.clicks[i]};
  report.timings.push(timing);assert.ok(timing.feedbackMs<100&&timing.frameMs<150,JSON.stringify(timing));
  assert.ok(frame.groups.every(g=>g.color!=='back'),'first frame contains no anonymous hand group');
 }
 if(choices.every(i=>i<0)) {
  assert.equal(await f.page.locator('#handCount').innerText(),`${f.before} cartas`);
  assert.equal(await f.page.locator('.draw-flight-pending').count(),choices.length,'blind pickups remain outside the hand until their actual colors arrive');
  await f.page.evaluate(()=>{
   const source=document.querySelector('#drawblind').getBoundingClientRect(),card=document.querySelector('.draw-flight-pending').getBoundingClientRect();
   drawAudit.approached=Math.abs(card.x-source.x)>80||Math.abs(card.y-source.y)>80;
  });
 }

}
async function done(f,count){
 release();release=null;
 await f.page.waitForFunction(n=>!pendingAction&&!queuedDraw&&game.hand.length===n,f.before+count);
 await f.page.waitForFunction(()=>cardFlights.size===0);await f.page.evaluate(()=>new Promise(requestAnimationFrame));await app.drain();
 assert.equal(f.room.game.players[0].hand.length,f.before+count);
 assert.equal(api.state.rooms.find(r=>r.code===f.room.code).game.players[0].hand.length,f.before+count);
 assert.equal(await f.page.locator('#handCount').innerText(),`${f.before+count} cartas`);
 assert.equal(await f.page.locator('#hand .is-pending').count(),0);
 assert.equal(await f.page.locator('#hand .suit-back').count(),0);
 await recordTimings(f);
}
async function recordTimings(f){
 const audit=await f.page.evaluate(()=>drawAudit);
 for(let i=0;i<audit.sent.length;i++){
  const ack=audit.acks.find(a=>a.id===audit.sent[i].id);
  let timing=report.timings.find(t=>t.case===f.room.code&&t.click===i);
  if(!timing&&audit.clicks[i]!==undefined){timing={case:f.room.code,click:i};report.timings.push(timing);}
  if(ack&&timing)timing.confirmationMs=ack.at-audit.clicks[i];
  const reveal=audit.reveals.find(r=>r.id===audit.sent[i].id),landing=audit.landings.find(r=>r.id===audit.sent[i].id);
  if(timing&&reveal)timing.colorRecognizableMs=reveal.at-audit.clicks[i];
  if(timing&&landing){timing.handArrivalMs=landing.at-audit.clicks[i];assert.equal(landing.imagesReady,true);}

 }
}
async function close(f){await f.context.close();f.rival.close();await app.drain();}
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 {
  const f=await open('QADR01');await clicks(f,-1,-1);
  assert.ok((await f.page.evaluate(()=>drawAudit.flights)).every(f=>f.color==='back'));
  await f.page.evaluate(()=>act('draw_train',{index:-1}));
  assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),2);
  await f.page.screenshot({path:path.join(out,'pending-desktop.png'),animations:'allow'});
  await done(f,2);
  const audit=await f.page.evaluate(()=>drawAudit);assert.equal(audit.sent.length,2);assert.equal(audit.flights.length,2);
  assert.equal(audit.sounds.filter(s=>s==='card').length,2);assert.notEqual(audit.sent[0].id,audit.sent[1].id);
  assert.equal(audit.sent[1].revision,audit.sent[0].revision);assert.equal(audit.sent[1].after,audit.sent[0].id);
  assert.equal(E.view(f.room.game,1).events.filter(e=>e.type==='draw'&&e.index<0).some(e=>'color'in e),false);
  for (const timing of report.timings.filter(t=>t.case===f.room.code)) {
   assert.ok(timing.colorRecognizableMs>0&&timing.colorRecognizableMs<=timing.handArrivalMs,JSON.stringify(timing));
  }
  const routeProgress = await f.page.evaluate(()=>drawAudit.approached);
  assert.equal(routeProgress,true,'blind cards visibly travel before receiving their color');
  report.checks.push('Blind double click: immediate pickups, immediate dependent send, two durable draws, no duplicate flights/sounds or rival disclosure');await close(f);
 }
 {
  const f=await open('QADR02');await clicks(f,0,1);
  await f.page.screenshot({path:path.join(out,'pending-visible-desktop.png'),animations:'allow'});
  await done(f,2);
  assert.deepEqual(await f.page.evaluate(()=>drawAudit.sent.map(m=>m.action.index)),[0,1]);
  assert.equal(f.room.game.players[0].hand.slice(-2).join(','),'red,red');
  assert.equal(await f.page.evaluate(()=>drawAudit.flights.length),2);await close(f);
  report.checks.push('Two visible equal-color cards retain their distinct original slots');
 }
 {
  const f=await open('QADR03',{depleted:true});await clicks(f,0,1);await done(f,2);
  assert.deepEqual(await f.page.evaluate(()=>drawAudit.sent.map(m=>m.action.index)),[0,1]);await close(f);
  report.checks.push('Depleted deck rebases the queued card after the first slot is removed');
 }
 {
  const f=await open('QADR04',{refresh:true});await clicks(f,2);
  assert.equal(await f.page.locator(button(3)).isDisabled(),true);
  await f.page.evaluate(()=>act('draw_train',{index:3}));
  assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),1);
  await done(f,1);
  assert.equal(await f.page.locator('[data-history-id^="turn:"] .history-market-refresh img').count(),5);
  await f.page.waitForFunction(()=>!marketRefresh);assert.equal(await f.page.locator('.draw-flight').count(),0);await close(f);
  report.checks.push('Two visible wildcards block a premature second choice; third wildcard renews the market and records public history');
 }
 {
  const f=await open('QADR05');f.room.revision++;
  await clicks(f,-1,1);await done(f,0);
  assert.equal(await f.page.locator('#drawblind').isEnabled(),true);
  assert.equal(await f.page.evaluate(()=>drawAudit.sent.length),2);await close(f);
  report.checks.push('Stale action rejects both provisional cards, restores controls and never executes the queued choice');
 }
 {
  const f=await open('QADR06');await clicks(f,-1,1);
  await f.page.evaluate(()=>sock.close());await f.page.waitForFunction(()=>sock.readyState===WebSocket.CLOSED);
  assert.equal(await f.page.locator('#handCount').innerText(),`${f.before} cartas`);
  release();release=null;
  await f.page.waitForFunction(n=>sock.readyState===WebSocket.OPEN&&!pendingAction&&game.hand.length===n,f.before+2);
  await app.drain();assert.equal(f.room.game.players[0].hand.length,f.before+2);
  assert.equal(await f.page.evaluate(()=>queuedDraw),null);assert.equal(await f.page.locator('.draw-flight').count(),0);
  assert.equal(await f.page.evaluate(()=>drawAudit.flights.length),2);await close(f);
  report.checks.push('Disconnect after send: two persisted draws, ordered same-ID retry and no replayed animation');
 }
 {
  const f=await open('QADR07',{mobile:true,reduced:true});await clicks(f,0,2);
  const bounds=await f.page.locator('#hand .traincard').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  assert.ok(bounds.every(r=>r.x>=0&&r.y>=0&&r.right<=390&&r.bottom<=844),JSON.stringify(bounds));
  await f.page.screenshot({path:path.join(out,'pending-mobile-reduced.png'),animations:'allow'});
  await done(f,2);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await close(f);
  report.checks.push('390px mobile and reduced motion preserve pending/confirmed semantics without overflow');
 }
 {
  const f=await open('QADR11');
  await f.page.evaluate(()=>{
   const receive=sock.onmessage;
   sock.onmessage=event=>{
    const value=JSON.parse(event.data),messages=value.type==='batch'?value.messages:[value];
    for(const message of messages){
     const single={data:JSON.stringify(message)};
     if(message.type==='ack')setTimeout(()=>receive(single),180);
     else {receive(single);if(message.type==='state')drawAudit.states.push({hand:game.hand.length,count:document.getElementById('handCount').textContent});}
    }
   };
  });
  await clicks(f,0,1);await done(f,2);
  const states=await f.page.evaluate(()=>drawAudit.states);
  assert.ok(states.some(s=>s.hand===f.before+1));
  assert.ok(states.every(s=>Number(s.count.match(/\d+/)[0])<=f.before+2),'state before ACK never double counts a card');
  await close(f);report.checks.push('Delayed ACK keeps the same two-card hand through both authoritative states, without double counting');
 }
 {
  const f=await open('QADR12');
  await f.page.evaluate(()=>{
   const receive=sock.onmessage;let ack;
   window.releaseDrawAck=()=>receive({data:JSON.stringify(ack)});
   sock.onmessage=event=>{
    const value=JSON.parse(event.data);
    for(const m of value.type==='batch'?value.messages:[value]){
     if(m.type==='ack')ack=m;
     else receive({data:JSON.stringify(m)});
    }
   };
  });
  await f.page.locator('#drawblind').click();
  await f.page.waitForFunction(n=>pendingAction&&game.hand.length===n,f.before+1);
  assert.equal(await f.page.locator('#hand .suit-back').count(),0);
  await f.page.waitForFunction(()=>drawAudit.reveals.some(r=>r.color==='orange'));
  await f.page.waitForFunction(()=>cardFlights.size===0);
  assert.equal(await f.page.locator('#hand .suit-orange .cardcount').textContent(),'×2');
  await f.page.evaluate(()=>releaseDrawAck());
  await f.page.waitForFunction(()=>!pendingAction);
  await f.page.waitForFunction(()=>cardFlights.size===0);
  await f.page.evaluate(()=>new Promise(requestAnimationFrame));await recordTimings(f);
  assert.equal(await f.page.evaluate(()=>drawAudit.sounds.filter(s=>s==='card').length),1);
  await close(f);report.checks.push('Blind card flips to a decoded color, lands once, and does not wait for delayed ACK');
 }
 {
  const f=await open('QADR08');await clicks(f,-1,1);
  await f.page.setViewportSize({width:1100,height:850});
  await f.page.waitForFunction(()=>cardFlights.size===0);
  assert.equal(await f.page.locator('#handCount').innerText(),`${f.before} cartas`);
  release();release=null;
  await f.page.waitForFunction(n=>!pendingAction&&game.hand.length===n,f.before+2);
  assert.equal(await f.page.evaluate(()=>queuedDraw),null);assert.equal(await f.page.locator('.draw-flight').count(),0);await close(f);
  report.checks.push('Resize cancels geometry while retaining both already sent commands');
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
  const f=await open('QADR13');await clicks(f,-1,-1);
  await f.page.waitForFunction(()=>document.querySelectorAll('.draw-flight-waiting').length===2);
  assert.equal(await f.page.locator('#handCount').innerText(),`${f.before} cartas`);
  assert.equal(await f.page.locator('#hand .suit-back').count(),0);
  await f.page.screenshot({path:path.join(out,'slow-blind-desktop.png'),animations:'allow'});
  await done(f,2);await close(f);
  report.checks.push('Slow persistence holds both blind cards along their route outside the hand with a waiting label, then decoded colors land once');
 }
 {
  const f=await open('QADR14');await f.page.evaluate(()=>{
   drawPipelineSupported=false;
   const receive=sock.onmessage;sock.onmessage=event=>{
    const value=JSON.parse(event.data);
    for(const m of value.type==='batch'?value.messages:[value]){
     delete m.drawReceipts;receive({data:JSON.stringify(m)});
    }
   };
  });
  await clicks(f,-1,-1);await done(f,2);
  const audit=await f.page.evaluate(()=>drawAudit);
  assert.equal(audit.sent.length,2);assert.equal(audit.sent[1].after,undefined);
  assert.equal(audit.sent[1].revision,audit.sent[0].revision+1);
  assert.equal(audit.flights.length,2);assert.equal(audit.sounds.filter(s=>s==='card').length,2);
  await close(f);report.checks.push('Older feedback-only server retains sequential revision-based sends and two reconciled flights');
 }
 {
  const f=await open('QADR15');await f.page.evaluate(()=>{
   const receive=sock.onmessage,acks=[];
   window.releaseDrawAcks=()=>acks.forEach(m=>receive({data:JSON.stringify(m)}));
   sock.onmessage=event=>{
    const value=JSON.parse(event.data);
    for(const m of value.type==='batch'?value.messages:[value]){
     if(m.type==='ack')acks.push(m);else receive({data:JSON.stringify(m)});
    }
   };
  });
  await clicks(f,-1,-1);release();release=null;
  await f.page.waitForFunction(n=>inflightDraws.size===2&&game.hand.length===n&&cardFlights.size===0,f.before+2);
  await f.page.evaluate(()=>new Promise(requestAnimationFrame));
  const audit=await f.page.evaluate(()=>drawAudit);
  for(const command of audit.sent){
   const receipt=f.room.members[0].actionReceipts.find(r=>r.id===command.id);
   const event=f.room.game.events.find(e=>e.id===receipt.drawEventId);
   assert.equal(audit.reveals.find(r=>r.id===command.id)?.color,event.color);
   assert.equal(audit.landings.find(r=>r.id===command.id)?.color,event.color);
  }
  assert.equal(await f.page.locator('#handCount').innerText(),`${f.before+2} cartas`);
  await f.page.evaluate(()=>releaseDrawAcks());await f.page.waitForFunction(()=>!pendingAction);
  assert.equal(await f.page.evaluate(()=>drawAudit.flights.length),2);await recordTimings(f);
  await close(f);report.checks.push('Two blind states before either ACK correlate exact colors to both clicks without double counts or repeated effects');
 }
 {
  const f=await open('QADR16');
  await f.page.evaluate(()=>{
   window.handBefore=new Map([...document.querySelectorAll('#hand .traincard')].map(card=>[card.querySelector('img').dataset.cardColor,card]));
   window.handShiftSeen=false;
   const sample=()=>{if([...handBefore.values()].some(card=>card.getAnimations().some(animation=>animation.playState==='running')))handShiftSeen=true;
    if(!handShiftSeen)requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  await f.page.locator(button(0)).click();
  await f.page.waitForFunction(()=>!pendingAction&&cardFlights.size===0);
  assert.equal(await f.page.evaluate(()=>[...handBefore].every(([color,node])=>node===document.querySelector('#hand .suit-'+color))),true);
  assert.equal(await f.page.evaluate(()=>handShiftSeen),true);
  assert.equal(await f.page.locator('#hand .suit-red .cardcount').textContent(),'×1');
  await f.page.locator('#hand').screenshot({path:path.join(out,'new-suit-hand.png')});
  report.checks.push('A new suit reserves its landing slot; existing hand groups keep identity and move smoothly');await close(f);
 }
 {
  const f=await open('QADR09');await clicks(f,-1,1);api.fail=true;release();release=null;
  await f.page.waitForFunction(()=>storagePaused&&!pendingAction);
  assert.equal(await f.page.evaluate(()=>game.hand.length),f.before);assert.equal(await f.page.locator('.draw-flight').count(),0);
  assert.equal(await f.page.locator('#handCount').innerText(),`${f.before} cartas`);
  assert.equal(await f.page.locator('#hand .is-pending').count(),0);
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
