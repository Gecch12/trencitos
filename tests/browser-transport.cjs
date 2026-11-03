// Negotiated envelope over real HTTP/WS; client state, ACK, private view and reconnect.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {start}=require('./helpers/threejs-preview');
const out=path.resolve(process.env.QA_OUT||'docs/qa/south-america-release/transport');
(async()=>{fs.mkdirSync(out,{recursive:true});const {server,token,port}=await start(0),base=`http://127.0.0.1:${port}`,browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1460,height:940}}),frames=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>ws.on('framereceived',f=>{try{frames.push(JSON.parse(f.payload));}catch{}}));try{
 await page.goto(`${base}/?room=830101#recover=${token}`);await page.waitForFunction(()=>game&&board3D);
 const route=await page.evaluate(()=>game.routes.find(r=>!r.tunnel&&!GameUI.construction(game,seat,{routeId:r.id}).reason).id);
 await page.locator(`#board [data-route-id="${route}"]`).focus();await page.keyboard.press('Enter');await page.locator('#startBuild').click();await page.locator('#confirmBuild').click();await page.waitForFunction(id=>game.routes.find(r=>r.id===id).owner===0&&!pendingAction,route);
 assert.ok(frames.some(f=>f.type==='batch'&&f.messages.some(m=>m.type==='state')&&f.messages.some(m=>m.type==='ack')));
 const prior=await page.evaluate(()=>({hand:game.hand,owned:game.routes.map(r=>r.owner),map:game.mapRef}));
 await page.reload();await page.waitForFunction(()=>game&&board3D);assert.deepEqual(await page.evaluate(()=>({hand:game.hand,owned:game.routes.map(r=>r.owner),map:game.mapRef})),prior);assert.equal(await page.evaluate(()=>game.players.some(p=>'hand'in p||'tickets'in p)),false);
 await page.waitForFunction(()=>!constructionBusy());await page.screenshot({path:path.join(out,'reconnected.png')});assert.deepEqual(errors,[]);
 const report={at:new Date().toISOString(),browser:browser.version(),envelopeFrames:frames.filter(f=>f.type==='batch').length,acceptedConstruction:true,ackClearsPending:true,reconnect:true,privateView:true,errors,passed:true};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();await require('../backend/server').shutdown();}})().catch(e=>{console.error(e);process.exitCode=1});
