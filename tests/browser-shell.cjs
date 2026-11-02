/* Real browser + isolated file server. Run: node tests/browser-shell.cjs. */
const assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {chromium}=require('playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-shell-'));
process.env.STATE_BACKEND='file';process.env.STATE_FILE=path.join(temp,'rooms.json');process.env.AUTH_ENABLED='false';
const app=require('../server');
const out=path.resolve(process.env.QA_OUT || path.join(__dirname,'../docs/qa'));fs.mkdirSync(out,{recursive:true});
const report={date:new Date().toISOString(),tests:[],responsive:[],errors:[]};
const save=()=>fs.writeFileSync(path.join(out,'shell-report.json'),JSON.stringify(report,null,2)+'\n');
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});report.browser=browser.version();
 const pages=[];
 async function newPage(options={}){const context=await browser.newContext({viewport:{width:1920,height:929},reducedMotion:'reduce',...options});const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});p.on('dialog',d=>d.accept());pages.push(p);return p;}
 const host=await newPage(),guest=await newPage(),viewer=await newPage();
 const nav=(p,name)=>p.locator(`.app-nav [data-page="${name}"]`).click();
 async function shot(p,name){
  // Fresh surfaces avoid Chrome's stale fixed-layer tiles after many resizes.
  const clean=/^(more|rooms)-/.test(name), target=clean?await p.context().newPage():p;
  if(clean){await target.setViewportSize(p.viewportSize());await target.goto(p.url());}
  await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await target.waitForTimeout(150);await target.screenshot({path:path.join(out,`shell-${name}.png`),animations:'disabled'});
  if(clean)await target.close();
 }
 async function name(p,value){await nav(p,'profile');await p.locator('#editProfile').click();await p.locator('#profileName').fill(value);await p.locator('#saveProfile').click();await p.waitForFunction(()=>!document.querySelector('#profileDialog').open);}
 async function layout(p,label,width,height){
  await p.setViewportSize({width,height});
  const value=await p.evaluate(()=>{
   const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
   const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
   return {overflow:document.documentElement.scrollWidth>innerWidth,nav:rect('.app-sidebar'),content:rect('#lobby'),actions:getComputedStyle(document.querySelector('.directory-actions')).flexDirection,
    more:getComputedStyle(document.querySelector('.more-columns')).display,profile:getComputedStyle(document.querySelector('.profile-layout')).display,
    clipped:[...document.querySelectorAll('#lobby button,#lobby input,#lobby select')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1;}).map(el=>el.id||el.className)};
  });assert.equal(value.overflow,false,`${label} ${width} overflow`);assert.deepEqual(value.clipped,[],`${label} ${width} clipped controls`);
  if(width<=1024)assert.equal(value.nav.y+value.nav.h,height);else assert.equal(value.nav.w,130);
  report.responsive.push({label,width,height,...value});
 }
 try{
  await Promise.all(pages.map(p=>p.goto(base+'/rooms')));
  await host.waitForFunction(()=>!document.querySelector('#create').disabled);
  await name(host,'Maquinista');await host.reload();await host.waitForFunction(()=>document.querySelector('.profile-heading [data-username]').textContent==='Maquinista');
  await host.locator('#editProfile').click();await host.locator('#profileName').fill('Descartar');await host.keyboard.press('Escape');assert.equal(await host.locator('.profile-heading [data-username]').textContent(),'Maquinista');
  await shot(host,'profile-desktop');await host.locator('#editProfile').click();await shot(host,'edit-profile');await host.keyboard.press('Escape');
  await nav(host,'more');assert.equal(await host.locator('#socialIcons a').count(),0);assert.equal(await host.locator('#socialIcons > span').count(),6);
  await host.locator('#moreGroups [data-language]').click();assert.equal(await host.locator('#languageSelect option').count(),2);await host.keyboard.press('Escape');
  await host.locator('[data-content="rules"]').click();assert.equal(await host.locator('#contentTitle').textContent(),'Reglas');await host.goBack();assert.equal(await host.locator('#morePage').isVisible(),true);
  for(const [w,h] of [[1920,929],[1440,900],[1280,800],[1181,820],[1180,820],[1025,768],[1024,768],[992,900],[991,900],[768,1024],[767,1024],[521,844],[520,844],[390,844],[360,800],[844,390]]){
   await nav(host,'more');await layout(host,'more',w,h);
   if([1920,768,390].includes(w))await shot(host,`more-${w}`);
   await nav(host,'profile');await layout(host,'profile',w,h);
   await nav(host,'rooms');await layout(host,'rooms',w,h);
   assert.equal(await host.locator('.directory-actions').evaluate(el=>getComputedStyle(el).flexDirection),w<=520?'column-reverse':'row');
   if([1920,768,390].includes(w))await shot(host,`rooms-${w}`);
  }
  const touch=await newPage({viewport:{width:1366,height:1024},hasTouch:true,isMobile:true});await touch.goto(base+'/rooms');
  assert.equal(await touch.locator('.app-sidebar').evaluate(el=>Math.round(el.getBoundingClientRect().width)),1366);await touch.close();
  report.tests.push('Navigation, profile local persistence/cancel, More placeholders/socials/language, responsive boundaries and landscape touch tablet');save();
  await host.setViewportSize({width:1920,height:929});await host.locator('#create').click();await host.waitForSelector('#roompanel:not(.hidden)');
  const code=await host.locator('#roomcode').textContent();
  await viewer.waitForSelector(`[data-directory-room="${code}"]`);
  await host.locator('#roomVisibility').click();await viewer.waitForFunction(code=>!document.querySelector(`[data-directory-room="${code}"]`),code);
  await host.locator('#roomVisibility').click();await viewer.waitForSelector(`[data-directory-room="${code}"]`);
  for(const value of [4,3]){await host.locator('[data-setting="roomCapacity"] [data-step="-1"]').click();await host.waitForFunction(value=>+document.querySelector('#roomCapacity').value===value,value);}await host.locator('[data-add-bot]').first().click();await host.waitForFunction(()=>document.querySelector('#roomCount').textContent==='2/3');
  await nav(host,'profile');
  await name(guest,'Pasajera');await nav(guest,'rooms');await guest.locator('#openJoin').click();await guest.locator('#code').fill(code);await guest.locator('#join').click();await guest.waitForSelector('#roompanel:not(.hidden)');
  await host.waitForFunction(()=>document.querySelector('#roomCount').textContent==='3/3');assert.equal(await host.locator('#profilePage').isVisible(),true);assert.match(host.url(),/profile/);
  await host.locator('#returnRoom').click();assert.match(await host.locator('#roomFriendsMessage').textContent(),/La sala está llena/);
  assert.equal(await guest.locator('#roomCapacity').isDisabled(),true);assert.equal(await guest.locator('[data-add-bot]').count(),0);
  const saved=require('../room-store').loadRooms(process.env.STATE_FILE).find(r=>r.code===code);assert.equal(saved.visibility,'public');assert.equal(saved.maxPlayers,3);assert.equal(saved.members.filter(m=>m.bot).length,1);
  await shot(host,'waiting-desktop');
  for(const [w,h] of [[1440,900],[1025,768],[1024,768],[768,1024],[390,844],[360,800],[844,390]]){
   await layout(host,'waiting',w,h);
   if(w<=1024){
    await host.locator('button[data-room-tab="players"]').click();
    const overlap=await host.evaluate(()=>document.querySelector('.room-player-list').getBoundingClientRect().bottom>document.querySelector('.room-friends').getBoundingClientRect().top);assert.equal(overlap,false);
    assert.equal(await host.locator('#leaveMobileRoom').isVisible(),true);
    if(w===390)await shot(host,'waiting-mobile-players');
    await host.locator('button[data-room-tab="settings"]').click();assert.equal(await host.locator('#roomVisibility').isVisible(),true);
    if(w===390)await shot(host,'waiting-mobile-settings');
    await host.locator('button[data-room-tab="chat"]').click();assert.equal(await host.locator('.chat-compose input').isDisabled(),true);
    await host.locator('button[data-room-tab="players"]').click();
   }
  }
  await host.setViewportSize({width:1920,height:929});await host.locator('#start').click();
  for(const p of [host,guest]){await p.waitForSelector('#keep');await p.locator('#dialog .ticket-choice input').nth(0).check();await p.locator('#dialog .ticket-choice input').nth(1).check();await p.locator('#keep').click();}
  await host.waitForFunction(()=>game?.phase==='play');
  await viewer.locator('#spectateTab').click();await viewer.locator(`[data-directory-room="${code}"]`).click();await viewer.waitForFunction(()=>game?.spectator&&!!board3D);
  assert.deepEqual(await viewer.evaluate(()=>({seat,hand:game.hand,tickets:game.tickets,initial:game.initial,offer:game.ticketOffer,token})),{seat:-1,hand:[],tickets:[],initial:null,offer:null,token:undefined});
  assert.equal(await viewer.locator('.dockmain').isVisible(),false);assert.equal(await viewer.locator('#sessionControls').isVisible(),true);assert.equal(await viewer.locator('#privateSession').isVisible(),false);
  await shot(viewer,'spectate-desktop');await viewer.setViewportSize({width:390,height:844});await shot(viewer,'spectate-mobile');
  await viewer.reload();await viewer.waitForFunction(()=>game?.spectator);assert.equal(app.rooms.get(code).members.length,3);
  await viewer.locator('#sessionControls summary').click();await viewer.locator('#leaveWatch').click();await viewer.waitForSelector('#roomsPage:visible');assert.equal(app.rooms.get(code).members.length,3);
  report.tests.push('Real public/private directory, create/join, independent host/guest, settings authorization, full room, durable bots, initial selection, spectator privacy/reload/exit');
  // A backend-confirmed profile write must close the modal only on success.
  const account=await newPage();let stored={id:'test-account',initialized:true,nickname:'Cuenta QA',color:'#d9564a'},fail=false;
  await account.route('**/api/account**',async route=>{const u=new URL(route.request().url());if(u.pathname==='/api/account/profile'){if(fail)return route.fulfill({status:500,json:{message:'Guardado de prueba rechazado'}});stored={...stored,...route.request().postDataJSON()};return route.fulfill({json:{profile:stored}});}return route.fulfill({json:u.pathname.endsWith('/rooms')?{rooms:[]}:{enabled:true,profile:stored}});});
  await account.goto(base+'/profile');await account.waitForFunction(()=>document.querySelector('.profile-heading [data-username]').textContent==='Cuenta QA');await name(account,'Nuevo nombre');assert.equal(stored.nickname,'Nuevo nombre');await account.reload();await account.waitForFunction(()=>document.querySelector('.profile-heading [data-username]').textContent==='Nuevo nombre');
  fail=true;await account.locator('#editProfile').click();await account.locator('#profileName').fill('No guardar');await account.locator('#saveProfile').click();await account.waitForFunction(()=>document.querySelector('#profileError').textContent.includes('rechazado'));assert.equal(await account.locator('#profileDialog').evaluate(el=>el.open),true);assert.equal(await account.locator('.profile-heading [data-username]').textContent(),'Nuevo nombre');
  report.tests.push('Profile API success/reload and failure keeps modal/name unchanged (HTTP double, no production account)');
  // Expected 500 for the deliberately rejected profile request above.
  report.errors=report.errors.filter(e=>!e.includes('500 (Internal Server Error)'));
  assert.deepEqual(report.errors,[]);report.passed=true;save();console.log(JSON.stringify({passed:true,tests:report.tests.length,layouts:report.responsive.length,browser:report.browser}));
 }catch(e){report.failure=e.stack;save();await shot(host,'failure');throw e;}
 finally{await browser.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
