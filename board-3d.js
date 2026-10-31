import * as THREE from './vendor/three.module.js';
import { createWagonRenderer } from './wagon-renderer.js';

// A presentation adapter only. No transport, rule engine or hidden game state.
export function createBoard3D({ container, map, network, onFailure }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor('#bbd6d9');
  renderer.domElement.className = 'board-3d-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.addEventListener('webglcontextlost', lost);
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 5000);
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 1960; textureCanvas.height = 1320;
  const ctx = textureCanvas.getContext('2d');
  ctx.scale(2, 2); ctx.translate(-map.bounds.x, -map.bounds.y);
  ctx.fillStyle = '#bbd6d9'; ctx.fillRect(map.bounds.x, map.bounds.y, map.bounds.width, map.bounds.height);
  for (const d of map.land) {
    const p = new Path2D(d);
    ctx.fillStyle = '#eee6d2'; ctx.strokeStyle = '#a5b3a7'; ctx.lineWidth = 1.1;
    ctx.fill(p); ctx.stroke(p);
  }
  ctx.strokeStyle = '#c2b797'; ctx.lineWidth = .7; ctx.setLineDash([2, 3]);
  for (const d of map.details) ctx.stroke(new Path2D(d));
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  for (const route of network) {
    const path = new Path2D(route.d);
    ctx.strokeStyle = '#f2eddc'; ctx.lineWidth = 12; ctx.stroke(path);
    ctx.strokeStyle = '#a2aaa0'; ctx.lineWidth = .8; ctx.stroke(path);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(map.bounds.width, map.bounds.height), new THREE.MeshBasicMaterial({ map: texture }));
  plane.position.set(map.bounds.x + map.bounds.width / 2, -map.bounds.y - map.bounds.height / 2, -.1);
  scene.add(plane);
  scene.add(new THREE.HemisphereLight(0xfff9e8, 0x365466, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-400, 400, 900); scene.add(sun);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-9, 0); roofShape.lineTo(0, 7); roofShape.lineTo(9, 0); roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: 14, bevelEnabled: false });
  roofGeometry.rotateX(Math.PI / 2); roofGeometry.translate(0, 7, 11);
  const meshes = [], symbolTextures = [];
  function instances(geometry, capacity, material = new THREE.MeshStandardMaterial({ roughness: .55, metalness: .1 })) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); meshes.push(mesh); return mesh;
  }
  const stations = instances(box, 15), stationRoofs = instances(roofGeometry, 15);
  const doors = instances(box, 15);
  const marks = new Map(), dummy = new THREE.Object3D(), color = new THREE.Color();
  function put(mesh, x, y, z, angle, sx, sy, sz, tint) {
    const i = mesh.count++;
    dummy.position.set(x, -y, z); dummy.rotation.set(0, 0, -angle * Math.PI / 180); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(tint));
  }
  const wagons = createWagonRenderer({ renderer, scene, instances, put });
  function markFor(player, index) {
    if (marks.has(index)) return marks.get(index);
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const ink = c.getContext('2d'); ink.translate(32, 16); ink.scale(3, 3);
    const path = new Path2D(player.mark);
    ink.strokeStyle = '#172f3c'; ink.lineWidth = 1.1; ink.stroke(path); ink.fillStyle = '#fff7dd'; ink.fill(path);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; symbolTextures.push(t);
    const m = instances(new THREE.PlaneGeometry(1, 1), 300, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    marks.set(index, m); return m;
  }
  let boardKey = '', pieceCount = 0, stationCount = 0, modelCounts = {};
  function update({ routes, players, hiddenRoute = null, highlight = null }) {
    // The caller deliberately supplies public board fields only (never hands or tickets).
    const key = JSON.stringify({ routes, players, hiddenRoute, highlight });
    if (key === boardKey || disposed) return;
    boardKey = key; pieceCount = stationCount = 0; modelCounts = {};
    for (const mesh of meshes) mesh.count = 0;
    const tint = (hex, owner) => highlight === null || owner === highlight ? hex : new THREE.Color(hex).lerp(new THREE.Color('#bbd6d9'), .72);
    for (const route of routes) {
      if (route.owner === null || route.id === hiddenRoute) continue;
      const player = players[route.owner]; if (!player) continue;
      const mark = markFor(player, route.owner);
      for (const cell of network[route.id].cells) {
        const piece = wagons.draw(cell, player, highlight !== null && route.owner !== highlight);
        put(mark, piece.mark.x, piece.mark.y, piece.mark.z, 0, 7.5, 3.75, 1, tint('#ffffff', route.owner));
        modelCounts[piece.model] = (modelCounts[piece.model] || 0) + 1;
        pieceCount++;
      }
    }
    players.forEach((player, owner) => {
      for (const city of player.placed) {
        const [x, y] = map.cities[city];
        put(stations, x, y, 5.5, 0, 14, 12, 11, tint(player.color, owner));
        put(stationRoofs, x, y, 0, 0, 1, 1, 1, tint(player.color, owner));
        put(doors, x, y + 6.1, 3.8, 0, 4, .3, 7.5, '#fff3d6');
        stationCount++;
      }
    });
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }
  let frame = 0, disposed = false, dimensions = '', draws = 0;
  const samples = [];
  function lost(event) { event.preventDefault(); onFailure(new Error('Se perdió el contexto WebGL.')); }
  function invalidate() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed || document.hidden) return;
      const start = performance.now();
      renderer.render(scene, camera); draws++;
      samples.push(performance.now() - start); if (samples.length > 240) samples.shift();
    });
  }
  function visibility() { if (!document.hidden) invalidate(); }
  document.addEventListener('visibilitychange', visibility);
  function resize(view) {
    if (disposed) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    const size = `${w}:${h}`;
    if (size !== dimensions) { renderer.setSize(w, h, false); dimensions = size; }
    const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
    const tilt = Math.PI / 7;
    camera.left = -view.width / 2; camera.right = view.width / 2;
    camera.top = h * view.scale / 2; camera.bottom = -h * view.scale / 2;
    camera.position.set(cx, -cy - Math.sin(tilt) * 1500, Math.cos(tilt) * 1500);
    camera.up.set(0, 1, 0); camera.lookAt(cx, -cy, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); invalidate();
  }
  return {
    resize, update,
    project(x, y, z = 0) {
      const p = new THREE.Vector3(x, -y, z).project(camera);
      return { x: (p.x + 1) * container.clientWidth / 2, y: (1 - p.y) * container.clientHeight / 2 };
    },
    stats() { return { revision: THREE.REVISION, draws, wagons: pieceCount, models: { ...modelCounts }, stations: stationCount, samples: [...samples], calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio() }; },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set(), materials = new Set();
      scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); if (node.isInstancedMesh) node.dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      symbolTextures.forEach(t => t.dispose());
      wagons.dispose(); texture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
