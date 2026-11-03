// Isolated real API/WebSocket/browser verification for history, controls and fantasy wagons.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{chromium}=require('playwright'),E=require('../engine');
const {createMatchArchive}=require('../match-archive'),{saveRooms,loadRooms}=require('../room-store');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-refinements-')),out=path.resolve('.qa/refinements');
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const cookie='c'.repeat(64),identity=createHash('sha256').update(cookie).digest('hex'),archive=createMatchArchive();
for(let i=0;i<24;i++) {
  const game=E.newGame(['Angel','Angel','Bot 1','Bot 2'],0);
  game.players.forEach((_,seat)=>E.action(game,seat,{type:'choose_initial',indexes:[0,1]}));
  const room={code:'HISTORY'+i,visibility:'private',archiveFull:i!==7,archiveStartedAt:Date.now()-i*3600000-1520000,game,
    members:game.players.map((p,seat)=>({name:p.name,color:p.color,bot:seat>1,guestId:seat===1?identity:'other'}))};
  if(i%4!==0)E.finish(game,true);
  archive.capture(room,i%4===0?'Abandono':null);archive.commit(archive.prepare());
}
saveRooms(process.env.STATE_FILE,new Map(),archive.state);
const app=require('../server'),report={date:new Date().toISOString(),checks:[],layouts:[],errors:[]};
fs.mkdirSync(out,{recursive:true});let browser,page;
function liveRoom() {
  const game=E.newGame(['Angel','Rival'],0);
  game.players.forEach((_,seat)=>E.action(game,seat,{type:'choose_initial',indexes:[0,1]}));
  const deck=[...game.deck,...game.face,...game.players.flatMap(p=>p.hand)];
  game.players.forEach(p=>p.hand=[]);game.deck=deck;
  const take=c=>{const i=deck.indexOf(c);assert.ok(i>=0);return deck.splice(i,1)[0];};
  game.face=['wild','wild','red','blue','green'].map(take);deck.push(take('wild'));
  game.turnDeadline=Date.now()+3600000;
  return {code:'QAUX00',game,updated:Date.now(),visibility:'public',maxPlayers:2,
    members:game.players.map((p,i)=>({name:p.name,color:p.color,token:'feedback-'+i,guestId:i?'other':identity}))};
}
(async()=>{
  await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  async function newPage(viewport={width:1440,height:900},owned=false){
    const context=await browser.newContext({viewport});
    if(owned)await context.addCookies([{name:'trencitos_guest',value:cookie,url:base,httpOnly:true,sameSite:'Lax'}]);
    const p=await context.newPage();p.setDefaultTimeout(12000);
    p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
    p.on('dialog',d=>d.accept());return p;
  }
  const live=liveRoom();app.rooms.set(live.code,live);
  const actor=await newPage(undefined,true),observer=await newPage({width:390,height:844});
  for(const [p,seat]of [[actor,0],[observer,1]]){
    await p.addInitScript(seat=>localStorage.setItem('rr-room-QAUX00','feedback-'+seat),seat);
    await p.goto(base+'/?room=QAUX00');await p.waitForFunction(()=>game?.phase==='play'&&!!board3D);
  }
  page=actor;
  await actor.keyboard.press('h');assert.equal(await actor.evaluate(()=>allDestinationsVisible),true);
  assert.match(await actor.locator('#toast').innerText(),/Destinos resaltados/);
  await actor.keyboard.down('h');await actor.keyboard.down('h');await actor.keyboard.up('h');
  assert.equal(await actor.evaluate(()=>allDestinationsVisible),false);
  await actor.evaluate(()=>{const input=document.createElement('input');input.id='qaTyping';document.body.append(input);input.focus();});
  await actor.keyboard.press('h');assert.equal(await actor.locator('#qaTyping').inputValue(),'h');
  assert.equal(await actor.evaluate(()=>allDestinationsVisible),false);await actor.locator('#qaTyping').evaluate(n=>n.remove());
  await actor.locator('#toggleDestinations').click();assert.equal(await actor.evaluate(()=>allDestinationsVisible),true);
  assert.match(await actor.locator('#toggleDestinations').getAttribute('title'),/H/);
  await actor.locator('#sessionControls summary').click();
  assert.match(await actor.locator('#privateSession').innerText(),/Cambiar enlace de recuperación/);
  const oldToken=await actor.evaluate(()=>token);
  await actor.locator('#rotateRecovery').click();await actor.waitForFunction(old=>token!==old,oldToken);
  assert.equal(loadRooms(process.env.STATE_FILE).find(r=>r.code==='QAUX00').members[0].tokenHash,createHash('sha256').update(await actor.evaluate(()=>token)).digest('hex'));
  await observer.locator('#toggleDestinations').click();
  assert.equal(await observer.locator('#market').isVisible(),false);
  for(const p of [actor,observer])await p.evaluate(()=>{window.renewals=[];const original=playSound;playSound=kind=>{if(kind==='shuffle')renewals.push(kind);return original(kind);};});
  await actor.locator('[data-market-index="2"]').click();
  for(const p of [actor,observer]){await p.waitForFunction(()=>renewals.length===1);await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>renewals.length),1);}
  assert.equal(await observer.locator('.market-refresh-layer').count(),0);
  report.checks.push('H toggles the button state, ignores typing/repeats; private link rotation persists; actual third locomotive sounds once with the mobile market closed');
  const samples=await actor.evaluate(async()=>{
    const previous=soundContext,offline=new OfflineAudioContext(1,24000,24000);
    soundContext=new Proxy(offline,{get(target,key){if(key==='state')return 'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    try{playSound('shuffle');return Array.from((await offline.startRendering()).getChannelData(0));}finally{soundContext=previous;}
  });
  const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
  let peak=0;samples.forEach((v,i)=>{peak=Math.max(peak,Math.abs(v));wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2);});assert.ok(peak>.005&&peak<.8);
  fs.writeFileSync(path.join(out,'market-renewal.wav'),wav);report.audioPeak=peak;
  const history=await newPage(undefined,true);page=history;
  await history.goto(base+'/profile?tab=history');await history.waitForSelector('.history-row');
  assert.equal(await history.locator('.history-row').count(),25);
  const payload=await history.evaluate(()=>fetch('/api/history').then(r=>r.json()));
  assert.equal(payload.matches[0].ownSeat,0);assert.equal(payload.matches[0].rank,null);
  assert.ok(payload.matches.slice(1).every(m=>m.ownSeat===1));
  assert.ok(payload.matches.every(m=>m.players.every(p=>!('guestId'in p)&&!('accountId'in p))));
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1024,768],[768,1024],[767,1024],[390,844],[320,568],[844,390]]){
    await history.setViewportSize({width,height});await history.waitForTimeout(80);
    const layout=await history.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
      listOverflow:document.querySelector('.history-list').scrollWidth-document.querySelector('.history-list').clientWidth,
      rowHeight:document.querySelector('.history-row').getBoundingClientRect().height}));
    report.layouts.push({width,height,...layout});assert.equal(layout.overflow,false);assert.ok(layout.listOverflow<=1);
    assert.ok(layout.rowHeight<= (width<=767?70:50));
    if(width>767&&height>=768)assert.ok(await history.evaluate(()=>{
      const list=document.querySelector('.history-list').getBoundingClientRect(),nav=document.querySelector('.app-sidebar').getBoundingClientRect();
      return list.bottom <= (nav.width>nav.height?nav.top:innerHeight)-8;
    }),'History scroll area must fit above the bottom navigation');
    if([1440,768,390,320].includes(width))await history.screenshot({path:path.join(out,`history-${width}.png`)});
  }
  await history.setViewportSize({width:1440,height:900});
  await history.locator('.history-expand').nth(1).focus();await history.keyboard.press('Enter');
  assert.equal(await history.locator('.history-detail:visible').count(),1);
  await history.locator('.history-row').nth(2).click();assert.equal(await history.locator('.history-detail:visible').count(),1);
  await history.locator('#historyFilter').selectOption('abandoned');assert.equal(await history.locator('.history-row').count(),6);
  assert.ok((await history.locator('.history-rank').allTextContents()).every(v=>v==='—'));
  await history.locator('#historyFilter').selectOption('completed');assert.equal(await history.locator('.history-row').count(),18);
  const replay=await history.locator('.history-replay a').first().getAttribute('href');
  const replayResponse=await history.request.get(base+'/api/history/'+new URL(base+replay).searchParams.get('id'));assert.equal(replayResponse.status(),200);
  await history.locator('#editProfile').click();
  assert.equal(await history.locator('#profileForm').getAttribute('autocomplete'),'off');assert.equal(await history.locator('#profileName').getAttribute('autocomplete'),'off');
  await history.locator('#profileName').fill('Maquinista');await history.locator('#saveProfile').click();
  await history.evaluate(()=>{I18n.select('en');location.reload();});await history.waitForSelector('.history-row');
  assert.equal(await history.locator('.history-table thead th').nth(1).textContent(),'Your rank');
  await history.screenshot({path:path.join(out,'history-en.png')});
  report.checks.push('Real filtered history API, duplicate nicknames with private own-seat metadata, ranks only for completed games, compact rows in nine sizes, keyboard details, filters, replay endpoint, profile save and English');
  await Promise.all([actor,observer,history].map(p=>p.close()));
  const lobby=await newPage();page=lobby;await lobby.goto(base+'/rooms');await lobby.locator('#create').click();await lobby.waitForFunction(()=>!!room&&!!wagonPreview);
  for(const [color,model]of [['#71bba0','dwelling'],['#6269c7','circus']]){
    await lobby.locator(`#roomColors [data-color="${color}"]`).click();await lobby.waitForFunction(model=>document.querySelector('#wagonPreview').dataset.model===model,model);
    const code=await lobby.evaluate(()=>room);assert.equal(loadRooms(process.env.STATE_FILE).find(r=>r.code===code).members[0].color,color);
    await lobby.locator('#wagonPreview').screenshot({path:path.join(out,`wagon-${model}.png`)});
  }
  await lobby.setViewportSize({width:1366,height:768});await lobby.waitForTimeout(100);
  assert.equal(await lobby.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await lobby.locator('.room-settings-scroll').evaluate(n=>n.scrollHeight-n.clientHeight<=1));
  await lobby.screenshot({path:path.join(out,'lobby-1366.png')});
  await lobby.setViewportSize({width:390,height:844});await lobby.locator('[data-room-tab="settings"]').click();
  assert.equal(await lobby.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await lobby.locator('#wagonPreview').scrollIntoViewIfNeeded();await lobby.screenshot({path:path.join(out,'lobby-390.png')});
  await lobby.close();
  const gallery=await newPage({width:1080,height:630});page=gallery;
  await gallery.route('**/__fantasy',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#edf2ef;color:#203e46;font-family:system-ui}h1{font-size:24px;margin:0 0 20px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{border:1px solid #cbdad4;border-radius:12px;background:#fffcf5;overflow:hidden}.stage{height:210px}h2{margin:0;padding:0 18px 18px;font-size:17px}#dense{height:270px;margin-top:16px;position:relative}canvas{display:block}</style><h1>Vivienda, circo y pasajeros</h1><main></main><div id="dense"></div></html>`}));
  await gallery.goto(base+'/__fantasy');
  const stats=await gallery.evaluate(async()=>{
    const {createWagonPreview}=await import('/wagon-preview.js'),{createBoard3D}=await import('/board-3d.js'),{WAGON_STYLES}=await import('/wagon-models.mjs');
    const styles=[...WAGON_STYLES.slice(-2), WAGON_STYLES[0]];window.previews=[];
    for(const style of styles){const article=document.createElement('article');article.innerHTML='<div class="stage"></div><h2>'+style.label+'</h2>';document.querySelector('main').append(article);const preview=createWagonPreview({container:article.firstChild,onFailure:e=>{throw e;}});preview.update(style.color);previews.push(preview);}
    const network=Array.from({length:225},(_,i)=>({d:'',cells:[{x:18+i%25*25,y:16+Math.floor(i/25)*22,angle:0}]}));
    const board=createBoard3D({container:document.querySelector('#dense'),map:{bounds:{x:0,y:0,width:660,height:220},land:[],details:[],cities:{}},network,onFailure:e=>{throw e;}});
    const routes=network.map((_,id)=>({id,owner:id%3})),players=styles.map(s=>({color:s.color,placed:[]}));
    board.resize({x:0,y:0,width:660,height:220,scale:660/1024});board.update({routes,players});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const before=board.stats();board.update({routes,players,highlight:1});board.update({routes,players});
    await new Promise(requestAnimationFrame);window.qaBoard=board;return {before,after:board.stats()};
  });
  assert.equal(stats.before.wagons,225);assert.deepEqual(stats.before.models,stats.after.models);assert.equal(Object.keys(stats.before.models).length,3);
  await gallery.screenshot({path:path.join(out,'fantasy-wagons.png')});
  await gallery.locator('main').screenshot({path:path.join(out,'fantasy-preview.png')});
  const draws=await gallery.evaluate(()=>qaBoard.stats().draws);await gallery.waitForTimeout(200);assert.equal(await gallery.evaluate(()=>qaBoard.stats().draws),draws);
  report.wagons=stats;report.checks.push('Two replacement colors persist through the authoritative lobby; previews and 225 board wagons render, retain models on highlight and stay idle; desktop room still fits without scrolling');
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;console.error(error);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,layouts:report.layouts.length,errors:report.errors}));
  await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
