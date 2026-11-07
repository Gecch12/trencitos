// Real disposable server and two Chrome clients. No saved/user room is touched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),E=require('../backend/engine'),{resultsRoom}=require('./helpers/results-preview');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-sounds-')),out=path.resolve('.qa/sound-feedback');fs.mkdirSync(out,{recursive:true});
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(dir,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server');let browser,host;const report={errors:[],audio:[],checks:[]};
(async()=>{
 await app.ready;await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 async function page(mute=false){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push(e.stack));
  await p.addInitScript(mute=>localStorage.setItem('rr-muted',String(mute)),mute);await p.goto(base+'/rooms');await p.waitForFunction(()=>sock?.readyState===1);
  await p.evaluate(()=>{
   window.soundCalls=[];const play=playSound;playSound=(kind,...args)=>{soundCalls.push({kind,at:performance.now()});return play(kind,...args);};
   window.transitions=[];new MutationObserver(()=>transitions.push({hidden:document.getElementById('gameStart').classList.contains('hidden'),at:performance.now()})).observe(document.getElementById('gameStart'),{attributes:true,attributeFilter:['class']});
  });return p;
 }
 host=await page();const guest=await page(true);
 await host.locator('#create').click();await host.waitForSelector('#roompanel:not(.hidden)');const code=await host.locator('#roomcode').textContent();
 assert.deepEqual(await host.evaluate(()=>soundCalls),[]);
 await guest.locator('#openJoin').click();await guest.locator('#code').fill(code);await guest.locator('#join').click();await guest.waitForSelector('#roompanel:not(.hidden)');await host.waitForFunction(()=>members.length===2);
 assert.deepEqual(await host.evaluate(()=>soundCalls.map(x=>x.kind)),['join']);assert.deepEqual(await guest.evaluate(()=>soundCalls),[]);
 await host.locator('[data-add-bot]').first().click();await host.waitForFunction(()=>members.length===3);await guest.waitForFunction(()=>members.length===3);
 assert.deepEqual(await host.evaluate(()=>soundCalls.map(x=>x.kind)),['join','bot-added']);
 assert.deepEqual(await guest.evaluate(()=>soundCalls.map(x=>x.kind)),['bot-added']);assert.equal(await guest.evaluate(()=>soundNodes.size),0);
 await host.locator('#roomVisibility').click();await host.waitForFunction(()=>roomVisibility==='private');assert.equal(await host.evaluate(()=>soundCalls.length),2);
 assert.equal(await host.evaluate(()=>performance.getEntriesByType('resource').some(x=>x.name.endsWith('/ticket-map.js'))),true);
 // Same-token connection replacement is a baseline for the reconnecting client.
 await guest.reload();await guest.waitForSelector('#roompanel:not(.hidden)');await host.waitForFunction(()=>members.every(m=>m.connected));
 const beforeStart=await host.evaluate(()=>soundCalls.filter(x=>x.kind==='join').length);
 await host.locator('#start').click();await host.locator('#gameStart:not(.hidden)').waitFor();
 assert.equal(await host.locator('#overlay').evaluate(n=>n.inert),true);
 await host.screenshot({path:path.join(out,'start.png')});await host.locator('#gameStart').waitFor({state:'hidden'});
 await host.locator('#keep').waitFor();await guest.locator('#keep').waitFor();
 assert.equal(await host.evaluate(()=>soundCalls.filter(x=>x.kind==='start').length),1);
 assert.equal(await host.evaluate(()=>soundCalls.filter(x=>x.kind==='join').length),beforeStart);
 assert.equal(await guest.evaluate(()=>soundNodes.size),0,'muted start still advances');
 const transition=await host.evaluate(()=>transitions);assert.equal(transition.length,2);assert.ok(transition[1].at-transition[0].at<=1100,JSON.stringify(transition));
 assert.equal(await host.evaluate(()=>game.initialDeadline-game.initialRevealAt),60000);assert.equal(await host.locator('#overlay').evaluate(n=>n.inert),false);
 await host.waitForSelector('#ticketMap canvas');await host.screenshot({path:path.join(out,'initial-map.png')});
 for(const i of [0,1])await host.locator('.keep').nth(i).check();await host.locator('#keep').click();await host.locator('#destinationHint').waitFor();
 assert.equal(await host.locator('#toggleDestinations').getAttribute('aria-pressed'),'false');await host.screenshot({path:path.join(out,'highlight-hint-desktop.png')});
 await host.locator('#toggleDestinations').click();assert.equal(await host.locator('#toggleDestinations').getAttribute('aria-pressed'),'true');assert.equal(await host.locator('#destinationHint').isVisible(),false);
 await host.locator('#toggleDestinations').click();assert.equal(await host.locator('#toggleDestinations').getAttribute('aria-pressed'),'false');
 for(const i of [0,1])await guest.locator('.keep').nth(i).check();await guest.locator('#keep').click();await host.waitForFunction(()=>game?.phase==='play');
 assert.equal(await host.locator('.docktip').count(),0);assert.equal(await host.locator('#destinationHint').isVisible(),false);
 for(const width of [820,390]){await host.setViewportSize({width,height:1000});await host.locator('#toggleDestinations').click();assert.equal(await host.locator('#toggleDestinations').getAttribute('aria-pressed'),'true');assert.equal(await host.locator('.destination-aura').isVisible(),false);await host.screenshot({path:path.join(out,`highlight-${width}.png`)});await host.locator('#toggleDestinations').click();}
 report.checks.push('confirmed arrivals/bots without settings or start duplicates','700 ms independent transition, warm module and full initial allowance','one-time hint and on/off state at desktop/tablet/mobile');
 // Listen to actual synthesis offline; each cue is finite, audible and unclipped.
 report.audio=await host.evaluate(async()=>{
  const original=soundContext,wasMuted=muted,metrics=[];
  try{muted=false;
   for(const kind of ['join','bot-added','start','recount-land']){
    const offline=new OfflineAudioContext(1,44100,44100);soundContext=new Proxy(offline,{get(o,k){if(k==='state')return 'running';const v=Reflect.get(o,k,o);return typeof v==='function'?v.bind(o):v;}});
    playSound(kind);const data=(await offline.startRendering()).getChannelData(0);let peak=0,energy=0,last=0;
    for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]**2;if(Math.abs(data[i])>1e-5)last=i;}
    metrics.push({kind,peak,rms:Math.sqrt(energy/data.length),seconds:last/44100,samples:Array.from(data)});
   }
  }finally{soundContext=original;muted=wasMuted;}return metrics;
 });
 for(const sound of report.audio){
  assert.ok(sound.peak>.01&&sound.peak<.8);assert.ok(sound.rms>.001);assert.ok(sound.seconds<1);if(sound.kind==='start')assert.ok(sound.seconds>.6&&sound.seconds<=.71);
  const wav=Buffer.alloc(44+sound.samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);sound.samples.forEach((v,i)=>wav.writeInt16LE(Math.round(v*32767),44+i*2));fs.writeFileSync(path.join(out,sound.kind+'.wav'),wav);delete sound.samples;
 }
 // Finished fixture exercises actual renderer callbacks for all three recounts.
 const final=resultsRoom('QSOUND');app.rooms.set(final.code,final);
 await host.evaluate(()=>{localStorage.setItem('rr-room-QSOUND','a'.repeat(48));});await host.goto(base+'/?room=QSOUND');await host.waitForFunction(()=>game?.phase==='finished'&&board3D);
 await host.evaluate(()=>{window.lands=[];const play=playSound;playSound=(kind,...args)=>{if(kind==='recount-land')lands.push({at:performance.now(),step:document.getElementById('recountCounter').dataset.step,total:document.getElementById('recountTotal').textContent});return play(kind,...args);};});
 assert.equal(await host.locator('#roundStatus').innerText(),'');
 for(const category of ['routes','destinations','express']){
  await host.evaluate(category=>{lands=[];Postgame.start(game.result.find(r=>r.seat===0),category);},category);
  await host.waitForFunction(()=>lands.length===1);await host.locator('#recountPause').click();const count=await host.evaluate(()=>lands.length);await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>lands.length),count);
  await host.locator('#recountSkip').click();assert.equal(await host.evaluate(()=>lands.length),count);await host.locator('#recountResults').click();
 }
 report.checks.push('one impact per landed recount step; pause/skip stay silent','offline audio: finite, audible, no clipping');
 // A delayed module and unavailable Web Audio must never hold the initial cards.
 const slow=await browser.newPage({viewport:{width:390,height:844}});slow.setDefaultTimeout(12000);slow.on('pageerror',e=>report.errors.push(e.stack));
 await slow.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
 let releaseMap;const mapGate=new Promise(ok=>{releaseMap=ok;});
 await slow.route('**/ticket-map.js',async route=>{await mapGate;await route.continue().catch(()=>{});});
 try{
  await slow.goto(base+'/rooms');await slow.waitForFunction(()=>sock?.readyState===1);await slow.locator('#create').click();await slow.waitForSelector('#roompanel:not(.hidden)');
  await slow.locator('[data-add-bot]').first().click();await slow.waitForFunction(()=>members.length===2);await slow.locator('#start').click();
  await slow.locator('#gameStart:not(.hidden)').waitFor();await slow.locator('#gameStart').waitFor({state:'hidden',timeout:2000});
  await slow.locator('.keep').first().check();assert.equal(await slow.locator('.keep').first().isChecked(),true);
  assert.equal(await slow.locator('#ticketMapLoading').isVisible(),true);assert.equal(await slow.evaluate(()=>soundContext),null);
  await slow.screenshot({path:path.join(out,'slow-map-selectable.png')});
 }finally{releaseMap();}
 await slow.waitForSelector('#ticketMap canvas');
 report.checks.push('blocked audio and delayed map leave the initial selection usable');
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
})().catch(async error=>{report.failure=error.stack;console.error(error);process.exitCode=1;if(host)await host.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});});
