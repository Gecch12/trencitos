// Real UI/WS checks for the refinement: read-only route playback, deliberate ticket draws and touch gestures.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine'),{ownershipRoom}=require('./helpers/ownership-preview');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-refinement-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),out=path.resolve(process.env.QA_OUT||'.qa/table-refinement');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],gestures:[]};let browser;
(async()=>{
 await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 function add(room){room.practice=false;room.visibility='public';room.maxPlayers=room.members.length;room.game.turnDeadline=Date.now()+600000;app.rooms.set(room.code,room);return room;}
 async function client(room,seat,width=390,height=844){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<700});
  await context.addInitScript(({code,token})=>localStorage.setItem('rr-room-'+code,token),{code:room.code,token:room.members[seat].token});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await p.goto(base+'/?room='+room.code);await p.waitForFunction(()=>!!board3D&&!!game&&!constructionBusy());return p;
 }
 const room=add(ownershipRoom('QAREFN')),g=room.game;
 g.players[0].tickets=E.TICKETS.filter(t=>[2,8,12,15].includes(t.id));
 const p=await client(room,0);const state=()=>JSON.stringify({routes:g.routes,players:g.players,current:g.current,events:g.journal});
 for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(100);
  await p.locator('#playerDetailsToggle').click();
  assert.equal(await p.locator('.scorebadge [data-metric="stations"]:visible').count(),5);
  assert.equal(await p.locator('.scorebadge [data-metric="tickets"]:visible, .scorebadge .player-longest:visible').count(),0);
  await p.locator('#playerDetailsToggle').click();
  assert.equal(await p.locator('.scorebadge .player-avatar:visible').count(),5);
  const previous=await p.evaluate(()=>({zoom,mapCenter:{...mapCenter}}));const before=state();
  const leader=await p.evaluate(()=>game.scoreProgress.players.findIndex(p=>p.bonus>0));
  await p.locator(`[data-player="${leader}"] .live-bonus`).click();
  assert.deepEqual(await p.evaluate(()=>board3D.stats().spotlightRoutes),E.view(g,0).scoreProgress.players[leader].longestRoutes);
  await p.locator('#returnMapView').click();assert.deepEqual(await p.evaluate(()=>({zoom,mapCenter:{...mapCenter}})),previous);
  await p.locator('[data-panel="history"]').click();
  assert.match(await p.locator('#history').innerText(),/Ocupó/);assert.equal(await p.locator('.history-route-focus').first().innerText(),'Ver');
  await p.locator('.history-route-focus').first().click();
  await p.waitForFunction(()=>board3D.stats().animations.some(a=>a.maxLift>2));
  const focus=await p.evaluate(()=>({route:tableFocus.routeId,stats:board3D.stats()}));
  assert.deepEqual(focus.stats.spotlightRoutes,[focus.route]);assert.ok(focus.stats.shadingStrength>.9);
  await p.screenshot({path:path.join(out,`history-lift-${width}.png`)});
  await p.waitForFunction(()=>!tableFocus);assert.equal(state(),before);
  assert.deepEqual(await p.evaluate(()=>({zoom,mapCenter:{...mapCenter}})),previous);
  await p.locator('[data-panel="destinations"]').click();await p.locator('#viewRoutes').click();await p.waitForFunction(()=>!!ticketMapView);
  assert.equal(await p.locator('.visibility-eye:visible').count(),4);
  assert.equal(await p.locator('.ticket-map-footer').isVisible(),false);
  const map=await p.locator('#ticketMap').boundingBox(),row=await p.locator('.ticket-choice').first().boundingBox(),reserve=await p.locator('#ticketTrainReserve').boundingBox();
  assert.ok(row.height<=62 && reserve.height<=32);if(width<700)assert.ok(map.height>=300);
  await p.screenshot({path:path.join(out,`destinations-${width}.png`)});
  await p.keyboard.press('Escape');
 }
 report.checks.push('Phone/tablet/desktop: avatars and stations-only expansion; exact longest-path glow; history lift and stagger settles without changing game state and restores camera; compact destinations with eye controls');
 await p.emulateMedia({reducedMotion:'reduce'});await p.locator('[data-panel="history"]').click();await p.locator('.history-route-focus').first().click();
 assert.equal(await p.evaluate(()=>board3D.stats().animations.length),0);assert.ok(await p.evaluate(()=>board3D.stats().spotlightRoutes.length===1));await p.locator('#returnMapView').click();await p.emulateMedia({reducedMotion:'no-preference'});
 report.checks.push('Reduced motion keeps route highlighting without lifting wagons');
 await p.setViewportSize({width:390,height:844});await p.locator('[data-panel="destinations"]').click();await p.locator('#viewRoutes').click();await p.waitForFunction(()=>!!ticketMapView);
 await p.waitForTimeout(100);
 await p.evaluate(()=>{
  window.gestureAudit={reads:0,rebuilds:0,choices:[...ticketChoices],frames:[]};
  const measure=SVGTextContentElement.prototype.getComputedTextLength;
  SVGTextContentElement.prototype.getComputedTextLength=function(){if(this.closest('#ticketMap'))gestureAudit.reads++;return measure.call(this);};
  new MutationObserver(records=>gestureAudit.rebuilds+=records.filter(r=>r.addedNodes.length||r.removedNodes.length).length).observe(document.querySelector('.ticket-map-overlay'),{childList:true,subtree:true});
 });
 const cdp=await p.context().newCDPSession(p),box=await p.locator('#ticketMap').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 const touches=(radius,dx=0)=>[{x:cx-radius+dx,y:cy,id:1},{x:cx+radius+dx,y:cy,id:2}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(35)});
 for(let i=1;i<=18;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(35+i*2,i)});
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{gestureAudit.frames.push(ticketMapCamera.zoom);resolve();})));
 }
 const pinchZoom=await p.evaluate(()=>ticketMapCamera.zoom);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:cx-35-36+18,y:cy,id:1}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+89+i*2,y:cy-i*2,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const audit=await p.evaluate(()=>({...gestureAudit,after:[...ticketChoices],zoom:ticketMapCamera.zoom}));
 assert.equal(audit.reads,0);assert.equal(audit.rebuilds,0);assert.deepEqual(audit.after,audit.choices);assert.ok(audit.zoom>1.8);assert.equal(audit.zoom,pinchZoom);
 assert.ok(new Set(audit.frames.map(n=>n.toFixed(2))).size>=12);report.gestures.push(audit);
 report.checks.push('Real two-finger pinch and one-finger continuation: continuous camera updates, no ticket changes, zero label DOM rebuilds or text measurements during gestures');
 await p.close();
 const drawGame=E.newGame(['Ana','Luis'],0,0);for(let seat=0;seat<2;seat++)E.action(drawGame,seat,{type:'choose_initial',indexes:[0,1]},{now:0});
 const drawRoom=add({code:'QADRWF',game:drawGame,updated:Date.now(),members:[{name:'Ana',token:'draw-a'},{name:'Luis',token:'draw-b'}]});
 const owner=await client(drawRoom,0),rival=await client(drawRoom,1);const deck=drawGame.shortDeck.length,kept=drawGame.players[0].tickets.length,turn=drawGame.current;
 assert.equal(await rival.locator('#drawtickets').isDisabled(),true);
 for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
  await owner.setViewportSize({width,height});await owner.locator('#drawtickets').click();
  assert.match(await owner.locator('#dialog').innerText(),/Usarás este turno para recibir 3 billetes/);
  assert.equal(drawGame.shortDeck.length,deck);assert.equal(drawGame.current,turn);assert.equal(drawGame.players[0].ticketOffer,undefined);
  await owner.screenshot({path:path.join(out,`confirm-destinations-${width}.png`)});
  await owner.locator('#cancelDestinationDraw').click();assert.equal(drawGame.shortDeck.length,deck);assert.equal(drawGame.current,turn);
 }
 await owner.locator('#drawtickets').click();await owner.locator('#confirmDestinationDraw').click();
 await owner.waitForFunction(()=>!!game.ticketOffer);assert.equal(drawGame.shortDeck.length,deck-3);assert.equal(drawGame.current,1);
 await owner.locator('.keep').first().check();await owner.locator('#keep').click();await owner.waitForFunction(()=>!game.ticketOffer);
 assert.equal(drawGame.players[0].tickets.length,kept+1);
 await rival.waitForFunction(()=>game.current===seat&&!constructionBusy());await rival.locator('#drawblind').click();await rival.waitForFunction(()=>game.drawCount===1&&!pendingAction);
 assert.equal(await rival.locator('#drawtickets').isDisabled(),true);
 report.checks.push('Confirmation on all three sizes leaves server state unchanged on cancel; confirming deals exactly three and spends the turn; keeping one is authoritative; off-turn and after-first-card draw disabled');
 const fourGame=E.newGame(['Ángel','Bot 1','Bot 2','Bot 3'],0,0);
 for(let i=0;i<4;i++)E.action(fourGame,i,{type:'choose_initial',indexes:[0,1]},{now:0});
 const fourRoom=add({code:'QAFOUR',game:fourGame,updated:Date.now(),members:fourGame.players.map((player,i)=>({name:player.name,token:'four-'+i,bot:i>0}))});
 const four=await client(fourRoom,0);
 for(const [width,height] of [[390,844],[768,1024],[1440,900]]){
  await four.setViewportSize({width,height});await four.waitForTimeout(100);
  await four.screenshot({path:path.join(out,`four-players-${width}.png`)});
 }
 report.checks.push('Four-player table visually captured on phone, portrait tablet and desktop');
 assert.deepEqual(report.errors,[]);
})().catch(error=>{report.failure=error.stack;process.exitCode=1;}).finally(async()=>{
 fs.writeFileSync(path.join(out,'refinement-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
