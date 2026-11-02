import * as THREE from './vendor/three.module.js';
import { WAGON_STYLES, wagonParts, wagonStyle } from './wagon-models.mjs';

// Share batches across colors and models. No mesh per wagon, no perpetual animation.
export function createWagonRenderer({ renderer, instances, put, capacity = 300 }) {
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
  shapes['mushroom-cap'] = new THREE.SphereGeometry(.5,16,8,0,Math.PI*2,0,Math.PI/2)
    .rotateX(Math.PI/2).scale(1,1,2).translate(0,0,-.5);
  shapes.crystal = latheStrips([[[0,-.5],[.5,-.5],[.5,.12],[0,.5]]],6).rotateX(Math.PI/2);
  shapes.crystal.computeVertexNormals();
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
    metal: new THREE.MeshStandardMaterial({ roughness: .38, metalness: .65, envMap: environment.texture, envMapIntensity: .65 }),
    steel: new THREE.MeshStandardMaterial({ roughness: .48, metalness: .85, envMap: environment.texture, envMapIntensity: .8 }),
    glass: new THREE.MeshStandardMaterial({ roughness: .18, metalness: .25, envMap: environment.texture, envMapIntensity: .5 }),
    gold: new THREE.MeshStandardMaterial({ roughness: .24, metalness: 1, envMap: environment.texture, envMapIntensity: 1.1 }),
  };
  const templates = new Map(WAGON_STYLES.map(s => [s.model, wagonParts(s.model)]));
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
    const color = new THREE.Color(role === 'paint' ? (gold ? '#eec454' : style.color) : role === 'trim' ? (gold ? '#ffe6a0' : style.color) : role);
    if (role === 'trim' && !gold) color.lerp(new THREE.Color('#ecedd9'), .28);
    if (faded === 'dim') color.multiplyScalar(.28);
    else if (faded) color.lerp(muted, .72);
    colors.set(key, color); return color;
  }
  function draw(cell, player, faded) {
    const style = wagonStyle(player.color, player.wagon);
    const a = cell.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    for (const part of templates.get(style.model)) {
      const material = part.material === 'paint' && style.finish === 'gold' ? 'gold' : part.material;
      const [x, y, z] = part.xyz;
      put(batches.get(`${part.shape}:${material}`), cell.x + x * cos - y * sin, cell.y + x * sin + y * cos, z, cell.angle, ...part.size, paintFor(style, part.color, faded));
    }
    return { model: style.model };
  }
  return { draw, dispose() { environment.dispose(); Object.values(shapes).forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); } };
}
