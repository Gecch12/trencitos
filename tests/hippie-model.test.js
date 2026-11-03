'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('Midsommar replaces the white family with six comfortable, faceless compositions',async()=>{
  const {HIPPIE_TRAIN,HIPPIE_VARIANTS,hippiePeople,hippieCrowdParts}=await import('../hippie-model.mjs');
  const {WAGON_STYLES,wagonStyle}=await import('../wagon-models.mjs');
  const {Quaternion}=await import('three');
  assert.deepEqual(WAGON_STYLES.find(s=>s.color==='#ffffff'),{color:'#ffffff',model:'hippie',label:'Midsommar Express',finish:'paint'});
  assert.equal(wagonStyle('#ffffff').model,HIPPIE_TRAIN.model,'existing white ownership stays compatible');
  assert.equal(HIPPIE_VARIANTS.length,6);
  const scenes=new Set();
  for(const {id} of HIPPIE_VARIANTS){
    const people=hippiePeople(id),parts=hippieCrowdParts({variant:id});
    assert.equal(people.length,22);
    for(const [zone,count] of Object.entries(HIPPIE_TRAIN.people))assert.equal(people.filter(p=>p.zone===zone).length,count);
    const roof=people.filter(p=>p.zone==='roof');
    assert.ok(roof.every(p=>['seated','standing'].includes(p.stance)&&p.scale>=.9));
    assert.equal(roof.filter(p=>p.stance==='standing').length,['diagonal','gathering'].includes(id)?2:0);
    for(let i=0;i<roof.length;i++)for(let j=i+1;j<roof.length;j++){
      assert.ok(Math.hypot(roof[i].origin[0]-roof[j].origin[0],roof[i].origin[1]-roof[j].origin[1])>=2.5,'roof groups have breathing room');
    }
    for(const side of [-1,1]){
      const windows=people.filter(p=>p.zone==='windows'&&p.side===side);
      assert.deepEqual(windows.map(p=>p.window),[0,1,2,3,4],'one person per window');
    }
    assert.ok(people.every(p=>!['hanging','crouching'].includes(p.stance)));
    const heads=parts.filter(p=>p.role==='head');assert.equal(heads.length,22);
    assert.ok(new Set(heads.map(p=>p.color)).size>=5);assert.ok(new Set(people.map(p=>p.hair)).size>=5);
    scenes.add(JSON.stringify(people.map(p=>[p.origin,p.pose,p.yaw])));
    assert.deepEqual(parts,hippieCrowdParts({variant:id}),'redraw does not reroll the scene');
    for(const p of parts){
      assert.ok(!/eyes|nose|mouth/.test(p.shape));assert.ok(p.xyz.every(Number.isFinite));
      assert.ok(p.size.every(n=>Number.isFinite(n)&&n>0));
      assert.ok(Math.abs(new Quaternion(...p.rotation).length()-1)<1e-9);
    }
    const low=hippieCrowdParts({variant:id,detail:'low'});
    assert.deepEqual(low.filter(p=>p.role==='head'),heads,'board LOD preserves all travellers');
    assert.ok(low.length<parts.length);
  }
  assert.equal(scenes.size,6);
});

test('routes exhaust six different variants before drawing another shuffled bag',async()=>{
  const {wagonRouteAppearances}=await import('../wagon-models.mjs');
  const variants=(key,n)=>wagonRouteAppearances('hippie',key,n).map(p=>p.variant);
  const result=variants('room:owner:stockholm-petrograd',30);
  for(let i=0;i<30;i+=6){
    assert.equal(new Set(result.slice(i,i+6)).size,6);
    if(i)assert.notEqual(result[i],result[i-1]);
  }
  assert.deepEqual(result.slice(0,8),variants('room:owner:stockholm-petrograd',8));
  assert.notDeepEqual(result,variants('another-route',30));
  assert.deepEqual(variants('empty',0),[]);
  assert.throws(()=>variants('bad',-1),RangeError);
});

test('folk clothing, hats and uncovered heads retain their silhouettes in both LODs',async()=>{
  const {HIPPIE_VARIANTS,HIPPIE_WHITES,HIPPIE_CLOTH_PALETTE,hippiePeople,hippieHeadParts,hippieCrowdParts}=await import('../hippie-model.mjs');
  const roles=['head','hair','beard','cover','blouse','waistcoat','sleeve','skirt','skirt-hem','apron','breeches','stocking'];
  for(const {id} of HIPPIE_VARIANTS){
    const people=hippiePeople(id),parts=hippieCrowdParts({variant:id});
    assert.ok(people.some(p=>p.skirt)&&people.some(p=>!p.skirt));
    assert.ok(people.some(p=>p.cover==='kerchief')&&people.some(p=>p.cover==='felt-hat'));
    assert.ok(people.some(p=>!p.cover));assert.ok(people.some(p=>p.beard==='none'));
    for(const p of people){
      const head=hippieHeadParts(p);
      assert.equal(head.filter(h=>h.role==='head').length,1);
      assert.equal(head.filter(h=>h.role==='hair').length,p.hairstyle==='bald'?0:1);
      assert.equal(head.filter(h=>h.role==='beard').length,p.beard==='none'?0:1);
      assert.ok(head.filter(h=>h.role==='beard').every(h=>h.color===p.hair));
      const clothes=parts.filter(q=>q.person===p.id);
      assert.ok(clothes.some(q=>q.role==='blouse'&&HIPPIE_WHITES.includes(q.color)),'white garment is visible, even in windows');
      assert.equal(clothes.filter(q=>q.role==='sleeve').length,4,'full sleeves on both arms');
      if(p.stance!=='window'){
        if(p.skirt)assert.ok(clothes.some(q=>q.role==='skirt')&&clothes.some(q=>q.role==='skirt-hem'));
        else assert.ok(clothes.some(q=>q.role==='breeches'&&HIPPIE_CLOTH_PALETTE.mustard.includes(q.color)));
        assert.equal(clothes.filter(q=>q.role==='shoe').length,2);
      }
    }
    const low=hippieCrowdParts({variant:id,detail:'low'});
    assert.deepEqual(low.filter(p=>roles.includes(p.role)),parts.filter(p=>roles.includes(p.role)));
  }
});

