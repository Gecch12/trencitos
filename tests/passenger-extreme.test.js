'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('six Extreme crowds have 90 faceless people, double windows and exterior hangers',async()=>{
  const {PASSENGER_EXTREME,EXTREME_VARIANTS,extremePeople,passengerExtremeParts}=await import('../experiments/passenger-extreme/passenger-extreme-model.mjs');
  const {WAGON_STYLES,wagonStyle}=await import('../experiments/passenger-extreme/wagon-models.mjs');
  const {Quaternion}=await import('three');
  assert.ok(!WAGON_STYLES.some(s=>s.model===PASSENGER_EXTREME.model));
  assert.equal(wagonStyle('#d45748',{model:PASSENGER_EXTREME.model}).model,'passenger');
  assert.equal(EXTREME_VARIANTS.length,6);
  const skylines=new Set();
  for(const variant of EXTREME_VARIANTS){
    const people=extremePeople(variant.id),parts=passengerExtremeParts({variant:variant.id});
    const roof=people.filter(p=>p.zone==='roof');
    assert.equal(people.length,90);assert.equal(roof.length,60);
    assert.equal(roof.filter(p=>p.stance==='standing').length,14);
    assert.equal(roof.filter(p=>p.stance==='seated').length,38);
    assert.equal(roof.filter(p=>p.stance==='crouching').length,8);
    assert.ok(roof.every(p=>p.scale>=.85),'crowd density never comes from shrinking the people');
    skylines.add(JSON.stringify(roof.map(p=>[p.origin,p.yaw,p.stance])));
    for(const side of [-1,1]){
      const windows=people.filter(p=>p.zone==='windows'&&p.side===side);
      assert.equal(windows.length,8);
      assert.deepEqual([...new Set(windows.map(p=>p.window))],[0,1,2,3,4]);
      assert.equal([0,1,2,3,4].filter(i=>windows.filter(p=>p.window===i).length===2).length,3);
      const hangers=people.filter(p=>p.zone==='exterior'&&p.side===side);
      assert.equal(hangers.length,4);assert.ok(hangers.every(p=>p.stance==='hanging'&&Math.abs(p.origin[1])>4.4));
      for(const end of [-1,1]){
        const count=people.filter(p=>p.zone==='door'&&p.side===side&&p.end===end).length;
        assert.ok(count>=1&&count<=2);
      }
    }
    assert.ok(people.some(p=>p.pose==='hold-one'));assert.ok(people.some(p=>p.pose==='hold-two'));
    for(const outfit of ['linen','open-shirt','poncho','kaftan','blouse','overalls'])assert.ok(people.some(p=>p.outfit===outfit));
    const heads=parts.filter(p=>p.role==='head');assert.equal(heads.length,90);
    assert.ok(new Set(heads.map(p=>p.color)).size>=5);assert.ok(new Set(people.map(p=>p.hair)).size>=5);
    assert.deepEqual(parts,passengerExtremeParts({variant:variant.id}),'redraw does not reroll people');
    for(const p of parts){
      assert.ok(!/eyes|nose|mouth/.test(p.shape));assert.ok(p.xyz.every(Number.isFinite));
      assert.ok(p.size.every(n=>Number.isFinite(n)&&n>0));
      assert.ok(Math.abs(new Quaternion(...(p.rotation||[0,0,0,1])).length()-1)<1e-9);
    }
    const low=passengerExtremeParts({variant:variant.id,detail:'low'});
    assert.deepEqual(low.filter(p=>p.role==='head'),heads,'LOD keeps all people and their placement');
    assert.ok(low.length<parts.length,'far view removes small garment details');
  }
  assert.equal(skylines.size,6,'composition changes, not only clothes');
});

test('routes exhaust six different variants before drawing another shuffled bag',async()=>{
  const {extremeRouteVariants}=await import('../experiments/passenger-extreme/passenger-extreme-model.mjs');
  const result=extremeRouteVariants('room:owner:stockholm-petrograd',30);
  for(let i=0;i<30;i+=6){
    assert.equal(new Set(result.slice(i,i+6)).size,6);
    if(i)assert.notEqual(result[i],result[i-1]);
  }
  assert.deepEqual(result.slice(0,8),extremeRouteVariants('room:owner:stockholm-petrograd',8));
  assert.notDeepEqual(result,extremeRouteVariants('another-route',30));
  assert.deepEqual(extremeRouteVariants('empty',0),[]);
  assert.throws(()=>extremeRouteVariants('bad',-1),RangeError);
});

