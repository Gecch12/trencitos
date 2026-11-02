// Public card counts, shared avatars and urgent clock audio in an isolated browser.
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright'), E = require('../engine');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-feedback-'));
Object.assign(process.env, { STATE_BACKEND:'file', STATE_FILE:path.join(temp,'state.json'), AUTH_ENABLED:'false' });
const app = require('../server'), out = path.resolve('.qa/player-feedback'); fs.mkdirSync(out,{recursive:true});
const report = { layouts:[], checks:[], errors:[] }; let browser, page;
(async()=>{
  await app.ready; await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const game = E.newGame(['Angel','Bot 1','Bot 2','Bot 3','Bot 4'],0,Date.now(),{turnSeconds:90,ticketExtraSeconds:30,initialSeconds:90});
  game.players.forEach((p,i)=>E.action(game,i,{type:'choose_initial',indexes:[0,1]}));
  game.players.forEach((p,i)=>{p.score=[125,99,102,85,110][i];});
  E.note(game,'Bot 1 prepara su siguiente ruta.',1);
  const room = {code:'QAFEED',updated:Date.now(),visibility:'private',maxPlayers:5,game,
    members:game.players.map((p,i)=>({name:p.name,color:p.color,bot:i>0,token:i?'bot-'+i:'feedback-human'}))};
  app.rooms.set(room.code,room);
  browser = await chromium.launch({channel:'chrome',headless:true});
  page = await browser.newPage({viewport:{width:1440,height:900}}); page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.errors.push(e.message)); page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  await page.addInitScript(()=>localStorage.setItem('rr-room-QAFEED','feedback-human'));
  await page.goto(`http://127.0.0.1:${app.server.address().port}/?room=QAFEED`);
  await page.waitForFunction(()=>game?.phase==='play'&&!!board3D); await page.evaluate(()=>document.fonts.ready);
  await page.locator('#drawblind').click(); await page.waitForFunction(()=>game.hand.length===5);
  assert.equal(await page.locator('[data-player="0"] [data-metric="cards"] strong').textContent(),'5');
  assert.equal(await page.locator('[data-player="1"] [data-metric="cards"] strong').textContent(),'4');
  assert.equal(await page.evaluate(()=>game.players.some(p=>'hand' in p)),false);
  report.checks.push('A real accepted draw updates the public count without receiving rival hands');
  await page.evaluate(()=>{window.feedbackLiveView=structuredClone(game);});
  for(const [width,height] of [[1440,900],[1366,768],[1280,720],[1100,800],[1024,768],[768,1024],[390,844],[360,800],[320,568],[844,390]]){
    await page.setViewportSize({width,height}); await page.waitForTimeout(120);
    const layout=await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('#scores .scorebadge')];
      return {overflow:document.documentElement.scrollWidth>innerWidth,compact:compactMedia.matches,
        rows:rows.map(row=>{
          const box=row.getBoundingClientRect(),metrics=[...row.querySelectorAll('.player-metric')];
          const rects=metrics.map(el=>el.getBoundingClientRect());
          const fits=metrics.every(el=>[el,...el.children].every(n=>{const r=n.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right+.5&&r.top>=box.top&&r.bottom<=box.bottom+.5;}));
          return {count:metrics.length,fits,visible:box.top>=0&&box.bottom<=innerHeight,
            pointsSize:parseFloat(getComputedStyle(metrics[0].querySelector('strong')).fontSize),
            cardsSize:parseFloat(getComputedStyle(metrics[1].querySelector('strong')).fontSize),
            grid:Math.abs(rects[0].x-rects[2].x)<1&&rects[2].y>rects[0].y&&rects[1].x>rects[0].x};
        })};
    });
    report.layouts.push({width,height,...layout}); assert.equal(layout.overflow,false);
    for(const row of layout.rows){assert.equal(row.count,4);assert.ok(row.fits&&row.visible,`${width}×${height}: ${JSON.stringify(row)}`);assert.ok(row.pointsSize>=row.cardsSize*1.4);if(layout.compact)assert.ok(row.grid);}
    if([1440,768,390,320,844].includes(width))await page.screenshot({path:path.join(out,`players-${width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('[data-player="1"]').click();
  assert.match(await page.locator('#compactPlayerDetail').innerText(),/4 cartas/);
  await page.setViewportSize({width:1440,height:900});
  const ratios=()=>page.evaluate(()=>[...document.querySelectorAll('.player-avatar.is-bot')].filter(el=>el.getClientRects().length).map(el=>{
    const style=getComputedStyle(el),svg=el.querySelector('svg').getBoundingClientRect();
    return {history:el.classList.contains('history-avatar'),result:!!el.closest('.results-dialog'),ratio:svg.width/(el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight))};
  }));
  const before=await ratios();assert.ok(before.some(r=>r.history));
  E.finish(game);
  room.members[0].ws.send({type:'state',game:{...E.view(game,0),revision:room.revision||0}});
  await page.waitForSelector('.results-table');
  const after=await ratios();assert.ok(after.some(r=>r.result));
  for(const avatar of [...before,...after])assert.ok(Math.abs(avatar.ratio-.8)<.015,JSON.stringify(avatar));
  await page.screenshot({path:path.join(out,'results-avatars.png')});
  await page.locator('[data-score-seat="0"] [data-score-category="express"]').click();
  assert.ok(await page.locator('.score-trail-ranking .player-avatar.is-bot').count());
  for(const avatar of await ratios())assert.ok(Math.abs(avatar.ratio-.8)<.015);
  report.checks.push('Five-player desktop/mobile/tablet metrics, score hierarchy, touch detail and 80% bot glyphs in players/history/results/ranking');
  // The server fixture is finished; controlled client deadlines exercise the live audio path without expiring its game.
  await page.evaluate(()=>{
    document.querySelector('#overlay').classList.add('hidden');game=structuredClone(feedbackLiveView);uiDialog=null;
    window.clockEvents=[];const original=playSound;
    playSound=kind=>{if(kind.startsWith('clock-'))clockEvents.push({kind,at:performance.now()});return original(kind);};
  });
  async function warn(kind){
    await page.evaluate(kind=>{
      game=structuredClone(feedbackLiveView);const deadline=Date.now()+serverOffset+4700;
      game.turnDeadline=null;game.current=seat;game.ticketOffer=null;game.initial=null;
      if(kind==='turn'){game.phase='play';game.turnDeadline=deadline;}
      if(kind==='initial'){game.phase='initial';game.initial=game.tickets.slice(0,2);game.initialDeadline=deadline;}
      if(kind==='offer'){game.phase='play';game.current=1;game.ticketOffer={tickets:game.tickets.slice(0,1),deadline,duration:60000};}
      clockEvents=[];updateClocks();for(let i=0;i<8;i++)updateClocks();
    },kind);
    await page.waitForFunction(()=>clockEvents.length>=2);
    const events=await page.evaluate(()=>clockEvents);
    assert.equal(events.length,2);assert.notEqual(events[0].kind,events[1].kind);assert.ok(events[1].at-events[0].at>=900);
    await page.evaluate(()=>{game.initial=null;game.ticketOffer=null;game.turnDeadline=null;updateClocks();});
    const count=await page.evaluate(()=>clockEvents.length);await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(()=>clockEvents.length),count);
  }
  for(const kind of ['turn','initial','offer'])await warn(kind);
  await page.evaluate(()=>{game=structuredClone(feedbackLiveView);game.turnDeadline=Date.now()+serverOffset+4000;muted=true;clockEvents=[];updateClocks();});
  await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>clockEvents.length),0);
  await page.evaluate(()=>{muted=false;storagePaused=true;});await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>clockEvents.length),0);
  await page.evaluate(()=>{storagePaused=false;replayAt=Date.now()+serverOffset;updateClocks();});assert.equal(await page.evaluate(()=>clockEvents.length),0);
  report.checks.push('Live Web Audio: one alternating click per second for turn, initial and minimized offer; stops on resolution, mute, storage pause and replay');
  const samples=await page.evaluate(async()=>{
    const previous=soundContext,offline=new OfflineAudioContext(1,5*24000,24000);let at=0;
    soundContext=new Proxy(offline,{get(target,key){if(key==='state')return 'running';if(key==='currentTime')return at;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    try{for(at=0;at<5;at++)playSound(at%2?'clock-tock':'clock-tick');return Array.from((await offline.startRendering()).getChannelData(0));}
    finally{soundContext=previous;}
  });
  let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));assert.ok(peak>.005&&peak<.5);
  const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));
  fs.writeFileSync(path.join(out,'countdown.wav'),wav);report.audio={peak,duration:5};
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;console.error(error);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,layouts:report.layouts.length,errors:report.errors}));
  await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
