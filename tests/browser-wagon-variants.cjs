// Real lobby, persisted legacy color, Three.js previews and reconstruction in Chrome.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright'),E=require('../backend/engine'),{saveRooms,loadRooms}=require('../backend/room-store');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-variants-')),out=path.resolve(process.env.QA_OUT || '.qa/passenger-personality');
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'rooms.json'),AUTH_ENABLED:'false'});
const game=E.newGame(['Rojo','Vivienda','Circo','Rosa legado','Azul'],0);
game.players.forEach((_,seat)=>E.action(game,seat,{type:'choose_initial',indexes:[0,1]}));
const paints=['#d45748','#71bba0','#6269c7','#edadd0','#458ad4'],left=[45,45,45,45,45];
for(const r of game.routes){const owner=left.findIndex(n=>n>=r.n);if(owner>=0){r.owner=owner;left[owner]-=r.n;}}
game.players.forEach((p,i)=>{p.color=paints[i];p.trains=left[i];});game.turnDeadline=Date.now()+3600000;
const saved={code:'83456789',game,updated:Date.now(),visibility:'public',hostSeat:0,maxPlayers:5,
  members:game.players.map((p,i)=>({name:p.name,color:p.color,token:String(i).repeat(48)}))};
const savedLobby={code:'83456780',game:null,updated:Date.now(),visibility:'private',hostSeat:0,maxPlayers:5,
  members:[{name:'Rosa anterior',color:'#edadd0',token:'f'.repeat(48)}]};