test('Hippie hair, beards and white garments stay visible in every crowd and LOD',async()=>{
  const {EXTREME_VARIANTS,EXTREME_HAIRSTYLES,HIPPIE_LONG_HAIR,HIPPIE_WHITES,EXTREME_CLOTH_PALETTE,
    extremePeople,extremeHeadParts,passengerExtremeParts,extremeBodyParts,PASSENGER_EXTREME}=await import('../experiments/passenger-extreme/passenger-extreme-model.mjs');
  assert.equal(EXTREME_HAIRSTYLES.length,12);
  assert.equal(PASSENGER_EXTREME.color,'#ffffff');
  assert.ok(extremeBodyParts().filter(p=>p.role==='roof-terrace').every(p=>p.color==='paint'));
  const styles=EXTREME_HAIRSTYLES.map(s=>s.id).sort(),outfits=new Map(styles.map(s=>[s,new Set()]));
  for(const variant of EXTREME_VARIANTS){
    const people=extremePeople(variant.id),parts=passengerExtremeParts({variant:variant.id});
    assert.deepEqual([...new Set(people.map(p=>p.hairstyle))].sort(),styles);
    assert.ok(people.filter(p=>HIPPIE_LONG_HAIR.includes(p.hairstyle)).length>=65,'long hair dominates');
    assert.ok(people.filter(p=>p.beard!=='none').length>=45,'many visibly bearded people');
    assert.deepEqual([...new Set(people.map(p=>p.beard))].sort(),['long','medium','none','short']);
    assert.ok(!people.some(p=>['police','military','habit','veil'].includes(p.outfit)));
    assert.equal(new Set(people.map(p=>p.family)).size,6);
    for(const p of people){
      outfits.get(p.hairstyle).add(p.outfit);
      const head=extremeHeadParts(p);
      assert.equal(head.filter(h=>h.role==='head').length,1);
      if(p.hairstyle==='bald')assert.equal(head.filter(h=>h.role==='hair').length,0);
      else assert.equal(head.find(h=>h.role==='hair').shape,'ext-hair-'+p.hairstyle);
      assert.equal(head.filter(h=>h.role==='beard').length,p.beard==='none'?0:1);
      assert.ok(head.filter(h=>h.role==='beard').every(h=>h.color===p.hair));
      assert.ok(HIPPIE_WHITES.includes(p.clothes)||HIPPIE_WHITES.includes(p.trousers));
      if(p.zone==='windows')assert.ok(HIPPIE_WHITES.includes(p.clothes),'white must be visible above the window sill');
      const main=parts.filter(q=>q.person===p.id&&['clothes','poncho','shirt-hem','short','trouser-upper','trouser-lower'].includes(q.role));
      assert.ok(main.some(q=>HIPPIE_WHITES.includes(q.color)),'each rendered person has a major white garment');
      const allowed=[...HIPPIE_WHITES,...EXTREME_CLOTH_PALETTE[p.family]];
      assert.ok(main.every(q=>allowed.includes(q.color)),'one coordinated pastel family per person');
      if(p.stance!=='window')assert.ok(main.some(q=>q.role==='shirt-hem'),'untucked tops survive far detail');
    }
    const low=passengerExtremeParts({variant:variant.id,detail:'low'});
    const roles=['head','hair','beard','cover','headband','clothes','shirt-hem','sleeve','trouser-lower','poncho','shawl','outer-shirt'];
    assert.deepEqual(low.filter(p=>roles.includes(p.role)),parts.filter(p=>roles.includes(p.role)),'far detail retains identity, white clothing and loose silhouettes');
  }
  for(const [style,choices] of outfits)assert.ok(choices.size>=3,style+' is not tied to one outfit');
});

test('stepped roof supports interior feet; cloth has volume and shorts leave thin bare legs',async()=>{
  const {EXTREME_VARIANTS,extremePeople,extremeBodyParts,passengerExtremeParts,extremeRoofHeight}=await import('../experiments/passenger-extreme/passenger-extreme-model.mjs');
  const body=extremeBodyParts();
  assert.ok(!body.some(p=>p.shape==='roof'),'the old curved shell is removed');
  const heights=[-3.06,-1.53,0,1.53,3.06].map(y=>extremeRoofHeight(0,y));
  assert.ok(heights[0]<heights[1]&&heights[1]<heights[2]);
  assert.equal(heights[0],heights[4]);assert.equal(heights[1],heights[3]);
  assert.ok(heights[2]-heights[0]<1,'shallow terraces retain a low roof');
  for(const variant of EXTREME_VARIANTS){
    const people=extremePeople(variant.id),parts=passengerExtremeParts({variant:variant.id});
    const feet=parts.filter(p=>p.role==='shoe'&&p.zone==='roof'&&(!people[p.person].outer||people[p.person].stance==='standing'));
    for(const foot of feet){
      const surface=extremeRoofHeight(foot.xyz[0],foot.xyz[1]);
      assert.ok(surface!==null,'inner feet stay on the roof');
      assert.ok(Math.abs(foot.xyz[2]-foot.size[2]/2-surface)<.02,'soles touch their terrace');
    }
    // Intersections between people are intentionally accepted for the dense silhouette.
    for(const person of people.filter(p=>p.stance!=='window')){
      const clothing=parts.filter(p=>p.person===person.id);
      const shorts=clothing.filter(p=>p.role==='short');
      if(person.shorts){
        assert.equal(shorts.length,2);
        const skin=clothing.filter(p=>p.role==='bare-leg');assert.equal(skin.length,4);
        assert.ok(skin.every(p=>p.color===person.skin));
        assert.ok(shorts.every(p=>p.size[0]>skin[0].size[0]*2),'shorts are wide cloth, not thin coloured limbs');
      }else{
        const upper=clothing.filter(p=>p.role==='trouser-upper'),lower=clothing.filter(p=>p.role==='trouser-lower');
        assert.equal(upper.length,2);assert.equal(lower.length,2);
        assert.ok(upper.every(p=>p.size[0]/person.scale>=.8));
        assert.ok(lower.every(p=>p.size[0]/person.scale>=.69));
      }
    }
  }
});
