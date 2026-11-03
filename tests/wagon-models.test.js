'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PLAYER_PALETTE } = require('../shared/data');
const UI = require('../frontend/game-ui');

test('every player color has a wagon, including legacy yellow, without changing paint ownership', async () => {
  const { WAGON_STYLES, wagonStyle } = await import('../frontend/wagon-models.mjs');
  assert.equal(WAGON_STYLES.length, PLAYER_PALETTE.length);
  assert.equal(new Set(WAGON_STYLES.map(s => s.model)).size, PLAYER_PALETTE.length);
  for (const { color, finish = 'paint' } of PLAYER_PALETTE) {
    const style = wagonStyle(color);
    assert.equal(style.model, WAGON_STYLES.find(s => s.color === color).model);
    assert.equal(style.color, UI.playerColor(color));
    assert.equal(style.finish, finish);
    assert.equal(wagonStyle(UI.playerColor(color)).model, style.model);
    const custom = wagonStyle(color, { model: 'tanker', finish: 'paint' });
    assert.deepEqual(custom, { color: UI.playerColor(color), model: 'tanker', finish: 'paint' });
  }
  assert.equal(wagonStyle('#123456').color, '#123456');
  assert.equal(wagonStyle('#123456', { model: 'missing', finish: 'missing' }).model, 'passenger');
});

test('wagon primitives stay within their shared footprint and height budget', async () => {
  const { WAGON_STYLES, wagonParts } = await import('../frontend/wagon-models.mjs');
  const { Vector3, Quaternion } = await import('three');
  const shapes = new Set(['box', 'round', 'wheel', 'tank', 'disc', 'rock', 'mound', 'coil', 'coil-rings', 'coil-band', 'cradle', 'hopper', 'hopper-rib', 'quarry-block', 'stone-vein', 'envelope-flap', 'envelope-top', 'roof', 'car-body', 'canopy', 'boom', 'hook', 'barrel', 'barrel-staves', 'tire', 'silo-cone', 'pot', 'flower', 'boat-hull', 'boat-deck', 'windshield', 'barrel-hoop', 'crate']);
  for (const shape of ['person-head','person-torso','person-limb','window-frame','star',...['stripes','collar','vest','lapels'].flatMap(style=>['shirt-'+style,'shirt-'+style+'-back']),...['short','bob','curly','bun'].flatMap(style=>['hair-'+style,'hair-'+style+'-back'])]) shapes.add(shape);
  for (const shape of ['window-frames','end-panels','door-frames','handles','steps','belt','belt-double','roof-seams','vent','curtain-left','curtain-right','curtain-pair','curtain-blind']) shapes.add('coach-'+shape);
  const { PASSENGER_VARIANTS, PASSENGER_CAST_COUNT } = await import('../frontend/wagon-models.mjs');
  const appearances = WAGON_STYLES.flatMap(({model}) => model === 'passenger'
    ? PASSENGER_VARIANTS.flatMap(variant=>Array.from({length:PASSENGER_CAST_COUNT},(_,cast)=>({model,variant,cast}))) : [{model}]);
  for (const { model, variant, cast } of appearances) {
    const parts = wagonParts(model,{variant,cast});
    assert.ok(parts.length > 10 && parts.length <= 70, model);
    for (const part of parts) {
      assert.ok(shapes.has(part.shape));
      assert.ok(part.size.every(n => n > 0 && Number.isFinite(n)));
      const rotation = new Quaternion(...(part.rotation || [0,0,0,1]));
      assert.ok(Math.abs(rotation.length()-1)<1e-10,'normalized local orientation');
      for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of (part.shape==='roof'?[0,1]:[-.5,.5])) {
        const corner=new Vector3(x,y,z).multiply(new Vector3(...part.size)).applyQuaternion(rotation).add(new Vector3(...part.xyz));
        const label=`${model}/${variant}/${cast}/${part.shape}`;
        assert.ok(Math.abs(corner.x)<=10.7,`${label} length`);
        assert.ok(Math.abs(corner.y)<=4.7,`${label} width ${corner.y}`);
        assert.ok(corner.z>=0,`${label} ground`);
        assert.ok(corner.z<=10.4,`${label} height`);
      }
    }
  }
});

test('all six carriages have distinct decoration without covering occupied windows', async () => {
  const { wagonParts, PASSENGER_VARIANTS } = await import('../frontend/wagon-models.mjs');
  const decorations=new Set(),occupied={classic:[],solo:[0],duo:[-3.2,3.2],trio:[-6.4,0,6.4],lean:[-3.2,3.2],wave:[-3.2,3.2]};
  for(const variant of PASSENGER_VARIANTS) {
    const parts=wagonParts('passenger',{variant,cast:0});
    const details=parts.filter(p=>p.shape.startsWith('coach-'));
    decorations.add(JSON.stringify(details));
    assert.deepEqual(details,wagonParts('passenger',{variant,cast:31}).filter(p=>p.shape.startsWith('coach-')),'carriage identity is independent of passenger clothing');
    assert.ok(parts.some(p=>p.shape==='round'&&p.color==='paint'),'owner paint remains on the body');
    for(const shape of ['coach-door-frames','coach-end-panels','coach-handles','coach-steps','coach-window-frames','coach-roof-seams'])assert.ok(details.some(p=>p.shape===shape),shape);
    assert.ok([2,3].includes(details.filter(p=>p.shape==='coach-vent').length));
    const curtains=details.filter(p=>p.shape.startsWith('coach-curtain-'));
    assert.ok(curtains.some(p=>p.xyz[1]>0)&&curtains.some(p=>p.xyz[1]<0));
    assert.ok(curtains.every(p=>!occupied[variant].includes(p.xyz[0])),'curtains leave the approved poses visible');
  }
  assert.equal(decorations.size,6,'each composition has a different carriage even without its people');
});

