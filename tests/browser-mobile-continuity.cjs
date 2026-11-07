// Real HTTP/WebSocket and browser layout; no production credentials or services.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine');
const {ownershipRoom}=require('./helpers/ownership-preview'),{resultsRoom}=require('./helpers/results-preview');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-continuity-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false',RENDER:'false'});
const app=require('../backend/server'),out=path.resolve(process.env.QA_OUT||'.qa/mobile-continuity');
fs.mkdirSync(out,{recursive:true});const report={checks:[],errors:[]};let browser;
(async()=>{
  await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  context.on('page',p=>p.on('pageerror',e=>report.errors.push(e.message)));
  const room=ownershipRoom('QACONT');room.game.turnDeadline=Date.now()+600000;
  room.game.players[0].tickets=E.TICKETS.filter(t=>[2,8,12].includes(t.id));app.rooms.set(room.code,room);
  await context.addInitScript(({code,token})=>{if(location.protocol==='http:')localStorage.setItem('rr-room-'+code,token);},{code:room.code,token:room.members[0].token});
  let page=await context.newPage();await page.goto(base+'/?room='+room.code);await page.waitForFunction(()=>!!game&&!!board3D);
  assert.equal(await page.locator('#historyUnread').count(),0);
  const expected=E.view(room.game,0);assert.equal(await page.locator('#destinationProgress').innerText(),expected.ticketProgress.filter(p=>p.completed).length+'/'+expected.tickets.length);
  await page.locator('#toggleDestinations').click();
  const before=await page.evaluate(()=>({zoom,center:{...mapCenter},routes:board3D.stats().spotlightRoutes}));
  for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await page.locator('#drawtickets').click();
    assert.deepEqual(await page.evaluate(()=>board3D.stats().spotlightRoutes),before.routes);
    await page.locator('#cancelDestinationDraw').click();
    assert.deepEqual(await page.evaluate(()=>({zoom,center:{...mapCenter}})),{zoom:before.zoom,center:before.center});
  }
  await page.locator('#drawtickets').click();await page.locator('#confirmDestinationDraw').click();await page.waitForFunction(()=>!!game.ticketOffer);
  assert.equal(await page.evaluate(()=>allDestinationsVisible),true);assert.deepEqual(await page.evaluate(()=>board3D.stats().spotlightRoutes),before.routes);
  assert.equal(await page.locator('#destinationProgress').innerText(),expected.ticketProgress.filter(p=>p.completed).length+'/'+expected.tickets.length);
  report.checks.push('Destination progress excludes offered tickets; highlight and camera survive cancellation/confirmation on three sizes');
  await page.close();page=await context.newPage();await page.goto(base+'/');await page.waitForSelector('#resumePractice:visible');
  await page.locator('#resumePractice').click();await page.waitForFunction(()=>!!game?.ticketOffer);
  assert.equal(await page.evaluate(()=>room),'QACONT');report.checks.push('Cold page restart continues the saved practice with its pending destination offer');
  await page.close();
  const result=resultsRoom('QARES2');app.rooms.set(result.code,result);
  const resultContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await resultContext.addInitScript(({code,token})=>{if(location.protocol==='http:')localStorage.setItem('rr-room-'+code,token);},{code:result.code,token:result.members[0].token});
  page=await resultContext.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/?room='+result.code);await page.waitForSelector('.results-table');
  for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    assert.equal(await page.locator('.result-chevron').count(),0);
    const rows=await page.locator('.result-summary').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));assert.ok(rows.every(h=>h<=58),JSON.stringify(rows));
    assert.equal(await page.locator('.results-table .score-icon-help').count(),5);
    if(width===390){
      assert.equal(await page.locator('.score-scroll-track').count(),0);
      const scroller=page.locator('.results-table-scroll'),box=await scroller.boundingBox();
      const session=await resultContext.newCDPSession(page),y=box.y+20,start=box.x+box.width-20;
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
      for(const dx of [25,60,100,140])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start-dx,y}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();
      await page.waitForFunction(()=>document.querySelector('.results-table-scroll').scrollLeft>0);
    }
    await page.screenshot({path:path.join(out,'results-'+width+'.png')});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('.score-icon-help').first().tap();assert.equal(await page.locator('#score-icon-tooltip').innerText(),'Puntuación total');
  report.checks.push('Compact results keep totals beside players, provide tap help, and support direct horizontal touch scrolling without an auxiliary track');
  await page.locator('#dialog .dialog-close').click();await page.evaluate(()=>{resetToLobby();});
  const matches=[{id:'11111111-1111-4111-a111-111111111111',startedAt:Date.now(),closedAt:Date.now()+60000,complete:true,status:'completed',map:'Europa',mode:'Clásico',rank:1,ownSeat:0,players:[{name:'Ángel'},{name:'Bot'}],scores:[{seat:0,route:22,destination:20,stations:4,express:10,score:56,winner:true},{seat:1,route:20,destination:-5,stations:12,express:0,score:27}]}];
  await page.route('**/api/history',route=>route.fulfill({json:{matches:[...matches,{...matches[0],status:'active',id:'22222222-2222-4222-a222-222222222222'}]}}));
  await page.goto(base+'/profile?tab=history');await page.waitForSelector('#historyFilter');assert.equal(await page.locator('#historyFilter').inputValue(),'completed');assert.equal(await page.locator('[data-history-row]').count(),1);
  await page.locator('.history-expand').click();assert.equal(await page.locator('.history-score-table .score-icon-help:visible').count(),5);
  await page.screenshot({path:path.join(out,'history-phone.png')});
  const gestures=await page.evaluate(()=>{
    const target=document.querySelector('#historyFilter');const gesture=new Event('gesturestart',{bubbles:true,cancelable:true});target.dispatchEvent(gesture);
    const touch=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(touch,'touches',{value:[{},{}]});target.dispatchEvent(touch);
    const button=document.querySelector('.score-icon-help');
    const tap=()=>{const event=new Event('touchend',{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:[]},changedTouches:{value:[{clientX:20,clientY:20}]}});button.dispatchEvent(event);return event.defaultPrevented;};
    return {gesture:gesture.defaultPrevented,pinch:touch.defaultPrevented,firstTap:tap(),secondTap:tap()};
  });assert.deepEqual(gestures,{gesture:true,pinch:true,firstTap:false,secondTap:false});
  report.checks.push('History defaults to completed matches with shared icons; non-map browser gestures are prevented (synthetic event check)');
  assert.deepEqual(report.errors,[]);
})().catch(error=>{report.failure=error.stack;process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
