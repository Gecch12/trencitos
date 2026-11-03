// Real local HTTP/WebSocket and Chrome; disposable state, no existing server.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-controls-')),out=path.resolve('.qa/table-controls');
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),report={checks:[],errors:[],date:new Date().toISOString()};fs.mkdirSync(out,{recursive:true});
let browser,host;
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 async function page(){const c=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});const p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});await p.goto(base+'/rooms');await p.waitForFunction(()=>sock?.readyState===WebSocket.OPEN);return p;}
 const shot=async(p,name)=>p.screenshot({path:path.join(out,name+'.png')});
 host=await page();const guest=await page();
 await host.locator('#create').click();await host.waitForSelector('#roompanel:not(.hidden)');
 const code=await host.locator('#roomcode').textContent();
 async function step(id,direction,value){await host.locator(`[data-setting="${id}"] [data-step="${direction}"]`).click();await host.waitForFunction(({id,value})=>+document.getElementById(id).value===value,{id,value});}
 await step('roomCapacity',-1,4);await step('roomTurnSeconds',1,90);await step('roomTicketExtra',-1,15);await step('roomInitialSeconds',1,90);
 await host.locator('#roomVisibility').click();await host.waitForFunction(()=>roomVisibility==='private');await host.locator('#roomVisibility').click();await host.waitForFunction(()=>roomVisibility==='public');
 await guest.locator('#openJoin').click();await guest.locator('#code').fill(code);await guest.locator('#join').click();await guest.waitForSelector('#roompanel:not(.hidden)');
 assert.equal(await guest.locator('#roomTurnSeconds').isDisabled(),true);
 assert.deepEqual(app.rooms.get(code).timing,{turnSeconds:90,ticketExtraSeconds:15,initialSeconds:90});
 assert.deepEqual(require('../backend/room-store').loadRooms(process.env.STATE_FILE).find(r=>r.code===code).timing,app.rooms.get(code).timing);
 assert.equal(require('../backend/room-directory').listRooms(app.rooms).find(r=>r.code===code).turnSeconds,90);
 // Network validation must reject a tampered timer and a guest edit.
 await guest.evaluate(()=>send({type:'room_settings',visibility:'private',maxPlayers:4,timing:{turnSeconds:30,ticketExtraSeconds:30,initialSeconds:30}}));await guest.waitForFunction(()=>document.querySelector('#lobbyError').textContent.includes('anfitrión'));
 await host.evaluate(()=>send({type:'room_settings',visibility:'private',maxPlayers:4,timing:{turnSeconds:42,ticketExtraSeconds:30,initialSeconds:30}}));await host.waitForFunction(()=>document.querySelector('#lobbyError').textContent.includes('tiempos'));
 assert.equal(app.rooms.get(code).visibility,'public');assert.equal(app.rooms.get(code).timing.turnSeconds,90);
 await host.evaluate(()=>document.querySelector('#lobbyError').textContent='');
 await step('roomCapacity',1,5);
 for(let count=3;count<=5;count++){await host.locator('[data-add-bot]').first().click();await host.waitForFunction(count=>members.length===count,count);}
 await host.waitForSelector('#wagonPreview canvas');await host.evaluate(()=>document.fonts.ready);
 report.layouts=[];
 for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]) {
  await host.setViewportSize({width,height});
  await host.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const layout=await host.evaluate(()=>{
   const panel=document.querySelector('.room-settings-scroll'),players=document.querySelector('.room-players-panel'),footer=document.querySelector('.room-start').getBoundingClientRect();
   const preview=document.querySelector('#wagonPreview').getBoundingClientRect(),number=document.querySelector('#roomCapacity');
   return {scroll:panel.scrollHeight-panel.clientHeight,playersScroll:players.scrollHeight-players.clientHeight,overflow:document.documentElement.scrollWidth-innerWidth,
    previewVisible:preview.bottom<=footer.top,footerVisible:footer.bottom<=innerHeight,numberSize:parseFloat(getComputedStyle(number).fontSize)};
  });
  report.layouts.push({width,height,...layout});
  assert.ok(layout.scroll<=1,`Room should fit ${width}×${height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.playersScroll<=1,`Full player panel should fit ${width}×${height}`);
  assert.equal(layout.overflow,0);assert.ok(layout.previewVisible&&layout.footerVisible);assert.ok(layout.numberSize>=30);
  await shot(host,`room-${width}`);
 }
 await host.setViewportSize({width:1366,height:600});
 assert.ok(await host.locator('.room-settings-scroll').evaluate(el=>el.scrollHeight>el.clientHeight));
 await host.locator('#roomColors button').last().scrollIntoViewIfNeeded();await host.locator('#roomColors button').last().click({trial:true});
 await host.locator('#start').click({trial:true});
 for(const [width,height] of [[390,844],[844,390]]){await host.setViewportSize({width,height});await host.locator('button[data-room-tab="settings"]').click();await host.locator('#roomInitialSeconds').scrollIntoViewIfNeeded();await host.locator('#roomInitialSeconds').click({trial:true});assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot(host,`room-${width}`);}
 await host.setViewportSize({width:1440,height:900});await host.reload();await host.waitForFunction(()=>roomTiming.turnSeconds===90&&!!room);assert.equal(await host.locator('#roomTurnSeconds').inputValue(),'90');
 for(let count=4;count>=2;count--){host.once('dialog',d=>d.accept());await host.locator('#members [data-kick]').last().click();await host.waitForFunction(count=>members.length===count,count);}
 await step('roomCapacity',-1,4);
 report.checks.push('Full five-player room fits desktop at 1366×768, 1440×900 and 1920×1080; short windows and mobile keep scrolling with an accessible start button');
 report.checks.push('Host/guest room controls, all discrete settings, visibility, persistence, directory and rejected tampering');
 await host.locator('#start').click();await Promise.all([host,guest].map(p=>p.waitForSelector('#keep')));
 assert.equal(app.rooms.get(code).game.timing.initialSeconds,90);
 await host.evaluate(()=>{window.testSounds=[];const original=playSound;playSound=kind=>{testSounds.push(kind);return original(kind);};});
 await host.locator('.keep').nth(0).check();await host.locator('.keep').nth(0).uncheck();await host.locator('.keep').nth(0).check();await host.locator('.keep').nth(1).check();
 assert.deepEqual(await host.evaluate(()=>testSounds.filter(x=>x.startsWith('pen'))),['pen','pen-undo','pen','pen']);
 await host.locator('#keep').click();await host.waitForFunction(()=>testSounds.includes('pen-sign'));
 for(const i of [0,1])await guest.locator('.keep').nth(i).check();await guest.locator('#keep').click();
 await Promise.all([host,guest].map(p=>p.waitForFunction(()=>game?.phase==='play'&&!!board3D)));
 assert.equal(await host.locator('body > .top').isVisible(),false);assert.equal(await host.locator('.header-user,.notification-bell').count(),0);
 assert.equal(await host.locator('#expandboard svg').count(),1);
 const menu=host.locator('#sessionControls'),summary=menu.locator('summary');
 await summary.click();assert.equal(await menu.evaluate(el=>el.open),true);await host.locator('#scores').click();assert.equal(await menu.evaluate(el=>el.open),false);
 await summary.click();await host.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>el.open),false);assert.equal(await summary.evaluate(el=>el===document.activeElement),true);
 await summary.click();await host.locator('#copyRoomInGame').click();assert.equal(await menu.evaluate(el=>el.open),false);assert.equal(await host.evaluate(()=>navigator.clipboard.readText()),base+'/?room='+code);
 await host.keyboard.press('m');assert.equal(await host.evaluate(()=>muted),true);assert.match(await host.locator('#toast').textContent(),/silenciado/);
 await host.keyboard.down('m');await host.keyboard.down('m');assert.equal(await host.evaluate(()=>muted),false);await host.keyboard.up('m');
 await summary.click();await host.locator('#soundToggle').click();assert.equal(await host.evaluate(()=>muted),true);await host.keyboard.press('m');assert.equal(await host.evaluate(()=>muted),false);
 // Render the actual synthesizer offline to verify non-silent, unclipped strokes.
 report.audio=await host.evaluate(async()=>{
  const originalContext=soundContext,originalMuted=muted,metrics=[];
  try { muted=false;
   for(const kind of ['pen','pen-undo','pen-sign']) {
    const offline=new OfflineAudioContext(1,22050,44100);
    soundContext=new Proxy(offline,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    playSound(kind);const rendered=await offline.startRendering(),data=rendered.getChannelData(0);
    let peak=0,energy=0,last=0;for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]*data[i];if(Math.abs(data[i])>1e-5)last=i;}
    const bins=[];
    for(let start=0;start<data.length;start+=220){let sum=0;for(let i=start;i<Math.min(start+220,data.length);i++)sum+=data[i]*data[i];bins.push(Math.sqrt(sum/220));}
    const threshold=Math.max(...bins)*.08;let bursts=0,active=false;
    for(const energy of bins){const audible=energy>threshold;if(audible&&!active)bursts++;active=audible;}
    metrics.push({kind,peak,rms:Math.sqrt(energy/data.length),seconds:last/44100,bursts});
   }
  } finally {soundContext=originalContext;muted=originalMuted;}
  return metrics;
 });
 for(const metric of report.audio){assert.ok(metric.peak>.005&&metric.peak<.5);assert.ok(metric.rms>.001);}
 assert.ok(report.audio[1].seconds<report.audio[0].seconds&&report.audio[0].seconds<report.audio[2].seconds);
 assert.equal(report.audio[0].bursts,1);assert.equal(report.audio[1].bursts,1);assert.ok(report.audio[2].bursts>=2);
 report.checks.push('Initial pen mark/unmark/sign once per acknowledgement; menu outside/Escape/action close, invitation and mute button/keyboard/toast');
 // Request destinations from the actual active seat and inspect the independent offer clock.
 const active=app.rooms.get(code).game.current===0?host:guest,other=active===host?guest:host;
 const oldDeadline=app.rooms.get(code).game.turnDeadline;
 await active.locator('#drawtickets').click();await active.waitForSelector('#keep');
 assert.equal(app.rooms.get(code).game.players[app.rooms.get(code).game.current===0?1:0].offer.deadline,oldDeadline+15000);
 assert.ok(await active.locator('[data-countdown]').evaluate(el=>parseFloat(el.style.getPropertyValue('--time-left'))>.95));
 await active.locator('.keep').first().check();await active.locator('#minimizeTickets').click();
 const deadline=await active.evaluate(()=>game.ticketOffer.deadline);
 await active.reload();await active.waitForSelector('#keep');assert.equal(await active.locator('.keep').first().isChecked(),true);assert.equal(await active.evaluate(()=>game.ticketOffer.deadline),deadline);
 await active.locator('#minimizeTickets').click();await active.locator('#sessionControls summary').click();await active.locator('#sessionControls [data-language]').click();
 await active.locator('#languageSelect').selectOption('en');await active.waitForFunction(()=>I18n.language==='en'&&!!game&&!!document.querySelector('#keep'));
 assert.equal(await active.locator('.keep').first().isChecked(),true);assert.equal(await active.evaluate(()=>game.ticketOffer.deadline),deadline);
 await active.locator('#keep').click();await active.waitForFunction(()=>!game.ticketOffer);
 report.checks.push('New-ticket remaining time +15, private deadline, draft/reconnect and language reload preserve selection/deadline');
 for(const [width,height] of [[1440,900],[390,844],[844,390]]){
  await active.setViewportSize({width,height});await active.waitForTimeout(160);await active.locator('#sessionControls summary').click();
  assert.equal(await active.locator('#sessionControls [data-language]').isVisible(),true);
  const bounds=await active.locator('.game-menu').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height);
  assert.equal(await active.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot(active,`menu-${width}`);await active.keyboard.press('Escape');
 }
 // Fixed completed-game fixture makes the highlighted heading and bot spacing reviewable.
 const room=app.rooms.get(code);room.game.players[0].tickets=[E.TICKETS[0]];room.members[1].bot=true;room.game.finalRemaining=2;
 E.note(room.game,'Revisión visual');await active.evaluate(()=>send({type:'ping'}));
 // Client snapshot is rendered through the normal UI, with authoritative finished scores.
 await host.evaluate(({view,people})=>{game=view;members=people;resultsSeen=true;uiDialog=null;allDestinationsVisible=true;render();}, {view:E.view(room.game,0),people:room.members.map(m=>({name:m.name,bot:!!m.bot}))});
 await host.setViewportSize({width:1440,height:900});await host.waitForTimeout(220);await shot(host,'highlight-last-round');
 assert.equal(await host.locator('#roundStatus').getAttribute('data-phase'),'last');
 E.finish(room.game);

 await host.evaluate(({view,people})=>{game=view;members=people;resultsSeen=true;uiDialog=null;allDestinationsVisible=true;render();}, {view:E.view(room.game,0),people:room.members.map(m=>({name:m.name,bot:!!m.bot}))});
 await host.setViewportSize({width:1440,height:900});await host.waitForTimeout(220);await shot(host,'highlight-final');
 assert.equal(await host.locator('#roundStatus').getAttribute('data-phase'),'finished');
 report.checks.push('Desktop/mobile/landscape menu bounds, language access and final highlight contrast');
 assert.deepEqual(report.errors,[]);report.passed=true;
 console.log(JSON.stringify({passed:true,checks:report.checks,errors:report.errors}));
})().catch(async error=>{report.failure=error.stack;if(host)await host.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});});
