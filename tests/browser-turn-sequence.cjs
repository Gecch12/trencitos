const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-turn-sequence-'));
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'false'});
const app=require('../backend/server'),out=path.resolve('.qa/transparency-2026-11-03/turn-sequence');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[]};let browser,page;
(async()=>{
 await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const after of [false,true]){
  const g=E.newGame(['Ana','Luis']);for(const seat of [0,1])E.action(g,seat,{type:'choose_initial',indexes:[0,1]});
  g.face=['wild','wild','red','blue','green'];g.deck=['red','blue','green','yellow','purple','orange','white','wild'];g.discard=[];
  if(after)g.deck.push('orange');
  const code=after?'QASEQ1':'QASEQ0',room={code,updated:Date.now(),visibility:'private',maxPlayers:2,game:g,members:[{name:'Ana',token:'sequence-a'},{name:'Luis',token:'sequence-b'}]};app.rooms.set(code,room);
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}});page=await ctx.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(code=>localStorage.setItem('rr-room-'+code,'sequence-a'),code);
  await page.goto(`http://127.0.0.1:${app.server.address().port}/?room=${code}`);await page.waitForFunction(()=>!!game&&!!board3D);
  if(after){await page.locator('#drawblind').click();await page.waitForFunction(()=>game.drawCount===1&&!pendingAction);}
  await page.locator('#market [data-market-index="2"]').click();
  await page.waitForFunction(()=>!marketRefresh&&!pendingMarketRefreshes.length&&!pendingAction);
  await page.waitForFunction(()=>game.turnHistory.some(r=>r.events.some(e=>e.type==='market_refill')));
  if(!after){await page.locator('#drawblind').click();await page.waitForFunction(()=>game.current===1);}
  const row=page.locator('#historyEntries .turn-history-row').filter({hasText:'El mazo repuso'});
  assert.equal(await row.count(),1);
  const steps=await row.locator('.history-step').allTextContents();
  const renewal=steps.findIndex(text=>text.includes('Mesa retirada')),draws=steps.flatMap((text,i)=>text.includes('Robó')?[i]:[]);
  assert.ok(renewal>draws[0]);if(!after)assert.ok(renewal<draws.at(-1));
  assert.equal(await row.locator('.history-market-refill img[src$="wild.svg"]').count(),1);
  assert.ok(await row.locator(`[data-phase="${after?'after':'during'}"]`).count()>0);
  await row.scrollIntoViewIfNeeded();await page.locator('.history-panel').screenshot({path:path.join(out,after?'after.png':'between.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('[data-panel="history"]').click();await row.scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#history').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await page.locator('.history-panel').screenshot({path:path.join(out,after?'after-mobile.png':'between-mobile.png')});
  report.checks.push(after?'Renewal after final draw':'Replacement wildcard and renewal between draws');await ctx.close();
 }
 assert.deepEqual(report.errors,[]);
})().catch(async error=>{report.failure=error.stack;console.error(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(browser)await browser.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});});
