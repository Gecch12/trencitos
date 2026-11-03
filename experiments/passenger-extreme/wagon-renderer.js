import * as THREE from '/vendor/three.module.js';
import { WAGON_STYLES, PASSENGER_VARIANTS, PASSENGER_CAST_COUNT, wagonAppearance, wagonParts, wagonStyle } from './wagon-models.mjs';

// Immutable part templates are shared by all preview and board renderers.
let sharedTemplates;
function getTemplates() {
  if (!sharedTemplates) {
    sharedTemplates = new Map(WAGON_STYLES.map(s=>[s.model,wagonParts(s.model)]));
    for (const variant of PASSENGER_VARIANTS) for (let cast=0;cast<PASSENGER_CAST_COUNT;cast++) {
      sharedTemplates.set(`passenger:${variant}:${cast}`,wagonParts('passenger',{variant,cast}));
    }
  }
  return sharedTemplates;
}

// Share batches across colors and models. No mesh per wagon, no perpetual animation.
export function createWagonRenderer({ renderer, instances, put, capacity = 300, additionalModels = [] }) {
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    wheel: new THREE.CylinderGeometry(.5, .5, 1, 10),
    tank: new THREE.CylinderGeometry(.5, .5, 1, 12).rotateZ(Math.PI / 2),
    disc: new THREE.CylinderGeometry(.5, .5, 1, 12).rotateX(Math.PI / 2),
    rock: new THREE.IcosahedronGeometry(.5, 0),
    mound: new THREE.SphereGeometry(.5, 12, 6),
  };
  const rounded = new THREE.Shape();
  rounded.moveTo(-.42, -.42); rounded.lineTo(.42, -.42); rounded.lineTo(.42, .42); rounded.lineTo(-.42, .42); rounded.closePath();
  shapes.round = new THREE.ExtrudeGeometry(rounded, { depth: .84, bevelEnabled: true, bevelSize: .08, bevelThickness: .08, bevelSegments: 1, steps: 1 }).translate(0, 0, -.42);
  const arch = new THREE.Shape();
  arch.moveTo(-.5, 0); arch.lineTo(.5, 0); arch.absellipse(0, 0, .5, 1, 0, Math.PI, false); arch.closePath();
  shapes.roof = new THREE.ExtrudeGeometry(arch, { depth: 1, steps: 1, bevelEnabled: false, curveSegments: 6 });
  // Original x/y/z = width/height/length -> length/width/height.
  shapes.roof.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));

  function profilePrism(points) {
    const profile = new THREE.Shape();
    points.forEach(([x, z], i) => i ? profile.lineTo(x, z) : profile.moveTo(x, z)); profile.closePath();
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false, steps: 1 });
    geometry.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, .5, 0, 1, 0, 0, 0, 0, 0, 1));
    return geometry;
  }
  shapes['car-body'] = profilePrism([[-.5,-.5],[.5,-.5],[.48,.05],[.28,.35],[-.27,.5],[-.49,.2]]);
  shapes.canopy = profilePrism([[-.5,-.5],[.5,-.5],[.22,.42],[-.22,.5],[-.44,.03]]);
  shapes.cradle = profilePrism([[-.5,-.5],[.5,-.5],[.5,.5],[.34,.5],[0,-.28],[-.34,.5],[-.5,.5]]);
  shapes['hopper-rib'] = profilePrism([[-.5,.5],[-.32,-.5],[.32,-.5],[.5,.5],[.46,.5],[.28,-.43],[-.28,-.43],[-.46,.5]]).rotateZ(Math.PI / 2);
  const flap = [[-.5,.5],[0,-.12],[.5,.5],[.5,.31],[0,-.32],[-.5,.31]];
  shapes['envelope-flap'] = profilePrism(flap);
  shapes['envelope-top'] = profilePrism(flap).rotateX(Math.PI / 2);
  shapes['stone-vein'] = profilePrism([[-.5,.05],[-.25,.12],[-.09,-.03],[.14,.02],[.35,-.1],[.5,-.03],[.5,-.06],[.34,-.13],[.13,-.01],[-.08,-.06],[-.26,.09],[-.5,.02]]);

  // A hollow tapered hopper, including its inside walls and narrow top rim.
  const ring = (x, y, z) => [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
  const bottom = ring(.38,.32,-.5), top = ring(.5,.5,.5);
  const innerTop = ring(.46,.45,.5), innerBottom = ring(.34,.27,-.4);
  const hopper = [];
  function quad(a, b, c, d) { hopper.push(...a,...b,...c,...a,...c,...d); }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(bottom[i],bottom[j],top[j],top[i]);
    quad(innerTop[i],innerTop[j],innerBottom[j],innerBottom[i]);
    quad(top[i],top[j],innerTop[j],innerTop[i]);
  }
  quad(...innerBottom); quad(...[...bottom].reverse());
  shapes.hopper = new THREE.BufferGeometry();
  shapes.hopper.setAttribute('position', new THREE.Float32BufferAttribute(hopper, 3));
  shapes.hopper.computeVertexNormals();

  // Chamfered quarry blocks retain broad flat faces, unlike the coal shards.
  const block = new THREE.Shape();
  for (const [i, [x,y]] of [[-.43,-.5],[.42,-.5],[.5,-.38],[.5,.43],[.4,.5],[-.45,.5],[-.5,.35],[-.5,-.4]].entries()) {
    if (i) block.lineTo(x * .9,y * .9); else block.moveTo(x * .9,y * .9);
  }
  block.closePath();
  shapes['quarry-block'] = new THREE.ExtrudeGeometry(block, { depth: .9, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 1, steps: 1 }).translate(0,0,-.45);

  // Sheet steel rolls: straight cylindrical outside, flat ends and an open bore.
  // Separate lathe strips preserve hard edges between the end faces and barrel.
  function latheStrips(profiles, segments = 32) {
    const positions = [], normals = [];
    for (const profile of profiles) {
      const source = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), segments);
      const geometry = source.toNonIndexed();
      positions.push(...geometry.attributes.position.array); normals.push(...geometry.attributes.normal.array);
      geometry.dispose(); source.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
  }
  shapes.coil = latheStrips([
    [[.18,-.5],[.48,-.5]], [[.48,-.5],[.5,-.48],[.5,.48],[.48,.5]],
    [[.48,.5],[.18,.5]], [[.18,.5],[.18,-.5]],
  ]);
  shapes['coil-rings'] = latheStrips([.25,.33,.41,.47].flatMap(r => [
    [[r,-.5],[r + .006,-.5]], [[r + .006,.5],[r,.5]],
  ]));
  shapes['coil-band'] = latheStrips([[[.5,-.045],[.5,.045]]]);

  // Small cargo details are combined into reusable geometry, never meshes per detail.
  function combine(geometries) {
    const positions = [], normals = [];
    for (const source of geometries) {
      const g = source.index ? source.toNonIndexed() : source;
      positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array);
      if (g !== source) g.dispose(); source.dispose();
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return result;
  }
  // Inclined and tapered in its own geometry, so the shared route transform stays flat.
  shapes.boom = profilePrism([[-.5,-.5],[.5,.25],[.5,.5],[-.5,-.08]]).rotateZ(Math.PI);
  shapes.hook = profilePrism([[-.12,.5],[.16,.5],[.16,-.05],[.38,-.05],[.48,-.28],[.28,-.5],[-.2,-.5],[-.48,-.22],[-.4,.04],[-.19,-.1],[-.2,-.26],[.16,-.28],[.22,-.2],[-.12,-.17]]);
  const barrelProfile = [[0,-.5],[.39,-.5],[.46,-.3],[.5,0],[.46,.3],[.39,.5],[0,.5]];
  shapes.barrel = latheStrips([barrelProfile], 16).rotateZ(Math.PI / 2);
  shapes['barrel-hoop'] = new THREE.CylinderGeometry(.5,.5,1,32,1,true).rotateZ(Math.PI/2);
  shapes['barrel-staves'] = combine(Array.from({ length: 16 }, (_, i) => {
    const geometry = new THREE.LatheGeometry(barrelProfile.slice(1,-1).map(p => new THREE.Vector2(p[0]+.001,p[1])), 1, i*Math.PI/8, .016);
    return geometry.rotateZ(Math.PI/2);
  }));
  shapes.tire = combine([
    new THREE.CylinderGeometry(.46,.46,.9,12),
    ...Array.from({length:12}, (_, i) => new THREE.BoxGeometry(.18,1,.1).translate(0,0,.45).rotateY(i*Math.PI/6)),
  ]);
  shapes.crate = combine([
    new THREE.BoxGeometry(1,1,.1).translate(0,0,-.45),
    ...[-.46,.46].map(x=>new THREE.BoxGeometry(.08,1,1).translate(x,0,0)),
    ...[-.46,.46].map(y=>new THREE.BoxGeometry(1,.08,1).translate(0,y,0)),
  ]);
  shapes['silo-cone'] = new THREE.CylinderGeometry(.5,.16,1,16).rotateX(Math.PI/2);
  shapes.pot = new THREE.CylinderGeometry(.5,.32,1,10).rotateX(Math.PI/2);
  shapes.flower = combine(Array.from({length:6}, (_,i) => {
    const a = i*Math.PI/3;
    return new THREE.SphereGeometry(1,8,4).scale(.23,.23,.45).translate(.27*Math.cos(a),.27*Math.sin(a),0);
  }));
  shapes['person-head'] = new THREE.SphereGeometry(.5,24,16);
  // Soft shoulders and a narrower waist, instead of a beveled rectangular block.
  const torsoProfile = [[0,-.5],[.32,-.5],[.36,-.43],[.39,-.1],[.5,.18],[.48,.3],[.39,.43],[.23,.5],[0,.5]];
  shapes['person-torso'] = latheStrips([torsoProfile],20).rotateX(Math.PI/2);
  const hairCap = () => new THREE.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2);
  function normalized(geometry) {
    geometry.computeBoundingBox();
    const center=geometry.boundingBox.getCenter(new THREE.Vector3()),size=geometry.boundingBox.getSize(new THREE.Vector3());
    geometry.translate(-center.x,-center.y,-center.z);geometry.scale(1/size.x,1/size.y,1/size.z);return geometry;
  }
  shapes['person-limb'] = normalized(new THREE.CapsuleGeometry(.5,1,4,8).rotateX(Math.PI/2));
  const hairShapes = {
    short: hairCap(),
    bob: combine([hairCap(),new THREE.SphereGeometry(.5,16,8).scale(1,.55,1.2).translate(0,.25,-.18)]),
    curly: combine([hairCap(),...Array.from({length:7},(_,i)=>{
      const a=i*Math.PI*2/7;
      return new THREE.SphereGeometry(.19,10,8).translate(.34*Math.cos(a),.34*Math.sin(a),.22);
    })]),
    bun: combine([hairCap(),new THREE.SphereGeometry(.24,12,10).translate(0,.23,.57)]),
  };
  for (const [style,geometry] of Object.entries(hairShapes)) {
    shapes[`hair-${style}`]=normalized(geometry);
    shapes[`hair-${style}-back`]=geometry.clone().rotateZ(Math.PI);
  }
  shapes['shirt-stripes'] = combine([-.28,.28].map(z=>new THREE.BoxGeometry(1,1,.22).translate(0,0,z)));
  shapes['shirt-collar'] = combine([
    profilePrism([[-.5,.5],[-.06,.28],[-.22,-.18],[-.5,.13]]),
    profilePrism([[.5,.5],[.06,.28],[.22,-.18],[.5,.13]]),
  ]);
  shapes['shirt-vest'] = combine([-.34,.34].map(x=>profilePrism([[-.15,-.5],[.15,-.5],[.15,.1],[.06,.5],[-.15,.5]]).translate(x,0,0)));
  shapes['shirt-lapels'] = profilePrism([[-.5,.5],[-.17,.5],[0,.02],[.17,.5],[.5,.5],[.24,-.06],[.3,-.5],[-.3,-.5],[-.24,-.06]]);
  // Small subdivided accents follow the curved shirt, including its tilted pose.
  for (const outfit of ['stripes','collar','vest','lapels']) {
    const key=`shirt-${outfit}`, original=shapes[key], source=original.index?original.toNonIndexed():original;
    const positions=source.attributes.position.array, wrapped=[];
    function surface([x,y,z]) {
      x*=.66; z=z*.68+.03;
      const next=torsoProfile.findIndex((p,i)=>i>0&&p[1]>=z), [r0,z0]=torsoProfile[next-1], [r1,z1]=torsoProfile[next];
      const radius=r0+(r1-r0)*(z-z0)/(z1-z0);
      return [x,-Math.sqrt(Math.max(0,radius*radius-x*x))-.016+y*.008,z];
    }
    function subdivide(a,b,c,depth) {
      if (!depth) { wrapped.push(...surface(a),...surface(b),...surface(c)); return; }
      const mid=(a,b)=>a.map((n,i)=>(n+b[i])/2), ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      subdivide(a,ab,ca,depth-1);subdivide(ab,b,bc,depth-1);subdivide(ca,bc,c,depth-1);subdivide(ab,bc,ca,depth-1);
    }
    for(let i=0;i<positions.length;i+=9)subdivide(Array.from(positions.slice(i,i+3)),Array.from(positions.slice(i+3,i+6)),Array.from(positions.slice(i+6,i+9)),2);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(wrapped,3));geometry.computeVertexNormals();
    shapes[key]=geometry;shapes[`${key}-back`]=geometry.clone().rotateZ(Math.PI);
    if(source!==original)source.dispose();original.dispose();
  }
  shapes['window-frame'] = combine([
    ...[-.45,.45].map(x=>new THREE.BoxGeometry(.1,1,1).translate(x,0,0)),
    ...[-.45,.45].map(z=>new THREE.BoxGeometry(.8,1,.1).translate(0,0,z)),
  ]);
  // Repeated carriage details are single shared geometries, not extra meshes per window.
  shapes['coach-window-frames'] = normalized(combine([-1,1].flatMap(side=>[-6.4,-3.2,0,3.2,6.4].map(x=>
    shapes['window-frame'].clone().scale(2.3,.16,2.3).translate(x,side*3.84,0)))));
  shapes['coach-end-panels'] = combine([-1,1].map(end=>new THREE.BoxGeometry(.008,1,1).translate(end*.496,0,0)));
  shapes['coach-door-frames'] = combine([-1,1].flatMap(end=>[
    ...[-.475,.475].map(y=>new THREE.BoxGeometry(.008,.05,1).translate(end*.496,y,0)),
    ...[-.48,.48].map(z=>new THREE.BoxGeometry(.008,.9,.04).translate(end*.496,0,z)),
  ]));
  shapes['coach-handles'] = normalized(combine([-1,1].flatMap(end=>[
    ...[-1.7,1.7].map(y=>new THREE.CylinderGeometry(.07,.07,2.4,8).rotateX(Math.PI/2).translate(end*9.35,y,0)),
    new THREE.BoxGeometry(.2,.45,.12).translate(end*9.35,.75,-.1),
  ])));
  shapes['coach-steps'] = normalized(combine([-1,1].flatMap(end=>[
    new THREE.BoxGeometry(.8,2.9,.22).translate(end*9.4,0,.24),
    new THREE.BoxGeometry(.8,3.5,.22).translate(end*10.1,0,-.24),
  ])));
  shapes['coach-belt'] = combine([-1,1].map(side=>new THREE.BoxGeometry(1,.025,1).translate(0,side*.4875,0)));
  shapes['coach-belt-double'] = combine([-1,1].flatMap(side=>[-.36,.36].map(z=>new THREE.BoxGeometry(1,.025,.28).translate(0,side*.4875,z))));
  shapes['coach-roof-seams'] = normalized(combine([-6.5,0,6.5].map(x=>shapes.roof.clone().scale(.12,7.84,2.13).translate(x,0,0))));
  shapes['coach-vent'] = normalized(combine([
    new THREE.CylinderGeometry(.26,.32,.45,12).rotateX(Math.PI/2).translate(0,0,-.2),
    new THREE.SphereGeometry(.5,12,6,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2),
  ]));
  // Gathered fabric leaves the central view open. Relief folds read without tiny textures.
  function curtain(side) {
    const fabric=new THREE.Shape();
    fabric.moveTo(-.5,-.5);fabric.lineTo(-.19,-.5);
    fabric.bezierCurveTo(-.2,-.32,-.36,-.22,-.34,-.06);
    fabric.bezierCurveTo(-.31,.13,-.06,.31,-.02,.5);
    fabric.lineTo(-.5,.5);fabric.closePath();
    const shape=new THREE.ExtrudeGeometry(fabric,{depth:1,bevelEnabled:false,steps:1,curveSegments:8});
    shape.applyMatrix4(new THREE.Matrix4().set(1,0,0,0,0,0,-1,.5,0,1,0,0,0,0,0,1));
    const positions=shape.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const x=positions.getX(i);
      positions.setY(i,positions.getY(i)*.65+Math.sin((x+.5)*Math.PI*8)*.12);
    }
    shape.computeVertexNormals();if(side===1)shape.rotateZ(Math.PI);return shape;
  }
  shapes['coach-curtain-left']=curtain(-1);
  shapes['coach-curtain-right']=curtain(1);
  shapes['coach-curtain-pair']=combine([
    curtain(-1),curtain(1),new THREE.BoxGeometry(1,.7,.12).translate(0,0,.44),
  ]);
  shapes['coach-curtain-blind']=combine([
    new THREE.BoxGeometry(1,.6,.6).translate(0,0,.2),
    ...[-.08,.09,.26,.43].map(z=>new THREE.BoxGeometry(1,1,.04).translate(0,0,z)),
  ]);
  shapes.star = profilePrism(Array.from({length:10},(_,i)=>{
    const a=Math.PI/2+i*Math.PI/5, r=i%2?.23:.5;
    return [r*Math.cos(a),r*Math.sin(a)];
  }));
  // A pointed hull and a broad stern, unlike the symmetric tanker and road cars.
  const hullOutline = [[-.5,-.42],[.16,-.5],[.35,-.32],[.5,0],[.35,.32],[.16,.5],[-.5,.42]];
  const hull = [], bottomHull = hullOutline.map(([x,y]) => [x*.88,y*.45,-.5]);
  const topHull = hullOutline.map(([x,y]) => [x,y,.5]);
  for (let i=0;i<hullOutline.length;i++) {
    const j=(i+1)%hullOutline.length;
    hull.push(...bottomHull[i],...bottomHull[j],...topHull[j],...bottomHull[i],...topHull[j],...topHull[i]);
  }
  shapes['boat-hull'] = new THREE.BufferGeometry();
  shapes['boat-hull'].setAttribute('position',new THREE.Float32BufferAttribute(hull,3));
  shapes['boat-hull'].computeVertexNormals();
  const deck = new THREE.Shape(hullOutline.map(p=>new THREE.Vector2(...p)));
  shapes['boat-deck'] = new THREE.ExtrudeGeometry(deck,{depth:1,bevelEnabled:false,steps:1}).translate(0,0,-.5);
  shapes.windshield = combine([
    profilePrism([[-.5,-.5],[.5,-.5],[.12,.5],[.01,.5],[.38,-.38],[-.5,-.38]]),
    ...[-.48,.48].map(y=>profilePrism([[-.5,-.5],[.5,-.5],[.12,.5],[-.5,.13]]).scale(1,.04,1).translate(0,y,0)),
  ]);

  // A compact procedural studio provides actual reflections without an HDR download.
  const studio = new THREE.Scene(); studio.background = new THREE.Color('#697d91');
  for (const [position, size, intensity] of [
    [[-5, 2, 7], [5, 7], 4], [[5, -1, 3], [2, 8], 2.8], [[0, 5, 2], [8, 3], 1.5],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity), side: THREE.DoubleSide }));
    panel.position.set(...position); panel.lookAt(0, 0, 0); studio.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .05, .1, 100);
  studio.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); }); pmrem.dispose();
  const materials = {
    paint: new THREE.MeshStandardMaterial({ roughness: .65, metalness: .06 }),
    cargo: new THREE.MeshStandardMaterial({ roughness: .9, metalness: 0, flatShading: true }),
    person: new THREE.MeshStandardMaterial({ roughness: .8, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ roughness: .38, metalness: .65, envMap: environment.texture, envMapIntensity: .65 }),
    steel: new THREE.MeshStandardMaterial({ roughness: .48, metalness: .85, envMap: environment.texture, envMapIntensity: .8 }),
    glass: new THREE.MeshStandardMaterial({ roughness: .18, metalness: .25, envMap: environment.texture, envMapIntensity: .5 }),
    gold: new THREE.MeshStandardMaterial({ roughness: .24, metalness: 1, envMap: environment.texture, envMapIntensity: 1.1 }),
  };
  // Explicit opt-in for isolated model studies; the game's palette stays unchanged.
  const extraTemplates = new Map(additionalModels.map(({model,parts})=>[model,parts]));
  const templates = extraTemplates.size ? new Map([...getTemplates(),...extraTemplates]) : getTemplates();
  for (const [name,geometry] of Object.entries(shapes)) geometry.name=name;
  const batches = new Map();
  // Max occurrences of each primitive in one model, multiplied by the board bound.
  const capacities = new Map();
  for (const parts of templates.values()) {
    const counts = new Map();
    for (const part of parts) {
      const key = `${part.shape}:${part.material}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const [key, count] of counts) capacities.set(key, Math.max(capacities.get(key) || 0, count));
  }
  for (const [key, count] of capacities) {
    const [shape, material] = key.split(':');
    batches.set(key, instances(shapes[shape], count * capacity, materials[material]));
    if (material === 'paint') batches.set(`${shape}:gold`, instances(shapes[shape], count * capacity, materials.gold));
  }
  const muted = new THREE.Color('#bbd6d9');
  const colors = new Map();
  function paintFor(style, role, faded) {
    const key = `${style.color}:${style.finish}:${role}:${faded}`;
    if (colors.has(key)) return colors.get(key);
    const gold = style.finish === 'gold';
    const color = new THREE.Color(role === 'paint' || role === 'shade' ? (gold ? '#eec454' : style.color) : role === 'trim' ? (gold ? '#ffe6a0' : style.color) : role);
    if (role === 'shade') color.multiplyScalar(.58);
    if (role === 'trim' && !gold) color.lerp(new THREE.Color('#ecedd9'), .28);
    if (faded === 'dim') color.multiplyScalar(.28);
    else if (faded) color.lerp(muted, .72);
    colors.set(key, color); return color;
  }
  function draw(cell, player, faded, appearance) {
    const style = wagonStyle(player.color, player.wagon);
    if (extraTemplates.has(player.wagon?.model)) style.model = player.wagon.model;
    appearance ||= wagonAppearance(style.model);
    const template = style.model === 'passenger' ? `passenger:${appearance.variant}:${appearance.cast}` : style.model;
    const a = cell.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    for (const part of templates.get(template)) {
      const material = part.material === 'paint' && style.finish === 'gold' ? 'gold' : part.material;
      const [x, y, z] = part.xyz;
      put(batches.get(`${part.shape}:${material}`), cell.x + x * cos - y * sin, cell.y + x * sin + y * cos, z, cell.angle, ...part.size, paintFor(style, part.color, faded), part.rotation);
    }
    return { model: style.model, ...appearance };
  }
  return { draw, dispose() { environment.dispose(); Object.values(shapes).forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); } };
}