saveRooms(process.env.STATE_FILE,new Map([[saved.code,saved],[savedLobby.code,savedLobby]]));
const app=require('../backend/server'),report={checks:[],errors:[]};let browser,page;
fs.mkdirSync(out,{recursive:true});
(async()=>{
  await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  async function newPage(viewport={width:1440,height:900}){
    const p=await browser.newPage({viewport});p.setDefaultTimeout(12000);
    p.on('pageerror',e=>report.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
    return p;
  }
  page=await newPage();await page.goto(base+'/?room=83456780#recover='+'f'.repeat(48));await page.waitForFunction(()=>!!room&&!!wagonPreview);
  assert.equal(await page.locator('#chosenColorName').textContent(),'Rosa');
  assert.equal(await page.locator('#wagonPreview').getAttribute('data-model'),'passenger');
  assert.match(await page.locator('#wagonPreviewStage').getAttribute('aria-label'),/Rosa/);
  assert.equal(await page.locator('#roomColors [data-color="#edadd0"]').count(),0);
  await page.evaluate(()=>send({type:'leave'}));await page.waitForFunction(()=>!room);
  await page.locator('#create').click();await page.waitForFunction(()=>!!room&&!!wagonPreview);
  assert.notEqual(await page.evaluate(()=>members[seat].color),'#edadd0');
  assert.equal(await page.locator('#roomColors [data-color]').count(),21);
  assert.equal(await page.locator('#roomColors [data-color="#edadd0"]').count(),0);
  for(const [color,model,label] of [['#71bba0','dwelling','Vivienda'],['#6269c7','circus','Circo']]){
    await page.locator(`#roomColors [data-color="${color}"]`).click();
    await page.waitForFunction(model=>document.querySelector('#wagonPreview').dataset.model===model,model);
    assert.ok((await page.locator('#wagonPreviewStage').getAttribute('aria-label')).startsWith(label + ','));
    const code=await page.evaluate(()=>room);await app.drain();
    assert.equal(loadRooms(process.env.STATE_FILE).find(r=>r.code===code).members[0].color,color);
  }
  await page.reload();await page.waitForFunction(()=>!!room&&!!wagonPreview);
  assert.equal(await page.locator('#wagonPreview').getAttribute('data-model'),'circus');
  await page.evaluate(()=>I18n.select('en'));await page.reload();await page.waitForFunction(()=>!!wagonPreview);
  assert.match(await page.locator('#wagonPreviewStage').getAttribute('aria-label'),/^Circus,/);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-room-tab="settings"]').click();
  await page.locator('#wagonPreview').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,'lobby-mobile.png')});await page.close();
  report.checks.push('21 selectable colors; no pink selection; replacement models persist through server, reload and English; mobile has no overflow');

  page=await newPage();await page.goto(base+'/?room=83456789#recover='+'3'.repeat(48));await page.waitForFunction(()=>game&&board3D);
  assert.equal(await page.evaluate(()=>game.players[3].color),'#edadd0');
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const before=await page.evaluate(()=>board3D.stats());assert.equal(before.wagons,225);
  await page.screenshot({path:path.join(out,'board-desktop.png')});
  assert.deepEqual(Object.keys(before.models).sort(),['circus','dwelling','passenger','tanker']);
  assert.equal(new Set(before.passengers.map(p=>p.variant)).size,6);
  const longRoute=before.passengers.filter(p=>p.route===51);
  assert.equal(longRoute.length,8);assert.equal(new Set(longRoute.slice(0,6).map(p=>p.variant)).size,6);
  assert.equal(new Set(longRoute.slice(6).map(p=>p.variant)).size,2);assert.notEqual(longRoute[5].variant,longRoute[6].variant);
  const stress=await page.evaluate(async()=>{
    board3D.update({routes:game.routes,players:game.players.map(p=>({color:'#d45748',placed:p.placed})),visualSeed:room});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const stats=board3D.stats();syncBoard3D();return stats;
  });
  assert.equal(stress.passengers.length,225);report.passengerStress=stress;
  await page.locator('#toggleDestinations').click();await page.locator('#toggleDestinations').click();
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).passengers,before.passengers);
  await page.reload();await page.waitForFunction(()=>game&&board3D);
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).passengers,before.passengers);
  await page.setViewportSize({width:768,height:1024});await page.waitForTimeout(100);
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).passengers,before.passengers);
  await page.screenshot({path:path.join(out,'board-tablet.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,'board-mobile.png')});
  const draws=await page.evaluate(()=>board3D.stats().draws);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>board3D.stats().draws),draws);
  report.board=before;
  // Compare a spectator's reconstruction and the recorded replay to the player's.
  const spectator=await newPage();await spectator.goto(base+'/?watch=83456789');await spectator.waitForFunction(()=>game&&board3D);
  assert.deepEqual((await spectator.evaluate(()=>board3D.stats())).passengers,before.passengers);await spectator.close();
  const active=app.rooms.get(saved.code);E.finish(active.game,true);
  await page.evaluate(()=>sock.close());await page.waitForFunction(()=>game?.phase==='finished',null,{timeout:20000});
  const history=await page.evaluate(()=>fetch('/api/history').then(r=>r.json()));
  const match=history.matches.find(m=>m.id);assert.ok(match);
  const recording=await page.evaluate(id=>fetch('/api/history/'+id).then(r=>r.json()),match.id);
  assert.ok(!/"(?:variant|visualSeed|wagonSeed|cast)":/.test(JSON.stringify(recording)));
  await page.goto(base+'/replay?id='+match.id);await page.waitForFunction(()=>game&&board3D);
  await page.locator('#replayLast').click();
  assert.deepEqual((await page.evaluate(()=>board3D.stats())).passengers,before.passengers);
  await page.close();report.checks.push('Saved pink restores on backend startup and reconnect; 225 wagons include all passenger variants; stable highlight, resize, reconnect, spectator and replay; no decorative fields in archive and no idle redraw');

  // A real accepted construction must consume all six designs before repeating.
  const build=E.newGame(['Constructor','Rival'],0);
  build.players.forEach((_,seat)=>E.action(build,seat,{type:'choose_initial',indexes:[0,1]}));
  build.deck.push(...build.face,...build.players.flatMap(p=>p.hand));build.face=[];build.players.forEach(p=>p.hand=[]);
  const take=color=>{const i=build.deck.indexOf(color);assert.ok(i>=0);return build.deck.splice(i,1)[0];};
  build.players[0].hand=Array.from({length:8},()=>take('black'));
  build.deck.push(...['red','green','yellow'].map(take));build.turnDeadline=Date.now()+3600000;
  const previousRoute=build.routes.find(r=>r.n===2&&!r.tunnel);previousRoute.owner=0;build.players[0].trains-=2;
  app.rooms.set('83456781',{code:'83456781',game:build,updated:Date.now(),visibility:'public',hostSeat:0,maxPlayers:2,
    members:build.players.map((p,i)=>({name:p.name,color:p.color,token:String(i+7).repeat(48)}))});
  page=await newPage();await page.goto(base+'/?room=83456781#recover='+'7'.repeat(48));await page.waitForFunction(()=>game&&board3D);
  const existing=await page.evaluate(()=>board3D.stats().passengers);
  await page.evaluate(()=>{uiDialog='build';buildTarget={routeId:51};showBuildDialog();});
  await page.locator('#confirmBuild').click();
  await page.waitForFunction(()=>game.routes[51].owner===0&&board3D.stats().passengers.filter(p=>p.route===51).length===8);
  const constructed=await page.evaluate(()=>board3D.stats().passengers);
  assert.deepEqual(constructed.filter(p=>p.route!==51),existing);
  const train=constructed.filter(p=>p.route===51);
  assert.equal(new Set(train.slice(0,6).map(p=>p.variant)).size,6);assert.equal(new Set(train.slice(6).map(p=>p.variant)).size,2);
  assert.notEqual(train[5].variant,train[6].variant);
  await page.waitForFunction(()=>game.phase==='play'&&board3D.stats().animations.length===0);
  assert.deepEqual(await page.evaluate(()=>board3D.stats().passengers),constructed);
  report.constructedRoute=train;await page.close();
  report.checks.push('Real Stockholm–Petrograd construction: six unique variants then two from a new bag, no boundary repeat, prior wagons and landing animation retain appearance');

  page=await newPage({width:1440,height:860});
  await page.route('**/__variants',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#eaf0eb;color:#203e46;font-family:system-ui}h1{font-size:24px;margin:0 0 18px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}article{border:1px solid #cbdad4;border-radius:12px;background:#fffcf5;overflow:hidden}.stage{height:258px}h2{margin:0;padding:0 18px 18px;font-size:16px}canvas{display:block}</style><h1>Pasajeros · Seis composiciones</h1><main></main></html>`}));
  await page.goto(base+'/__variants');
  await page.evaluate(async()=>{
    document.querySelector('h1').textContent='Pasajeros · Seis vagones con personalidad';
    const {createWagonPreview}=await import('/wagon-preview.js'),{wagonAppearance}=await import('/wagon-models.mjs');
    window.previews=[];
    for(const [color,label,variant,cast] of [['#d45748','1 · Clásico','classic',0],['#d45748','2 · Una persona','solo',3],['#d45748','3 · Dos personas','duo',9],['#d45748','4 · Tres personas','trio',15],['#d45748','5 · Apoyándose','lean',22],['#d45748','6 · Saludando','wave',30]]){
      let key='preview';if(variant)for(let i=0;i<10000;i++){const a=wagonAppearance('passenger','gallery'+i);if(a.variant===variant&&a.cast===cast){key='gallery'+i;break;}}
      const article=document.createElement('article');article.innerHTML='<div class="stage"></div><h2>'+label+'</h2>';document.querySelector('main').append(article);
      const preview=createWagonPreview({container:article.firstChild,onFailure:()=>{throw Error('Preview failure');}});preview.update(color,key);previews.push(preview);
    }
    document.querySelectorAll('.stage').forEach(el=>el.style.height='320px');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await page.screenshot({path:path.join(out,'catalog.png')});
  for(const [i,name]of ['classic','solo','duo','trio','lean','wave'].entries())await page.locator('article').nth(i).screenshot({path:path.join(out,name+'.png')});
  await page.setViewportSize({width:1400,height:560});
  await page.evaluate(()=>{
    document.querySelector('h1').textContent='Pasajeros · Cuerpos inclinados y brazos apoyados';
    document.querySelectorAll('article').forEach((el,i)=>{if(i<4)el.style.display='none';});
    document.querySelector('main').style.gridTemplateColumns='repeat(2,1fr)';
    document.querySelectorAll('.stage').forEach(el=>el.style.height='400px');
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await page.screenshot({path:path.join(out,'poses-detail.png')});
  report.checks.push('Six passenger compositions captured from the actual renderer; faceless round heads, independent clothing, hair colors and hairstyles');
  report.poses=await page.evaluate(async()=>{
    const THREE=await import('/vendor/three.module.js');
    const {createBoard3D}=await import('/board-3d.js'),{createWagonPreview}=await import('/wagon-preview.js');
    const {wagonParts,wagonAppearance,wagonRouteAppearances}=await import('/wagon-models.mjs');
    const original=THREE.InstancedMesh.prototype.setMatrixAt,matrices=[],detailShapes=new Set();
    let board,preview;
    THREE.InstancedMesh.prototype.setMatrixAt=function(index,matrix){
      const geometry=this.geometry;
      if(geometry.name.startsWith('coach-')&&!detailShapes.has(geometry.name)) {
        geometry.computeBoundingBox();
        if([...geometry.boundingBox.min.toArray(),...geometry.boundingBox.max.toArray()].some(n=>!Number.isFinite(n)||Math.abs(n)>.50001))throw Error('Carriage detail exceeds normalized bounds: '+geometry.name);
        if(!Array.from(geometry.attributes.normal.array).every(Number.isFinite))throw Error('Invalid detail normals');
        detailShapes.add(geometry.name);
      }
      matrices.push(matrix.clone());return original.call(this,index,matrix);
    };
    function verify(appearance,cell) {
      const a=cell.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
      const parts=wagonParts('passenger',appearance),torsos=parts.filter(p=>p.shape==='person-torso');
      for(const p of parts.filter(p=>p.shape==='person-torso'||p.shape==='person-head')) {
        const [x,y,z]=p.xyz,center=new THREE.Vector3(cell.x+x*c-y*s,-cell.y-x*s-y*c,z);
        const matrix=matrices.find(m=>new THREE.Vector3().setFromMatrixPosition(m).distanceTo(center)<1e-5);
        if(!matrix)throw Error('Missing rendered person part');
        const top=new THREE.Vector3(0,0,.5).applyMatrix4(matrix),bottom=new THREE.Vector3(0,0,-.5).applyMatrix4(matrix),axis=top.sub(bottom);
        if(p.shape==='person-torso') {
          const outward=new THREE.Vector3(-s,-c,0).multiplyScalar(Math.sign(y));
          if(axis.dot(outward)<.18)throw Error('Body leans into the carriage at track angle '+cell.angle);
        } else if(Math.hypot(axis.x,axis.y)>1e-5)throw Error('Head inherited the torso tilt');
      }
      return torsos.length;
    }
    try {
      const container=document.createElement('div');container.style.cssText='width:900px;height:500px';document.body.append(container);
      let key;for(let i=0;i<1000;i++)if(wagonAppearance('passenger','pose'+i).variant==='lean'){key='pose'+i;break;}
      preview=createWagonPreview({container,onFailure:()=>{throw Error('Pose preview failure');}});preview.update('#d45748',key);
      const previewBodies=verify(wagonAppearance('passenger',key),{x:0,y:0,angle:0});preview.dispose();preview=null;matrices.length=0;
      const angles=[0,35,90,135,180,-90],network=angles.map((angle,i)=>({d:'',cells:[{x:30+i*50,y:70,angle}]}));
      board=createBoard3D({container,map:{bounds:{x:0,y:0,width:340,height:150},land:['M0 0H340V150H0Z'],details:[],cities:{}},network,onFailure:()=>{throw Error('Pose board failure');}});
      board.resize({x:0,y:0,width:340,height:150,scale:340/900,scaleY:150/500});
      let seed;for(let n=0;n<1000;n++)if(angles.every((_,i)=>wagonRouteAppearances('passenger',`pose${n}:0:${i}`,1)[0].variant!=='classic')){seed='pose'+n;break;}
      board.update({routes:angles.map((_,id)=>({id,owner:0})),players:[{color:'#d45748',placed:[]}],visualSeed:seed});
      const boardBodies=angles.reduce((count,_,i)=>count+verify(wagonRouteAppearances('passenger',`${seed}:0:${i}`,1)[0],network[i].cells[0]),0);
      return {previewBodies,boardBodies,angles,detailShapes:[...detailShapes]};
    } finally {THREE.InstancedMesh.prototype.setMatrixAt=original;preview?.dispose();board?.dispose();}
  });
  assert.ok(report.poses.previewBodies>0&&report.poses.boardBodies>=12);
  assert.ok(report.poses.detailShapes.length>=10);
  report.checks.push('Actual preview and board instance matrices: torsos lean outward on both sides at six track angles; heads remain upright');
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(async e=>{report.failure=e.stack;process.exitCode=1;console.error(e);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors}));
  await browser?.close();await app.shutdown();fs.rmSync(temp,{recursive:true,force:true});
});
