// Real server, lobby, persisted ownership, construction and replay. No production state.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../engine'),{saveRooms,loadRooms}=require('../room-store');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-hippie-')),out=path.resolve('.qa/midsommar-scenes');
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'rooms.json'),AUTH_ENABLED:'false'});
const game=E.newGame(['Midsommar','Rojo','Azul','Jade','Índigo'],0);
game.players.forEach((_,i)=>E.action(game,i,{type:'choose_initial',indexes:[0,1]}));
const paints=['#ffffff','#d45748','#458ad4','#71bba0','#6269c7'],left=[37,45,45,45,45];game.routes[51].owner=0;
for(let owner=0;owner<left.length;owner++){
  const subsets=new Map([[0,[]]]);
  for(const r of game.routes.filter(r=>r.owner===null)){
    for(const [sum,chosen] of [...subsets].sort((a,b)=>b[0]-a[0]))if(sum+r.n<=left[owner]&&!subsets.has(sum+r.n))subsets.set(sum+r.n,[...chosen,r]);
    if(subsets.has(left[owner]))break;
  }
  assert.ok(subsets.has(left[owner]));for(const r of subsets.get(left[owner]))r.owner=owner;left[owner]=0;
}
game.players.forEach((p,i)=>{p.color=paints[i];p.trains=left[i];});game.turnDeadline=Date.now()+3600000;
const room={code:'84451701',game,updated:Date.now(),visibility:'public',hostSeat:0,maxPlayers:5,
  members:game.players.map((p,i)=>({name:p.name,color:p.color,token:String(i).repeat(48)}))};
