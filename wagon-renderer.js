import * as THREE from './vendor/three.module.js';
import { WAGON_STYLES, wagonParts, wagonStyle } from './wagon-models.mjs';

// Share batches across colors and models. No mesh per wagon, no perpetual animation.
export function createWagonRenderer({ renderer, instances, put }) {
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    wheel: new THREE.CylinderGeometry(.5, .5, 1, 10),
    tank: new THREE.CylinderGeometry(.5, .5, 1, 12).rotateZ(Math.PI / 2),
    disc: new THREE.CylinderGeometry(.5, .5, 1, 12).rotateX(Math.PI / 2),
    rock: new THREE.IcosahedronGeometry(.5, 0),
    mound: new THREE.SphereGeometry(.5, 12, 6),
    coil: new THREE.TorusGeometry(.34, .16, 6, 12).rotateY(Math.PI / 2).scale(1 / .32, 1, 1),
  };
  const rounded = new THREE.Shape();
  rounded.moveTo(-.42, -.42); rounded.lineTo(.42, -.42); rounded.lineTo(.42, .42); rounded.lineTo(-.42, .42); rounded.closePath();
  shapes.round = new THREE.ExtrudeGeometry(rounded, { depth: .84, bevelEnabled: true, bevelSize: .08, bevelThickness: .08, bevelSegments: 1, steps: 1 }).translate(0, 0, -.42);
  const arch = new THREE.Shape();
  arch.moveTo(-.5, 0); arch.lineTo(.5, 0); arch.absellipse(0, 0, .5, 1, 0, Math.PI, false); arch.closePath();
  shapes.roof = new THREE.ExtrudeGeometry(arch, { depth: 1, steps: 1, bevelEnabled: false, curveSegments: 6 });
  // Original x/y/z = width/height/length -> length/width/height.
  shapes.roof.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));

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
    batches.set(key, instances(shapes[shape], count * 300, materials[material]));
    if (material === 'paint') batches.set(`${shape}:gold`, instances(shapes[shape], count * 300, materials.gold));
  }
  const muted = new THREE.Color('#bbd6d9');
  const colors = new Map();
  function paintFor(style, role, faded) {
    const key = `${style.color}:${style.finish}:${role}:${faded}`;
    if (colors.has(key)) return colors.get(key);
    const gold = style.finish === 'gold';
    const color = new THREE.Color(role === 'paint' ? (gold ? '#eec454' : style.color) : role === 'trim' ? (gold ? '#ffe6a0' : style.color) : role);
    if (role === 'trim' && !gold) color.lerp(new THREE.Color('#ecedd9'), .28);
    if (faded) color.lerp(muted, .72);
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
    // A small, consistent medallion keeps seat identity visible from above.
    const x = cell.x + 6.3 * cos, y = cell.y + 6.3 * sin;
    put(badge, x, y, 10.15, 0, 3.7, 3.7, .22, paintFor(style, 'paint', faded));
    return { model: style.model, mark: { x, y, z: 10.3 } };
  }
  const badge = instances(shapes.disc, 300, materials.paint);
  return { draw, dispose() { environment.dispose(); Object.values(shapes).forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); } };
}
