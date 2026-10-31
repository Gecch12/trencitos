// Regression coverage for the 3D board's depth, effects and destination focus.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { start } = require('./helpers/threejs-preview');
const out = path.resolve(__dirname,'../docs/qa');
(async () => {
  const { server,token,port } = await start(Number(process.env.QA_PORT || 3124));
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1460,height:940},reducedMotion:'no-preference'});
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  const base = `http://127.0.0.1:${port}`;
  async function settled() { await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))); }
  async function open(code) {
    await page.goto(`${base}/?room=${code}#recover=${token}`);
    await page.waitForFunction(()=>game && board3D); await settled();
  }
  async function recordMotion() {
    await page.evaluate(()=>{
      window.motionSamples = []; window.motionRecording = true;
      function sample() {
        motionSamples.push(board3D.stats().animations.map(a=>({...a})));
        if(motionRecording) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  }
  async function checkMotion(key) {
    await page.waitForFunction(key=>board3D.stats().animations.some(a=>a.key===key),key);
    await page.waitForFunction(()=>!board3D.stats().animations.length);
    const lifts = await page.evaluate(key=>{
      motionRecording=false; return motionSamples.flat().filter(a=>a.key===key).map(a=>a.maxLift);
    },key);
    assert.ok(lifts.some(n=>n>5),`${key}: elevated pieces`);
    const descent = lifts.slice(lifts.indexOf(Math.max(...lifts)));
    assert.ok(descent.at(-1)<1,`${key}: settled pieces`);
    assert.ok(descent.every((n,i)=>!i || n<=descent[i-1]+.01),`${key}: continuous descent`);
    await settled(); const idle = await page.evaluate(()=>board3D.stats().draws);
    await page.waitForTimeout(150); assert.equal(await page.evaluate(()=>board3D.stats().draws),idle);
    return {key,frames:lifts.length,maxLift:Math.max(...lifts),minLift:Math.min(...lifts)};
  }
  try {
    await page.goto(base); await page.locator('#homeTabPractice').click();
    for(const [color,name,paint,model] of [['#b88929','Amarillo','#f2d33d','auto-carrier'],['#ddaf40','Ámbar','#e5a12c','grain']]) {
      await page.locator(`#practiceColors [data-color="${color}"]`).click();
      await page.waitForFunction(model=>document.getElementById('wagonPreview').dataset.model===model,model);
      assert.equal(await page.locator('#practiceColorName').innerText(),name);
      assert.equal(await page.locator('#homeAvatar').evaluate(n=>n.style.getPropertyValue('--player-color')),paint);
      assert.equal(await page.locator('.color-finish-note').count(),0);
      assert.equal(await page.locator('[data-finish="gold"]').count(),0);
      await settled(); await page.screenshot({path:path.join(out,`palette-${model}.png`),fullPage:true});
    }
    checks.push({name:'stored color keys display yellow cars and amber grain without gold presentation',passed:true});

    await open('830106');
    await page.evaluate(()=>{zoom=3;mapCenter={x:310,y:255};applyZoom();}); await settled();
    const depth = await page.evaluate(()=>({
      freeCells:board3D.stats().freeCells,
      ownershipBands:board3D.stats().ownershipBands,
      visibleSvgPieces:[...document.querySelectorAll('#board .train-space,#board .station-piece,#board .owned-piece,#board .tunnel-mark,#board .ferry-mark')].filter(n=>getComputedStyle(n).opacity!=='0').length,
      animations:board3D.stats().animations.length,
    }));
    assert.ok(depth.freeCells>0); assert.equal(depth.ownershipBands,3);
    assert.equal(depth.visibleSvgPieces,0); assert.equal(depth.animations,0);
    await page.screenshot({path:path.join(out,'threejs-frankfurt-depth.png')});
    checks.push({name:'Frankfurt and free routes share 3D depth; occupied paths have owner bands; no replay on load',...depth});
    await page.locator('#board [data-city="FRA"]').focus(); await settled();
    assert.equal(await page.evaluate(()=>board3D.stats().selection.city),'FRA');
    await page.locator('#board [data-route-id="28"]').focus(); await settled();
    assert.equal(await page.evaluate(()=>board3D.stats().selection.route),28);
    await page.locator('#toggleDestinations').focus(); await settled();
    checks.push({name:'keyboard focus is reflected in depth-tested route/city highlights',passed:true});
    const before = await page.evaluate(()=>board3D.stats());
    await page.locator('#toggleDestinations').click(); await page.waitForTimeout(220); await settled();
    const focus = await page.evaluate(()=>({stats:board3D.stats(),paths:game.ticketPaths[0].routes,
      clonedPieces:document.querySelectorAll('#destinationSpotlight .connection-pieces,#destinationSpotlight .station-piece').length}));
    assert.deepEqual(focus.stats.spotlightRoutes,focus.paths); assert.equal(focus.clonedPieces,0);
    assert.deepEqual(focus.stats.models,before.models); assert.equal(focus.stats.stations,before.stations);
    await page.screenshot({path:path.join(out,'threejs-destinations.png')});
    await page.locator('#toggleDestinations').click(); await settled();
    assert.deepEqual(await page.evaluate(()=>board3D.stats().spotlightRoutes),[]);
    checks.push({name:'destination focus preserves 3D models, stations and owner colors; toggle clears it',passed:true});
    await open('830107'); await page.locator('#toggleDestinations').click(); await page.waitForTimeout(220); await settled();
    const borrowed = await page.evaluate(()=>({rendered:board3D.stats().borrowedRoutes,expected:game.ticketPaths[0].stationRoutes}));
    assert.ok(borrowed.expected.length); assert.deepEqual(borrowed.rendered,borrowed.expected);
    await page.screenshot({path:path.join(out,'threejs-borrowed-destination.png')});
    await page.setViewportSize({width:390,height:844}); await settled();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,'threejs-destinations-mobile.png')});
    await page.setViewportSize({width:1460,height:940});
    checks.push({name:'borrowed route keeps its owner and dashed 3D connection; mobile without overflow',...borrowed});

    await open('830101');
    const route = await page.evaluate(()=>game.routes.find(r=>!r.tunnel && !GameUI.construction(game,seat,{routeId:r.id}).reason).id);
    await page.locator(`#board [data-route-id="${route}"]`).focus(); await page.keyboard.press('Enter');
    await page.locator('#startBuild').click(); await recordMotion(); await page.locator('#confirmBuild').click();
    const routeMotion = await checkMotion(`route:${route}`);
    await page.reload(); await page.waitForFunction(()=>game && board3D); await settled();
    assert.deepEqual(await page.evaluate(()=>board3D.stats().animations),[]);
    checks.push({name:'accepted route animates actual meshes then rests; reconnect does not replay',...routeMotion});

    await open('830103');
    await page.locator('#board [data-city="PAR"]').focus(); await page.keyboard.press('Enter');
    await page.locator('#startBuild').click(); await recordMotion(); await page.locator('#confirmBuild').click();
    checks.push({name:'station settles with the same construction effect',...await checkMotion('city:PAR')});

    await open('830105');
    const tunnel = await page.evaluate(()=>game.routes.find(r=>r.tunnel && r.color==='gray' && r.n===2).id);
    await page.locator(`#board [data-route-id="${tunnel}"]`).focus(); await page.keyboard.press('Enter');
    await page.locator('#startBuild').click(); await page.locator('#confirmBuild').click();
    await page.waitForFunction(()=>!!tunnelReveal?.build);
    assert.equal(await page.evaluate(()=>board3D.stats().wagons),0);
    assert.deepEqual(await page.evaluate(()=>board3D.stats().animations),[]);
    await page.locator('#skipTunnelReveal').click(); await page.waitForFunction(()=>tunnelReveal?.finished);
    await recordMotion(); await page.locator('#skipTunnelReveal').click();
    checks.push({name:'tunnel remains unbuilt during evidence and animates once after resolution',...await checkMotion(`route:${tunnel}`)});

    await page.emulateMedia({reducedMotion:'reduce'}); await open('830102');
    await page.locator('#board [data-city="PAR"]').focus(); await page.keyboard.press('Enter');
    await page.locator('#startBuild').click(); await page.locator('#confirmBuild').click();
    await page.waitForFunction(()=>game.players[0].placed.includes('PAR')); await settled();
    assert.equal(await page.evaluate(()=>board3D.stats().stations),1);
    assert.deepEqual(await page.evaluate(()=>board3D.stats().animations),[]);
    checks.push({name:'reduced motion presents accepted construction immediately',passed:true});
    assert.deepEqual(errors,[]);
    const report={date:new Date().toISOString(),browser:browser.version(),checks,errors,passed:true};
    fs.writeFileSync(path.join(out,'threejs-continuity-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  } catch(error) { await page.screenshot({path:path.join(out,'threejs-continuity-failure.png')}); throw error; }
  finally { await context.close(); await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(process.exitCode||0),50));