saveRooms(process.env.STATE_FILE,new Map([[room.code,room]]));
const app=require('../server'),report={errors:[],checks:[]};let browser;
fs.mkdirSync(out,{recursive:true});
(async()=>{
  await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const headed=process.env.BROWSER_HEADED==='1';
  browser=await chromium.launch({channel:'chrome',headless:!headed,timeout:30000,
    ...(headed?{chromiumSandbox:true,ignoreDefaultArgs:['--no-startup-window']}:{})});report.browser=browser.version();
  async function pageFor(url,viewport={width:1440,height:900}){
    const p=await browser.newPage({viewport});p.setDefaultTimeout(15000);
    p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
    await p.goto(base+url);return p;
  }
  const frames=p=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  // Capture actual instanced crowd matrices, fades and projected extents after rendering.
  async function capture(p){
    await p.evaluate(async()=>{
      const THREE=await import('/vendor/three.module.js');
      const original=THREE.InstancedMesh.prototype.onBeforeRender,seen=new WeakMap();
      window.hippieRenders=[];
      THREE.InstancedMesh.prototype.onBeforeRender=function(renderer,scene,camera,...args){
        original.call(this,renderer,scene,camera,...args);
        if(seen.get(renderer)===renderer.info.render.frame)return;seen.set(renderer,renderer.info.render.frame);
        const crowds=[],rect=renderer.domElement.getBoundingClientRect();
        scene.traverse(m=>{
          if(!m.isInstancedMesh||!m.count||!m.geometry.name.startsWith('hippie-crowd:'))return;
          const box=m.geometry.boundingBox,mat=new THREE.Matrix4();
          for(let i=0;i<m.count;i++){
            m.getMatrixAt(i,mat);const world=mat.clone().premultiply(m.matrixWorld),bounds={min:[1,1],max:[-1,-1]};
            for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
              const q=new THREE.Vector3(x,y,z).applyMatrix4(world).project(camera);
              for(let k=0;k<2;k++){bounds.min[k]=Math.min(bounds.min[k],q.getComponent(k));bounds.max[k]=Math.max(bounds.max[k],q.getComponent(k));}
            }
            crowds.push({name:m.geometry.name,matrix:mat.toArray(),fade:m.geometry.attributes.crowdFade.getX(i),bounds});
          }
        });
        if(crowds.length)window.hippieRenders.push({crowds,canvas:renderer.domElement.closest('#wagonPreviewStage')?'preview':'board',width:rect.width,height:rect.height});
      };
    });
  }
  // Inspect all six high-detail models through the same production renderer.
  let gallery=await browser.newPage({viewport:{width:1600,height:860},deviceScaleFactor:1.5});
  gallery.on('pageerror',e=>report.errors.push(e.message));
  await gallery.route('**/qa-midsommar',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'helpers/midsommar-preview.html'),'utf8')}));
  await gallery.goto(base+'/qa-midsommar');await gallery.waitForFunction(()=>window.ready);await frames(gallery);
  report.geometry=await gallery.evaluate(async()=>{
    const {HIPPIE_VARIANTS,hippieCrowdParts}=await import('/hippie-model.mjs');
    const {bakeHippieCrowd}=await import('/hippie-geometry.mjs');
    const result=[];
    for(const {id} of HIPPIE_VARIANTS)for(const detail of ['high','low']){
      const g=bakeHippieCrowd(hippieCrowdParts({variant:id,detail}),detail);
      const box=g.boundingBox;
      result.push({id,detail,triangles:g.index.count/3,min:box.min.toArray(),max:box.max.toArray(),finite:[...g.attributes.position.array].every(Number.isFinite)});
      g.dispose();
    }
    return result;
  });
  for(const g of report.geometry){assert.ok(g.finite);assert.ok(g.min[0]>=-10.7&&g.max[0]<=10.7,'travellers fit connected carriages');assert.ok(g.min[2]>=2.9&&g.max[2]<14.8);}
  await gallery.screenshot({path:path.join(out,'variants.png'),fullPage:true});
  await gallery.locator('article').first().screenshot({path:path.join(out,'detail.png')});
  for(const [i,id] of ['picnic','plaza','towers','diagonal','balcony','gathering'].entries())await gallery.locator('article').nth(i).screenshot({path:path.join(out,'scene-'+id+'.png')});
  await gallery.evaluate(()=>previews.forEach(p=>p.dispose()));await gallery.close();
  report.checks.push('All six decorated models bake in high and low detail within the connected carriage footprint');

  let page=await pageFor('/');await page.locator('#create').click();await page.waitForFunction(()=>!!room&&!!wagonPreview);
  await page.locator('#roomColors [data-color="#ffffff"]').click();
  await page.waitForFunction(()=>members[seat]?.color==='#ffffff'&&!pendingRoomColor&&document.querySelector('#wagonPreview').dataset.model==='hippie');
  assert.equal(await page.locator('#roomColors [data-color]').count(),21);
  assert.equal(await page.locator('#chosenColorName').textContent(),'Blanco');
  assert.match(await page.locator('#wagonPreviewStage').getAttribute('aria-label'),/^Midsommar Express,/);
  await app.drain();const code=await page.evaluate(()=>room);
  assert.equal(loadRooms(process.env.STATE_FILE).find(r=>r.code===code).members[0].color,'#ffffff');
  await page.reload();await page.waitForFunction(()=>!!wagonPreview&&members[seat]?.color==='#ffffff');
  await capture(page);
  for(const [w,h,n] of [[1441,900,6],[768,1024,6],[390,844,1]]){
    await page.setViewportSize({width:w,height:h});
    if(await page.locator('button[data-room-tab="settings"]').isVisible())await page.locator('button[data-room-tab="settings"]').click();
    await page.locator('#wagonPreview').scrollIntoViewIfNeeded();
    await page.evaluate(w=>wagonPreview.update('#ffffff','qa:'+w),w);await frames(page);
    await page.waitForFunction(()=>hippieRenders.some(r=>r.canvas==='preview'));
    assert.equal(await page.locator('.wagon-preview-item:not([hidden])').count(),n);
    const actual=await page.evaluate(()=>hippieRenders.filter(r=>r.canvas==='preview').at(-1));assert.equal(actual.crowds.length,n);
    for(const c of actual.crowds)assert.ok(c.bounds.min.every(x=>x>=-1)&&c.bounds.max.every(x=>x<=1),'decorated terrace fits preview camera');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#wagonPreview').screenshot({path:path.join(out,'preview-'+w+'.png')});
    await page.screenshot({path:path.join(out,'lobby-'+w+'.png'),fullPage:true});
  }
  await page.evaluate(()=>I18n.select('en'));await page.reload();await page.waitForFunction(()=>!!wagonPreview);
  assert.match(await page.locator('#wagonPreviewStage').getAttribute('aria-label'),/White/);
  await page.close();report.checks.push('White selection accepted, saved, reloaded and translated; six designs desktop/tablet, one mobile; actual crowd fits preview');

  page=await pageFor('/?room=84451701#recover='+'0'.repeat(48));await page.waitForFunction(()=>game&&board3D);await frames(page);
  const before=await page.evaluate(()=>board3D.stats());assert.equal(before.wagons,225);assert.equal(before.models.hippie,45);
  assert.equal(before.crowds.reduce((n,c)=>n+c.people,0),990);assert.ok(before.crowds.every(c=>c.key.endsWith(':low')));
  const long=before.hippies.filter(p=>p.route===51);assert.equal(long.length,8);assert.equal(new Set(long.slice(0,6).map(p=>p.variant)).size,6);assert.notEqual(long[5].variant,long[6].variant);
  await page.screenshot({path:path.join(out,'board-desktop.png')});report.board=before;
  await capture(page);
  const fades=await page.evaluate(async()=>{
    const draw=async highlight=>{board3D.update({routes:game.routes,players:game.players,visualSeed:room,highlight});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return hippieRenders.at(-1).crowds.map(c=>c.fade);};
    const muted=await draw(1),normal=await draw(0);
    board3D.update({routes:game.routes,players:game.players,visualSeed:room,spotlight:{routes:[51],endpoints:[]}});
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {muted,normal,spotlight:hippieRenders.at(-1).crowds.map(c=>c.fade)};
  });
  assert.ok(fades.muted.every(f=>Math.abs(f-.72)<1e-6));assert.ok(fades.normal.every(f=>f===0));
  assert.equal(fades.spotlight.filter(f=>f===0).length,8);assert.equal(fades.spotlight.filter(f=>f===-1).length,37);
  await page.evaluate(()=>syncBoard3D());await frames(page);
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).hippies,before.hippies);
  await page.reload();await page.waitForFunction(()=>game&&board3D);await frames(page);
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).hippies,before.hippies);
  for(const [w,h] of [[768,1024],[390,844]]){await page.setViewportSize({width:w,height:h});await frames(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'board-'+w+'.png')});}
  const draws=await page.evaluate(()=>board3D.stats().draws);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>board3D.stats().draws),draws);
  const watch=await pageFor('/?watch=84451701');await watch.waitForFunction(()=>game&&board3D);
  assert.deepEqual((await watch.evaluate(()=>board3D.stats())).hippies,before.hippies);await watch.close();
  const active=app.rooms.get(room.code);E.finish(active.game,true);await page.evaluate(()=>sock.close());await page.waitForFunction(()=>game?.phase==='finished',null,{timeout:20000});
  const match=await page.evaluate(()=>fetch('/api/history').then(r=>r.json()).then(h=>h.matches.find(m=>m.id)));
  const recording=await page.evaluate(id=>fetch('/api/history/'+id).then(r=>r.json()),match.id);
  assert.ok(!/"(?:variant|hairstyle|beard|cast)":/.test(JSON.stringify(recording)),'no decorative choices in history');
  await page.goto(base+'/replay?id='+match.id);await page.waitForFunction(()=>game&&board3D);await page.locator('#replayLast').click();
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).hippies,before.hippies);await page.close();
  report.checks.push('225-piece mixed board, 45 Midsommar wagons; highlight/fades, reconnect, spectator, replay and mobile preserve appearance without storing decorations');

  const build=E.newGame(['Constructor','Rival'],0);build.players.forEach((_,i)=>E.action(build,i,{type:'choose_initial',indexes:[0,1]}));build.players[0].color='#ffffff';
  build.deck.push(...build.face,...build.players.flatMap(p=>p.hand));build.face=[];build.players.forEach(p=>p.hand=[]);
  const take=c=>{const i=build.deck.indexOf(c);assert.ok(i>=0);return build.deck.splice(i,1)[0];};
  build.players[0].hand=Array.from({length:8},()=>take('black'));build.deck.push(...['red','green','yellow'].map(take));build.turnDeadline=Date.now()+3600000;
  app.rooms.set('84451702',{code:'84451702',game:build,updated:Date.now(),visibility:'public',hostSeat:0,maxPlayers:2,members:build.players.map((p,i)=>({name:p.name,color:p.color,token:String(i+7).repeat(48)}))});
  page=await pageFor('/?room=84451702#recover='+'7'.repeat(48));await page.waitForFunction(()=>game&&board3D);await capture(page);
  await page.evaluate(()=>{uiDialog='build';buildTarget={routeId:51};showBuildDialog();});await page.locator('#confirmBuild').click();
  await page.waitForFunction(()=>game.routes[51].owner===0&&board3D.stats().hippies.length===8);
  await page.waitForFunction(()=>game.phase==='play'&&board3D.stats().animations.length===0);await frames(page);
  const constructed=await page.evaluate(()=>({stats:board3D.stats(),frames:hippieRenders}));
  assert.equal(new Set(constructed.stats.hippies.slice(0,6).map(p=>p.variant)).size,6);
  assert.ok(constructed.frames.some(r=>r.crowds.some(c=>c.matrix[14]>1)),'crowds rise with their carriage during construction');
  assert.ok(constructed.frames.at(-1).crowds.every(c=>Math.abs(c.matrix[14])<1e-6),'crowds land with body');
  await page.screenshot({path:path.join(out,'constructed.png')});report.constructed=constructed.stats;await page.close();
  report.checks.push('Real accepted Stockholm–Petrograd build, full shuffle bag, lazy-created crowds share landing animation');
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,errors:report.errors,checks:report.checks}));
  await browser?.close();await app.shutdown();app.server.close();
});