test('passengers lean out from inside the window and have bent supporting or waving arms', async () => {
  const { wagonParts } = await import('../frontend/wagon-models.mjs');
  const { Vector3, Quaternion } = await import('three');
  for(const variant of ['solo','duo','trio','lean','wave']) {
    const parts=wagonParts('passenger',{variant,cast:22}),torsos=parts.filter(p=>p.shape==='person-torso');
    for(const torso of torsos) {
      const center=new Vector3(...torso.xyz),q=new Quaternion(...torso.rotation),side=Math.sign(center.y);
      const waist=new Vector3(0,0,-torso.size[2]/2).applyQuaternion(q).add(center);
      const shoulder=new Vector3(0,0,torso.size[2]/2).applyQuaternion(q).add(center);
      assert.ok(Math.abs(waist.y)<3.7,'waist starts inside the carriage');
      assert.ok((shoulder.y-waist.y)*side>.18,'torso leans outward on both sides');
      assert.ok(Math.abs(shoulder.x-waist.x)>.07,'poses include a slight sideways lean');
      const shirt=parts.find(p=>p.shape.startsWith('shirt-')&&p.xyz===torso.xyz);
      assert.deepEqual(shirt.rotation,torso.rotation,'clothes follow the torso');
    }
    const limbs=parts.filter(p=>p.shape==='person-limb');
    assert.equal(limbs.length,['lean','wave'].includes(variant)?8:0);
    for(let i=0;i<limbs.length;i+=2) {
      const upper=limbs[i],lower=limbs[i+1];
      const direction=p=>new Vector3(0,0,1).applyQuaternion(new Quaternion(...p.rotation));
      assert.ok(direction(upper).dot(direction(lower))<.85,'elbow visibly bends');
    }
  }
});

test('retired cargo models disappear while old paints keep their ownership', async () => {
  const { WAGON_STYLES, wagonStyle } = await import('../frontend/wagon-models.mjs');
  assert.equal(WAGON_STYLES.length,21);
  assert.ok(WAGON_STYLES.every(s=>!['mushrooms','crystals','candy'].includes(s.model)));
  assert.equal(wagonStyle('#71bba0',{model:'mushrooms'}).model,'dwelling');
  assert.equal(wagonStyle('#6269c7',{model:'crystals'}).model,'circus');
  assert.deepEqual(wagonStyle('#edadd0',{model:'candy'}),{model:'passenger',color:'#edadd0',finish:'paint'});
});

test('every route exhausts six distinct variants before reshuffling, including long future routes', async () => {
  const { wagonRouteAppearances, PASSENGER_VARIANTS } = await import('../frontend/wagon-models.mjs');
  for (let seed=0;seed<100;seed++) {
    const key=`room-${seed}:2:101`,whole=wagonRouteAppearances('passenger',key,120);
    for (const length of [0,1,4,6,8,12,13,120]) {
      const route=wagonRouteAppearances('passenger',key,length);
      assert.deepEqual(route,whole.slice(0,length),'length never changes an existing prefix');
      for(let start=0;start<length;start+=6) {
        const bag=route.slice(start,start+6).map(a=>a.variant);
        assert.equal(new Set(bag).size,bag.length,'no repeat before exhausting a bag');
        if(bag.length===6)assert.deepEqual(new Set(bag),new Set(PASSENGER_VARIANTS));
        if(start)assert.notEqual(route[start-1].variant,bag[0],'no repeat at bag boundary');
      }
    }
    assert.notDeepEqual(whole,wagonRouteAppearances('passenger',`other-${key}`,120));
  }
});

test('passenger compositions have round faceless heads and independent varied clothes and hair', async () => {
  const { wagonParts, passengerPerson, PASSENGER_CAST_COUNT } = await import('../frontend/wagon-models.mjs');
  const skin=new Set(),hair=new Set(),hairStyles=new Set(),outfits=new Set(),clothes=new Set(),perSkin=new Map();
  for (const [variant,count] of Object.entries({classic:0,solo:2,duo:4,trio:6,lean:4,wave:4})) {
    for(let cast=0;cast<PASSENGER_CAST_COUNT;cast++) {
      const parts=wagonParts('passenger',{variant,cast}),heads=parts.filter(p=>p.shape==='person-head');
      assert.equal(heads.length,count,variant);
      assert.ok(parts.every(p=>!['eyes','nose','mouth'].includes(p.shape)));
      heads.forEach(p=>{assert.deepEqual(p.size,[1.45,1.45,1.45]);assert.equal(p.material,'person');});
    }
  }
  for(let cast=0;cast<PASSENGER_CAST_COUNT;cast++)for(const side of [-1,1])for(let index=0;index<3;index++) {
    const p=passengerPerson(cast,side,index);
    skin.add(p.skin);hair.add(p.hair);hairStyles.add(p.hairstyle);outfits.add(p.outfit);clothes.add(p.clothes);
    if(!perSkin.has(p.skin))perSkin.set(p.skin,{hair:new Set(),clothes:new Set(),styles:new Set()});
    const mixes=perSkin.get(p.skin);mixes.hair.add(p.hair);mixes.clothes.add(p.clothes);mixes.styles.add(p.hairstyle);
    assert.deepEqual(passengerPerson(cast,side,index),p);
  }
  assert.equal(skin.size,8);assert.equal(hair.size,8);assert.equal(clothes.size,12);
  assert.equal(hairStyles.size,4);assert.equal(outfits.size,4);
  for(const mixes of perSkin.values()) {assert.ok(mixes.hair.size>=4);assert.ok(mixes.clothes.size>=4);assert.ok(mixes.styles.size>=3);}
});
