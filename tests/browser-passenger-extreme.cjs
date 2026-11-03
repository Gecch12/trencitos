'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{start}=require('../scripts/preview-passenger-extreme.cjs');
const out=path.resolve('.qa/passenger-extreme'),report={errors:[]};
fs.mkdirSync(out,{recursive:true});let server,browser,page;
(async()=>{
  server=await start(0);const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
  page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.goto(base);await page.waitForFunction(()=>window.extremeStudy?.stats().draws>0);await settle();
  report.single=await page.evaluate(()=>extremeStudy.stats());assert.deepEqual(report.single.people,{roof:60,windows:16,exterior:8,door:6});
  assert.equal(await page.title(),'Hippie Train · Trencitos');assert.equal(report.single.color,'#ffffff');
  assert.equal(report.single.detail,'high');assert.equal(report.single.crowds,1);
  for(const bounds of report.single.bounds){
    assert.ok(bounds.min[0]>-10.8&&bounds.max[0]<10.8,'end passengers stay within couplings');
    assert.ok(bounds.min[1]>-6.2&&bounds.max[1]<6.2,'hanging bodies stay within the study framing');
    assert.ok(bounds.min[2]>2&&bounds.max[2]<15,'feet above rails, heads inside camera budget');
  }
  await page.screenshot({path:path.join(out,'hero.png')});await page.locator('.showroom').screenshot({path:path.join(out,'wagon.png')});
  report.variants=[];
  assert.equal(await page.locator('#variant option').count(),6);
  for(const variant of await page.locator('#variant option').evaluateAll(options=>options.map(o=>o.value))){
    await page.locator('#variant').selectOption(variant);await settle();
    report.variants.push(await page.evaluate(()=>extremeStudy.stats()));
    assert.ok((await page.locator('#variantDescription').textContent()).length>15);
    await page.locator('.showroom').screenshot({path:path.join(out,'variant-'+variant+'.png')});
  }
  assert.equal(new Set(report.variants.map(v=>v.variant)).size,6);assert.equal(report.variants.length,6);
  await page.locator('[data-layout="hair"]').click();await settle();
  report.hair=await page.evaluate(()=>extremeStudy.stats());
  assert.equal(report.hair.hairstyles.length,12);assert.equal(report.hair.crowds,0);assert.equal(report.hair.instances,0);
  assert.equal(await page.locator('#hairLabels span').count(),12);
  await page.locator('.showroom').screenshot({path:path.join(out,'hairstyles.png')});
  await page.evaluate(()=>extremeStudy.setView(65));await settle();
  await page.locator('.showroom').screenshot({path:path.join(out,'hairstyles-back.png')});
  report.hairGeometry=await page.evaluate(async()=>{
    const {EXTREME_HAIRSTYLES,extremeHeadParts}=await import('/experiments/passenger-extreme-model.mjs');
    const {bakeExtremeCrowd}=await import('/experiments/passenger-extreme-geometry.mjs');
    const samples=[];
    for(const detail of ['high','low'])for(const hairstyle of EXTREME_HAIRSTYLES.map(s=>s.id)){
      const parts=extremeHeadParts({hairstyle,outfit:'shirt',hair:'#38291f',skin:'#c69374'}).filter(p=>p.role==='hair').map(p=>({...p,person:0}));
      if(!parts.length)continue;
      const g=bakeExtremeCrowd(parts,detail),position=g.attributes.position.array,normal=g.attributes.normal.array;
      samples.push({hairstyle,detail,vertices:g.attributes.position.count,finite:[...position,...normal].every(Number.isFinite),min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});g.dispose();
    }
    for(const beard of ['short','medium','long'])for(const detail of ['high','low']){
      const parts=extremeHeadParts({hairstyle:'bald',beard,hair:'#38291f',skin:'#c69374'}).filter(p=>p.role==='beard').map(p=>({...p,person:0}));
      const g=bakeExtremeCrowd(parts,detail);samples.push({beard,detail,vertices:g.attributes.position.count,
        finite:[...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite),min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});g.dispose();
    }
    return samples;
  });
  for(const sample of report.hairGeometry.filter(s=>s.detail)){
    assert.equal(sample.finite,true);assert.ok(sample.vertices>0);
    assert.ok(sample.max[2]<1.3&&sample.min[2]>-2.5,'long hair and beards stay within the head/torso budget');
  }
  await page.locator('[data-layout="wardrobe"]').click();await settle();
  report.wardrobe=await page.evaluate(()=>extremeStudy.stats());assert.equal(report.wardrobe.outfits.length,12);
  assert.equal(report.wardrobe.crowds,0);assert.equal(await page.locator('#hairLabels span:visible').count(),12);
  await page.evaluate(()=>extremeStudy.setView(-90));await settle();
  await page.locator('.showroom').screenshot({path:path.join(out,'wardrobe.png')});
  await page.evaluate(()=>extremeStudy.setView(90));await settle();
  await page.locator('.showroom').screenshot({path:path.join(out,'wardrobe-back.png')});
  await page.locator('#reset').click();
  await page.locator('#variant').selectOption('picnic');await settle();
  const stage=await page.locator('#stage').boundingBox();
  await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await page.mouse.down();
  await page.mouse.move(stage.x+stage.width/2+100,stage.y+stage.height/2,{steps:5});await page.mouse.up();await settle();
  assert.notEqual((await page.evaluate(()=>extremeStudy.stats())).yaw,report.single.yaw,'drag rotates the model');
  await page.evaluate(()=>extremeStudy.setView(120));await settle();await page.locator('.showroom').screenshot({path:path.join(out,'reverse.png')});
  await page.locator('#reset').click();await page.locator('[data-layout="train"]').click();await settle();
  report.train=await page.evaluate(()=>extremeStudy.stats());assert.equal(report.train.instances,report.single.instances*8);
  assert.equal(report.train.crowds,8);assert.equal(new Set(report.train.shownVariants.slice(0,6)).size,6);
  assert.notEqual(report.train.shownVariants[5],report.train.shownVariants[6]);
  await page.locator('.showroom').screenshot({path:path.join(out,'train.png')});
  await page.locator('[data-layout="gallery"]').click();await settle();await page.locator('.showroom').screenshot({path:path.join(out,'gallery.png')});
  await page.locator('[data-color="#d45748"]').click();await settle();assert.equal(await page.locator('#colorName').textContent(),'Coral');
  await page.locator('[data-layout="single"]').click();await settle();await page.locator('.showroom').screenshot({path:path.join(out,'coral.png')});
  await page.locator('[data-color="#ffffff"]').click();await page.setViewportSize({width:390,height:844});await settle();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  await page.locator('[data-layout="hair"]').click();await settle();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.showroom').screenshot({path:path.join(out,'hairstyles-mobile.png')});
  await page.locator('[data-layout="wardrobe"]').click();await settle();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.showroom').screenshot({path:path.join(out,'wardrobe-mobile.png')});
  await page.locator('[data-layout="single"]').click();await settle();
  await page.setViewportSize({width:768,height:1024});await settle();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'tablet.png')});
  await page.setViewportSize({width:1440,height:960});await page.evaluate(()=>extremeStudy.stress());await settle();
  report.stress=await page.evaluate(()=>extremeStudy.stats());assert.equal(report.stress.instances,report.single.instances*225);
  assert.equal(report.stress.detail,'low');assert.equal(report.stress.crowds,225);
  const closeTriangles=new Map(report.variants.map(v=>[v.variant,v.triangles]));
  const closeBudget=report.stress.shownVariants.reduce((sum,v)=>sum+closeTriangles.get(v),0);
  assert.ok(report.stress.triangles<closeBudget*.35,'far detail keeps all 90 people at less than 35% of the near geometry');
  assert.ok(report.stress.calls<40,'crowds are baked and instanced, not one draw call per person');
  await page.locator('[data-layout="single"]').click();await settle();
  assert.equal(await page.evaluate(()=>extremeStudy.stats().detail),'high','close view restores detail');
  await page.evaluate(()=>extremeStudy.stress());await settle();
  await page.evaluate(()=>extremeStudy.fade('dim'));await settle();assert.equal((await page.evaluate(()=>extremeStudy.stats())).instances,report.stress.instances);
  const draws=await page.evaluate(()=>extremeStudy.stats().draws);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>extremeStudy.stats().draws),draws);
  assert.equal((await page.request.get(base+'/server.js')).status(),404);
  assert.equal((await page.request.get(base+'/api/history')).status(),404);
  assert.equal(await page.locator('#variant option').count(),6,'redraw never duplicates options or listeners');
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,errors:report.errors,stress:report.stress&&{triangles:report.stress.triangles,calls:report.stress.calls,detail:report.stress.detail,crowds:report.stress.crowds}}));
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
});