test('benches support relaxed travellers; decoration preserves the white body and open windows',async()=>{
  const {HIPPIE_VARIANTS,hippiePeople,hippieCrowdParts,hippieRoofHeight,midsommarDecorations}=await import('../hippie-model.mjs');
  const {wagonParts}=await import('../wagon-models.mjs');
  const body=wagonParts('hippie'),scenes=new Set();
  assert.ok(body.some(p=>p.shape==='round'&&p.color==='paint'));
  assert.ok(body.filter(p=>p.role==='roof-terrace').every(p=>p.color==='paint'));
  assert.equal(hippieRoofHeight(0,-3),hippieRoofHeight(0,3),'flat terrace');
  for(const {id} of HIPPIE_VARIANTS){
    const parts=hippieCrowdParts({variant:id}),people=hippiePeople(id),decor=midsommarDecorations(id);
    scenes.add(JSON.stringify(decor));
    for(const person of people.filter(p=>p.zone==='roof')){
      const bench=decor.some(p=>p.role==='bench-seat'&&p.xyz[0]===person.origin[0]&&p.xyz[1]===person.origin[1]);
      assert.equal(bench,person.stance==='seated','seats follow the actors; standing people have a clear floor');
    }
    for(const foot of parts.filter(p=>p.role==='shoe')){
      const surface=foot.zone==='roof'?8.24:3.05;
      assert.ok(Math.abs(foot.xyz[2]-foot.size[2]/2-surface)<.001,'feet rest on the deck or footboard');
      if(foot.zone==='roof')assert.ok(hippieRoofHeight(foot.xyz[0],foot.xyz[1])!==null);
    }
    for(const role of ['bench-seat','wreath','garland-leaf','ribbon','flower','painted-panel'])assert.ok(decor.some(p=>p.role===role),role);
    assert.ok(decor.filter(p=>p.role.startsWith('garland')).every(p=>p.xyz[2]>8),'garlands stay above the windows');
    for(const leaf of decor.filter(p=>p.role==='window-leaf')){
      assert.ok([-6.4,-3.2,0,3.2,6.4].every(x=>Math.abs(leaf.xyz[0]-x)>1.05),'greenery frames the opening');
    }
  }
  assert.equal(scenes.size,6,'each carriage has its own decoration');
});

test('six festival stories retain their recognisable props in board detail and hands actually meet',async()=>{
  const {hippieCrowdParts,hippiePeople}=await import('../hippie-model.mjs');
  const essential={
    picnic:['cake','strawberry','held-plate','cake-slice','cup'],
    plaza:['accordion-bellows','accordion-key','violin-body','violin-bow'],
    towers:['maypole-base','maypole','maypole-crossbar','maypole-ring','maypole-hanger'],
    diagonal:['dance-floor'],
    balcony:['woven-crown','held-crown','table-wreath','loose-stem'],
    gathering:['arch-base','arch-column','arch-crown','bouquet-stem','bouquet-tie'],
  };
  for(const [variant,roles] of Object.entries(essential))for(const detail of ['high','low']){
    const parts=hippieCrowdParts({variant,detail});
    for(const role of roles)assert.ok(parts.some(p=>p.role===role),variant+'/'+detail+'/'+role);
    if(variant==='towers'){
      const rings=parts.filter(p=>p.role==='maypole-ring');assert.equal(rings.length,2);
      assert.ok(rings.every(p=>p.shape==='mid-wreath'&&p.size[0]>2),'open torus rings, not filled spheres');
      assert.ok(rings[1].xyz[0]-rings[0].xyz[0]>rings[0].size[0]+.7,'two distinct rings with air between them');
    }
  }
  const dancers=hippiePeople('diagonal').filter(p=>p.activity==='dance'),parts=hippieCrowdParts({variant:'diagonal'});
  assert.equal(dancers.length,2);assert.equal(dancers.filter(p=>p.skirt).length,1);
  const hands=dancers.map(p=>parts.filter(q=>q.person===p.id&&q.role==='hand').map(q=>q.xyz));
  for(const a of hands[0])assert.ok(hands[1].some(b=>Math.hypot(...a.map((n,i)=>n-b[i]))<1e-9),'joined hands have the same world-space contact');
  assert.ok(parts.some(p=>p.shape==='mid-dancing-skirt'),'a skirt shaped for the turn');
  const musicians=hippiePeople('plaza').filter(p=>['accordion','violin'].includes(p.activity));
  assert.equal(musicians.length,2);
  for(const p of musicians)assert.ok(hippieCrowdParts({variant:'plaza'}).some(q=>q.person===p.id&&q.role=== (p.activity==='accordion'?'accordion-bellows':'violin-body')),'instruments follow their players');
});
