"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),Engine=require('../backend/engine');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-browser-chat-')),out=path.resolve(process.env.QA_OUT||'.qa/chat');
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),report={checks:[],errors:[],date:new Date().toISOString()};fs.mkdirSync(out,{recursive:true});
let browser,a;
(async()=>{
 await app.ready;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 async function page(){const c=await browser.newContext({viewport:{width:1440,height:900}}),p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>report.errors.push(e.message));await p.goto(base+'/rooms');await p.waitForFunction(()=>sock?.readyState===WebSocket.OPEN);return p;}
 const shot=async(p,name)=>{await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await p.screenshot({path:path.join(out,name+'.png')});};
 a=await page();const b=await page();await a.locator('#create').click();await a.waitForFunction(()=>!!roomChat?.info);
 const code=await a.locator('#roomcode').textContent();await b.locator('#openJoin').click();await b.locator('#code').fill(code);await b.locator('#join').click();await b.waitForFunction(()=>!!roomChat?.info);await a.waitForFunction(()=>roomChat.info.people.length===2);
 async function say(p,text,id='roomChatInput'){await p.locator('#'+id).fill(text);await p.locator('#'+id).press('Enter');}
 await shot(a,'empty-room-desktop');
 const emptySize=await a.locator('#roomChatInput').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));assert.ok(emptySize.height>=64&&emptySize.scroll<=emptySize.height);assert.equal(emptySize.overflow,'hidden');
 await say(a,'Hola, buena partida 👋');await b.locator('#roomChatPanel .chat-text').filter({hasText:'Hola, buena partida'}).waitFor();
 await say(b,'<img src=x onerror=alert(1)>');await a.locator('#roomChatPanel .chat-text').filter({hasText:'<img'}).waitFor();assert.equal(await a.locator('#roomChatPanel .chat-text img').count(),0);
 await say(a,'idiota');await b.locator('#roomChatPanel .chat-system').waitFor();assert.equal(await a.locator('#roomChatInput').inputValue(),'idiota');assert.equal(await b.locator('#roomChatPanel .chat-text').filter({hasText:'idiota'}).count(),0);
 await say(a,'¡Gracias!');await a.waitForFunction(()=>document.querySelector('#roomChatInput').value==='');
 await a.locator('#roomChatInput').fill('@');await a.locator('#roomChatInput').press('ArrowDown');await a.locator('#roomChatInput').press('Enter');await a.locator('#roomChatInput').press('Enter');await b.locator('#roomChatPanel .chat-mentioned').waitFor();
 const first=b.locator('#roomChatPanel .chat-message').filter({hasText:'Hola, buena partida'});
 assert.equal(await first.locator('.chat-reactions').count(),0);
 await first.hover();await first.getByRole('button',{name:'Añadir reacción',exact:true}).click();
 assert.equal(await b.locator('#roomChatReactions button svg').count(),6);
 await b.locator('#roomChatReactions [data-emoji="👍"]').click();await a.locator('#roomChatPanel .chat-reaction-used[data-emoji="👍"]').waitFor();
 assert.equal(await a.locator('#roomChatPanel .chat-reaction-used').count(),1);
 await first.locator('.chat-reaction-used').click();await b.waitForFunction(()=>!document.querySelector('#roomChatPanel .chat-reaction-used'));
 await first.locator('.chat-react-add').focus();await first.locator('.chat-react-add').press('Enter');await b.keyboard.press('ArrowRight');await b.keyboard.press('Enter');await first.locator('.chat-reaction-used[data-emoji="❤️"]').waitFor();
 await first.locator('.chat-react-add').click();await b.locator('#roomChatReactions [data-emoji="👍"]').click();await first.locator('.chat-reaction-used[data-emoji="👍"]').waitFor();assert.equal(await first.locator('.chat-reaction-used').count(),1);
 await first.locator('.chat-author').click();assert.equal(await b.evaluate(()=>roomChat.info.muted.length),0);
 await b.locator('#roomChatPanel .chat-mute-button').click();await b.locator('#roomChatPeople button').first().click();await b.waitForFunction(()=>roomChat.info.muted.length===1);assert.equal(await b.locator('#roomChatPanel .chat-text').filter({hasText:'Hola, buena partida'}).count(),0);
 await b.reload();await b.waitForFunction(()=>roomChat?.info?.muted.length===1);await b.locator('#roomChatPanel .chat-mute-button').click();await b.locator('#roomChatPeople button[aria-pressed=true]').click();await b.locator('#roomChatPanel .chat-text').filter({hasText:'Hola, buena partida'}).waitFor();await b.keyboard.press('Escape');
 await shot(a,'room-desktop');report.checks.push('Room text/emoji, safe HTML, anonymous filter notice, retained rejected draft, player mention, reaction and mute across reload');
 await a.locator('#start').click();await Promise.all([a,b].map(p=>p.waitForSelector('#keep')));
 for(const p of [a,b]){for(const i of [0,1])await p.locator('.keep').nth(i).check();await p.locator('#keep').click();}
 await Promise.all([a,b].map(p=>p.waitForFunction(()=>game?.phase==='play'&&!!board3D)));
 await a.locator('#tableChat > summary').click();await b.locator('#tableChat > summary').click();
 await a.locator('#tableChatInput').fill('@');
 const options=a.locator('#tableChatSuggestions [data-kind="route"]');
 assert.equal(await options.nth(0).textContent(),await options.nth(1).textContent());assert.doesNotMatch(await options.nth(0).textContent(),/Tramos|Naranja|Negro|[0-9]/);
 const ids=[await options.nth(0).getAttribute('data-reference-id'),await options.nth(1).getAttribute('data-reference-id')];
 await shot(a,'mentions-desktop');await options.nth(0).click();await a.locator('#tableChatInput').pressSequentially('@');await a.locator('#tableChatSuggestions [data-kind="route"]').nth(1).click();
 await a.locator('#tableChatInput').evaluate(el=>el.setSelectionRange(0,0));await a.locator('#tableChatInput').pressSequentially('Mira ');await a.locator('#tableChatInput').press('End');await a.locator('#tableChatInput').press('Enter');
 await a.waitForFunction(()=>document.querySelector('#tableChatInput').value==='');
 assert.equal(app.rooms.get(code).chat.messages.at(-1).parts[0].text,'Mira ');
 assert.deepEqual(app.rooms.get(code).chat.messages.at(-1).parts.filter(p=>p.type==='route').map(p=>String(p.id)),ids);
 await b.locator('#tableChat .chat-route').first().waitFor();const before=JSON.stringify(app.rooms.get(code).game.routes.map(r=>r.owner));
 await b.locator('#tableChat .chat-route').nth(1).click();await b.waitForFunction(()=>tableFocus?.chat&&board3D.stats().spotlightRoutes.length===1);
 assert.equal(JSON.stringify(app.rooms.get(code).game.routes.map(r=>r.owner)),before);assert.equal(await b.evaluate(()=>board3D.stats().previewWagons),0);
 // Screenshots can outlast the 3.5s temporary highlight on software WebGL.
 // Verify expiry, then separately exercise the explicit return control.
 await shot(b,'route-highlight');await b.waitForFunction(()=>tableFocus===null);
 await b.locator('#tableChat .chat-route').nth(1).click();await b.locator('#returnMapView').click();
 assert.equal(await b.evaluate(()=>tableFocus),null);
 await b.locator('#tableChat > summary').click();await say(a,'Un mensaje con el chat cerrado','tableChatInput');await b.locator('#tableChat [data-chat-badge]:not([hidden])').waitFor();
 await b.locator('#tableChat > summary').click();await b.waitForFunction(()=>document.querySelector('#tableChat [data-chat-badge]').hidden).catch(async e=>{console.log('UNREAD',await b.evaluate(()=>{const log=document.querySelector('#tableChat .chat-messages'),root=document.querySelector('#tableChat .chat-body');return {top:log.scrollTop,height:log.scrollHeight,client:log.clientHeight,visible:root.getClientRects().length,badge:document.querySelector('#tableChat [data-chat-badge]').outerHTML,open:document.querySelector('#tableChat').open};}));await shot(b,'unread-failure');throw e;});
 await a.reload();await a.waitForFunction(()=>game?.phase==='play'&&!!roomChat?.info);await a.locator('#tableChat > summary').click();await a.locator('#tableChat .chat-text').filter({hasText:'Hola, buena partida'}).waitFor();
 report.checks.push('Continuous chat, distinct parallel-route IDs with city-only labels, local highlight without wagons/state mutation, unread and reconnect');
 const spectator=await page();await spectator.evaluate(code=>send({type:'spectate',code}),code);await spectator.waitForFunction(()=>spectating&&!!roomChat?.info);await spectator.locator('#tableChat > summary').click();assert.equal(await spectator.locator('#tableChatInput').isDisabled(),true);
 await spectator.evaluate(()=>send({type:'leave'}));await spectator.waitForFunction(()=>!roomChat?.info);
 await spectator.evaluate(code=>send({type:'spectate',code}),code);await spectator.waitForFunction(()=>spectating&&!!roomChat?.info);
 if(!await spectator.locator('#tableChat').evaluate(el=>el.open))await spectator.locator('#tableChat > summary').click();await spectator.locator('#tableChat .chat-text').filter({hasText:'Hola, buena partida'}).waitFor();
 Engine.finish(app.rooms.get(code).game);await a.evaluate(()=>send({type:'rotate_token'}));await spectator.waitForFunction(()=>roomChat.info.canWrite);
 await spectator.evaluate(()=>{Postgame.map();uiDialog=null;document.querySelector('#overlay').classList.add('hidden');});
 await say(spectator,'Buen cierre desde espectadores','tableChatInput');await a.locator('#tableChat .chat-text').filter({hasText:'Buen cierre desde espectadores'}).waitFor();
 report.checks.push('Spectators read during play and can write after the game ends');
 await a.evaluate(()=>{Postgame.map();uiDialog=null;document.querySelector('#overlay').classList.add('hidden');});
 const storageState=await a.context().storageState();
 for(const [width,height]of [[1440,900],[390,844],[844,390]]){
  // Fresh Chrome surfaces avoid stale fixed-layer tiles after viewport rotation.
  const context=await browser.newContext({viewport:{width,height},storageState,hasTouch:width!==1440,isMobile:width!==1440}),p=await context.newPage();
  p.on('pageerror',error=>report.errors.push(error.message));await p.goto(base+'/?room='+code);
  await p.waitForFunction(()=>game?.phase==='finished'&&board3D&&roomChat?.info?.canWrite);
  await p.evaluate(()=>{Postgame.map();uiDialog=null;document.querySelector('#overlay').classList.add('hidden');});
  if(width<=720||height<=500)await p.locator('[data-panel="chat"]').click();else await p.locator('#tableChat > summary').click();
  await p.locator('#tableChatInput').waitFor({state:'visible'});
  const size=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,input:document.querySelector('#tableChatInput').getBoundingClientRect().toJSON()}));
  assert.equal(size.overflow,0);assert.ok(size.input.x>=0&&size.input.right<=width&&size.input.bottom<=height,JSON.stringify(size));
  const input=p.locator('#tableChatInput');
  if(height<500){const panel=await p.locator('#compactPanel').boundingBox(),tools=await p.locator('.boardtools').boundingBox();assert.ok(panel.y>=tools.y+tools.height,JSON.stringify({panel,tools}));}
  assert.equal(await p.locator('.chat-composer button').filter({hasText:'@'}).count(),0);
  const measure=()=>input.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,line:parseFloat(getComputedStyle(el).lineHeight),padding:parseFloat(getComputedStyle(el).paddingTop)+parseFloat(getComputedStyle(el).paddingBottom),overflow:getComputedStyle(el).overflowY}));
  let metric=await measure();assert.equal(metric.overflow,'hidden');assert.ok(metric.scroll<=metric.height+1);assert.equal(metric.height,metric.line*2+metric.padding);
  await input.fill('uno\ndos\ntres\ncuatro\ncinco');metric=await measure();assert.equal(metric.height,metric.line*5+metric.padding);assert.equal(metric.overflow,'hidden');
  await input.fill('uno\ndos\ntres\ncuatro\ncinco\nseis');metric=await measure();assert.equal(metric.height,metric.line*5+metric.padding);assert.equal(metric.overflow,'auto');
  await input.fill('@');await p.locator('#tableChatSuggestions').waitFor({state:'visible'});
  const menu=await p.locator('#tableChatSuggestions').boundingBox(),composer=await p.locator('#tableChat .chat-composer').boundingBox();assert.ok(menu.y>=0&&menu.y+menu.height<=composer.y-6,JSON.stringify({menu,composer}));
  await shot(p,'mentions-'+width);await p.keyboard.press('Escape');await input.fill('');
  const mute=p.locator(width===1440?'#tableChat .chat-mute-button':'.table-panel-heading .chat-mute-button');
  assert.equal(await mute.isVisible(),true);await mute.click();await p.locator('#tableChatPeople button').first().click();await p.waitForFunction(()=>roomChat.info.muted.length===1);
  await p.locator('#tableChatPeople button[aria-pressed=true]').click();await p.waitForFunction(()=>roomChat.info.muted.length===0);await p.keyboard.press('Escape');
  if(width===390){
   await input.fill('Primera línea');await input.press('Enter');await input.pressSequentially('Segunda línea');assert.equal(await input.inputValue(),'Primera línea\nSegunda línea');
   await p.locator('#tableChat .chat-send').click();await p.waitForFunction(()=>document.querySelector('#tableChatInput').value==='');
   assert.equal(app.rooms.get(code).chat.messages.at(-1).parts[0].text,'Primera línea\nSegunda línea');
  }
  await p.locator('#tableChat .chat-messages').evaluate(el=>el.scrollTop=el.scrollHeight);
  if(width!==1440){
   const target=await p.locator('#tableChat .chat-text').last().boundingBox(),cdp=await context.newCDPSession(p);
   const x=target.x+target.width/2,y=target.y+target.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.waitForTimeout(520);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.locator('#tableChatReactions').waitFor({state:'visible'});assert.equal(await p.locator('#tableChatReactions svg').count(),6);await shot(p,'reactions-'+width);await p.keyboard.press('Escape');await cdp.detach();
  }
  await shot(p,'chat-'+width);await context.close();
 }
 report.checks.push('Desktop/phone composer grows from two to five lines, upward suggestions, header mute menus and touch long-press reaction picker fit the viewport');const gallery=await browser.newPage({viewport:{width:720,height:180}});await gallery.setContent('<html><body style="margin:0;background:#fffaf0;color:#214d5b;font:14px system-ui"><main style="display:flex;justify-content:space-around;align-items:center;height:180px"></main></body></html>');await gallery.addScriptTag({path:path.resolve('frontend/chat-art.js')});await gallery.evaluate(()=>{for(const reaction of Object.values(ChatArt.reactions)){const card=document.createElement('div');card.style.cssText='width:100px;text-align:center';card.innerHTML=reaction.art;card.firstChild.style.cssText='width:72px;height:72px';const label=document.createElement('p');label.textContent=reaction.name;card.append(label);document.querySelector('main').append(card);}});await shot(gallery,'reaction-art');await gallery.close();
 assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify(report));
})().catch(async error=>{report.failure=error.stack;console.error(error);process.exitCode=1;await a?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});});
