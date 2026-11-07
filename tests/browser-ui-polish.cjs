// Regression of the review screenshots; all rooms and identities are disposable.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),{resultsRoom}=require('./helpers/results-preview'),{ownershipRoom}=require('./helpers/ownership-preview');
const {createMatchArchive}=require('../backend/match-archive'),{saveCheckpoint}=require('../backend/room-store');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-polish-')),out=path.resolve(process.env.QA_OUT||'.qa/ui-polish');fs.mkdirSync(out,{recursive:true});
const room=resultsRoom('POLISH');room.practice=false;room.visibility='public';room.archiveFull=true;room.members.forEach((m,i)=>m.bot=i>0);
const archive=createMatchArchive(),final=room.game;room.game=require('../backend/engine').newGame(final.players.map(p=>p.name));archive.capture(room);archive.commit(archive.prepare());room.game=final;archive.capture(room);archive.commit(archive.prepare());
const file=path.join(dir,'state.json');saveCheckpoint(file,{rooms:[],archive:archive.state});Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false'});
const app=require('../backend/server');let browser;const errors=[];
(async()=>{
 await app.ready;app.rooms.set(room.code,room);await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(()=>localStorage.setItem('rr-room-POLISH','a'.repeat(48)));await page.goto(base+'/?room=POLISH');await page.waitForFunction(()=>game?.phase==='finished'&&board3D);
 await page.locator('#watchRecount').click();await page.waitForFunction(()=>document.getElementById('recountCounter').dataset.step==='0'&&Number(document.getElementById('recountTotal').textContent)>0,{},{polling:'raf'});await page.locator('#recountPause').click();
 assert.equal(await page.locator('#recountCounter').getAttribute('data-step'),'0');assert.equal(await page.locator('.recount-caption').innerText(),'Edinburgh — London');assert.equal(await page.locator('#recountTotal').innerText(),'7');
 await page.screenshot({path:path.join(out,'landed-route-desktop.png')});await page.locator('#recountSkip').click();await page.locator('#recountResults').click();
 for(const width of [820,390]){
  await page.setViewportSize({width,height:1000});await page.locator('[data-score-seat="0"] [data-score-category="stations"]').click();
  assert.equal(await page.locator('#dialog .score-scroll-track').count(),0);assert.ok(await page.locator('.results-table-scroll').evaluate(n=>n.scrollWidth>=n.clientWidth));
  await page.locator('.results-table-scroll').evaluate(n=>{n.scrollLeft=n.scrollWidth;});
  assert.equal(await page.locator('.results-table-scroll').evaluate(n=>{const area=n.getBoundingClientRect(),detail=n.querySelector('.result-detail:not([hidden]) .score-breakdown').getBoundingClientRect();return detail.left>=area.left-1&&detail.right<=area.right+1;}),true,'score details remain inside the visible table area after scrolling');
  await page.screenshot({path:path.join(out,`results-${width}.png`)});await page.locator('[data-score-seat="0"] [data-score-category="stations"]').click();
 }
 await page.locator('#postgameReplay').click();await page.waitForFunction(()=>document.getElementById('replayProgress').hidden);await page.locator('#replayMore').click();await page.locator('#replayLast').click();
 assert.equal(await page.locator('#replaySeek').evaluate(n=>n.value===n.max),true);
 assert.deepEqual(await page.locator('#replaySeek').evaluate(n=>({padding:getComputedStyle(n).padding,border:getComputedStyle(n).borderWidth})),{padding:'0px',border:'0px'});
 await page.screenshot({path:path.join(out,'replay-end-mobile.png')});await page.locator('#postgameReplayReturn').click();await page.locator('#postgameMap').click();
 await page.locator('#sessionControls summary').click();assert.equal(await page.locator('#leaveRoom').innerText(),'Volver a salas');assert.equal(await page.locator('#abandonRoom').isVisible(),false);assert.equal(await page.locator('#commitmentNotice').isVisible(),false);
 await page.locator('#leaveRoom').click();await page.waitForFunction(()=>!game);assert.equal(await page.locator('#lobbyError').innerText(),'');assert.equal(await page.locator('#toast').isVisible(),false);assert.equal(app.rooms.has(room.code),false);
 // Native WebView capabilities are emulated here; the suite never launches or installs a phone app.
 const native=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});native.on('pageerror',e=>errors.push(e.stack));
 await native.addInitScript(()=>{globalThis.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{App:{addListener:async()=>({remove(){}})}}};localStorage.setItem('rr-room-POLIVE','preview-human');});
 const live=ownershipRoom('POLIVE');live.practice=false;live.members.forEach((m,i)=>m.bot=i>0);live.game.current=0;live.game.turnDeadline=Date.now()+600000;app.rooms.set(live.code,live);
 await native.goto(base+'/?room=POLIVE');await native.waitForFunction(()=>game&&board3D);
 await native.locator('#sessionControls summary').click();assert.equal(await native.locator('#expandboard').isVisible(),false);assert.equal(await native.locator('#resetMapView').getAttribute('data-icon'),'map-center');await native.locator('#sessionControls summary').click();
 await native.locator('#mapscroll').focus();for(let n=0;n<20;n++)await native.keyboard.press('+');assert.equal(await native.evaluate(()=>zoom),12);
 await native.evaluate(()=>{const cells=geometryFor(7).cells,cell=cells[Math.floor(cells.length/2)];mapCenter={x:cell.x,y:cell.y};applyZoom();});
 await native.screenshot({path:path.join(out,'zoom-12-mobile.png')});await native.locator('#mapscroll').press('Home');
 await native.setViewportSize({width:820,height:1000});assert.equal(await native.locator('#drawtickets').evaluate(n=>n.getBoundingClientRect().height),44);await native.screenshot({path:path.join(out,'market-tablet.png')});
 await native.setViewportSize({width:390,height:844});await native.locator('#sessionControls summary').click();await native.screenshot({path:path.join(out,'native-menu-mobile.png')});
 native.once('dialog',d=>d.accept());await native.locator('#abandonRoom').click();await native.waitForFunction(()=>!game);await native.locator('#toast').waitFor();
 assert.match(await native.locator('#toastMessage').innerText(),/Abandonaste la partida con bots/);assert.equal(await native.locator('#lobbyError').innerText(),'');await native.screenshot({path:path.join(out,'leave-notice-mobile.png')});
 await native.locator('#toast').waitFor({state:'hidden',timeout:5500});await native.evaluate(()=>toast('Aviso descartable'));await native.locator('#dismissToast').click();assert.equal(await native.locator('#toast').isVisible(),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,screenshots:out,checks:['score on landing before next route','mobile results without extra scrollbar','replay at maximum without input padding','finished exit without abandonment','native fullscreen hidden','12x zoom','touch targets','leave notice expires and dismisses']}));
})().catch(async e=>{console.error(e);console.error(errors);process.exitCode=1;}).finally(async()=>{await browser?.close();await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});});
