// Two real simultaneous rooms, rendered hosts and independent WS opponents.
// Bot policies drive legal commands; production rules, transport and storage run unchanged.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {once}=require('node:events'),{chromium}=require('playwright'),{connect}=require('./helpers/ws-client');
const E=require('../backend/engine'),{chooseBotAction}=require('../backend/bots'),{verifyAudit}=require('../scripts/verify-match-audit');
const out=path.resolve(process.env.QA_OUT||'docs/qa/map-selection'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'map-selection-browser-'));
const report={date:new Date().toISOString(),tests:[],errors:[],games:[]},sessions=[];
let app,browser,port,base;
const save=()=>fs.writeFileSync(path.join(out,'selection-report.json'),JSON.stringify(report,null,2)+'\n');
async function boot(){delete require.cache[require.resolve('../backend/server')];app=require('../backend/server');await app.ready;app.server.listen(port||0,'127.0.0.1');await once(app.server,'listening');port=app.server.address().port;base=`http://127.0.0.1:${port}`;}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(dir,'state.json'),AUTH_ENABLED:'false'});delete process.env.RENDER;
  await boot();browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});report.browser=browser.version();
  for(const [index,id] of ['europe','laboratory'].entries()){
    const context=await browser.newContext({viewport:{width:1460,height:940},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
    await page.goto(base);await page.locator('#create').click();await page.waitForFunction(()=>!!room);
    await page.locator('#roomMapChoice').selectOption(String(index));await page.waitForFunction(id=>roomMapRef.id===id,id);
    const code=await page.locator('#roomcode').textContent(),peer=await connect(port);
    peer.send({type:'join',code,name:'Bot policy client',color:'#458ad4'});const lobby=await peer.next('lobby');
    assert.equal(lobby.mapRef.id,id);await page.waitForFunction(()=>members.length===2);
    await page.screenshot({path:path.join(out,id+'-lobby.png')});
    await page.locator('#start').click();await page.waitForFunction(()=>game?.phase==='initial'&&board3D);
    assert.equal(await page.evaluate(()=>game.mapRef.id),id);
    sessions.push({id,code,context,page,peer,token:lobby.token,actions:0,counts:{}});
  }
  let restored=false,total=0;
  while(sessions.some(s=>app.rooms.get(s.code).game.phase!=='finished')&&total<1600){
    for(const s of sessions){
      const room=app.rooms.get(s.code),g=room.game;if(g.phase==='finished')continue;
      if(E.tunnelBusy(g)){
        await s.page.waitForFunction(()=>game?.phase!=='tunnel'||game.sharedTunnel?.stage==='decision');continue;
      }
      let seat=g.phase==='initial'?g.players.findIndex(p=>p.pending.length):g.players.findIndex(p=>p.offer);if(seat<0)seat=g.current;
      const offer=g.players[seat].offer,action=offer?{type:'keep_tickets',offerId:offer.id,indexes:[0]}:chooseBotAction(g,seat);
      assert.ok(action,`No legal bot decision for ${s.id} ${g.phase}`);
      const nextRevision=(room.revision||0)+1;
      if(seat===0){
        await s.page.waitForFunction(type=>!pendingAction&&(type!=='draw_train'||!marketRefresh),action.type);
        await s.page.evaluate(a=>act(a.type,a),action);
      }else{
        const id=`map-action-${s.actions}`;s.peer.send({type:'action',id,revision:room.revision,action});
        try{await s.peer.next('ack',m=>m.id===id,5000);}catch(error){report.rejected={map:s.id,action,error:await s.peer.next('error',()=>true,100).catch(()=>null)};throw error;}
      }
      await s.page.waitForFunction(rev=>game?.revision>=rev,nextRevision);
      // Stay below the production per-peer transport limit, including short turns.
      await s.page.waitForTimeout(240);
      s.actions++;total++;s.counts[action.type]=(s.counts[action.type]||0)+1;
      if(total%75===0){console.log(`Two maps: ${total} accepted actions`);save();}
    }
    if(!restored&&total>=50){
      const previous=sessions.map(s=>structuredClone(app.rooms.get(s.code).game.players));
      for(const s of sessions){await s.page.goto('about:blank');s.peer.close();}
      await app.shutdown();await boot();
      for(const [i,s] of sessions.entries()){
        assert.deepEqual(app.rooms.get(s.code).game.players,previous[i]);
        s.peer=await connect(port);s.peer.send({type:'join',code:s.code,token:s.token});await s.peer.next('state');
        await s.page.goto(`${base}/?room=${s.code}`);await s.page.waitForFunction(()=>game&&board3D);
        assert.equal(await s.page.evaluate(()=>game.mapRef.id),s.id);
      }
      restored=true;report.tests.push({name:'server restart restores both live matches and reconnects all four seats',passed:true});save();
    }
  }
  assert.ok(restored);
  for(const s of sessions){
    const room=app.rooms.get(s.code);assert.equal(room.game.phase,'finished');
    await s.page.waitForFunction(()=>game?.phase==='finished'&&!pendingAction);
    const live=await s.page.evaluate(()=>({stats:board3D.stats(),map:game.mapRef,colors:game.players.map(p=>p.color),hand:game.hand}));
    assert.ok(live.stats.wagons>0);assert.ok(Object.keys(live.stats.models).length>=2);
    const expected=room.game.routes.filter(r=>r.owner!==null).reduce((sum,r)=>sum+r.n,0);assert.equal(live.stats.wagons,expected);
    await s.page.screenshot({path:path.join(out,s.id+'-finished.png')});
    const audit=await(await s.context.request.get(`${base}/api/history/${room.matchId}/audit`)).json();assert.equal(verifyAudit(audit).integrity,true);
    await s.page.goto(`${base}/replay?id=${room.matchId}`);await s.page.waitForFunction(()=>game&&board3D);
    await s.page.locator('#replayLast').click();await s.page.waitForFunction(()=>game.phase==='finished');
    const replay=await s.page.evaluate(()=>board3D.stats());assert.deepEqual(replay.models,live.stats.models);assert.deepEqual(replay.passengers,live.stats.passengers);assert.equal(replay.wagons,expected);
    await s.page.locator('#replayFirst').click();await s.page.waitForFunction(()=>game.phase==='initial');
    assert.equal(await s.page.evaluate(()=>board3D.stats().wagons),0);
    await s.page.locator('#replayLast').click();await s.page.waitForFunction(()=>game.phase==='finished');
    await s.page.locator('#replayViewer').selectOption('-1');assert.deepEqual(await s.page.evaluate(()=>[game.hand,game.tickets]),[[],[]]);
    await s.page.setViewportSize({width:390,height:844});await s.page.screenshot({path:path.join(out,s.id+'-mobile-replay.png')});
    assert.equal(await s.page.locator('.board-3d-canvas').count(),1);
    report.games.push({id:s.id,actions:s.actions,counts:s.counts,phase:room.game.phase,replay:true,privacy:true,audit:true,cosmetics:{models:replay.models,passengerInstances:replay.passengers.length},wagons:expected});save();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(async error=>{report.failure=error.stack;process.exitCode=1;for(const s of sessions)await s.page.screenshot({path:path.join(out,s.id+'-failure.png')}).catch(()=>{});}).finally(async()=>{
  sessions.forEach(s=>s.peer.close());if(browser)await browser.close();if(app)await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});save();console.log(JSON.stringify(report));
});
