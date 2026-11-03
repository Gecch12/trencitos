import * as THREE from './vendor/three.module.js';
import { createWagonRenderer } from './wagon-renderer.js';
import { wagonRouteAppearances, wagonStyle } from './wagon-models.mjs';

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
  const sky = new THREE.HemisphereLight(0xfff9e8, 0x365466, 2.2);
  sky.position.set(0, 0, 1); scene.add(sky); // The board uses Z as its vertical axis.
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-400, 400, 900); scene.add(sun);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-9, 0); roofShape.lineTo(0, 7); roofShape.lineTo(9, 0); roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: 14, bevelEnabled: false });
  roofGeometry.rotateX(Math.PI / 2); roofGeometry.translate(0, 7, 11);
  const meshes = [];
  function instances(geometry, capacity, material = new THREE.MeshStandardMaterial({ roughness: .55, metalness: .1 })) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); meshes.push(mesh); return mesh;
  }
  const stations = instances(box, 15), stationRoofs = instances(roofGeometry, 15);
  const doors = instances(box, 15);
  const dummy = new THREE.Object3D(), color = new THREE.Color(), pose = new THREE.Quaternion();
  function put(mesh, x, y, z, angle, sx, sy, sz, tint, rotation) {
    const i = mesh.count++;
    dummy.position.set(x, -y, z); dummy.rotation.set(0, 0, -angle * Math.PI / 180);
    // Reflect the local pose into the board's inverted Y, then follow the track.
    if (rotation) dummy.quaternion.multiply(pose.set(-rotation[0],rotation[1],-rotation[2],rotation[3]));
    dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.set(tint));
  }
  const wagons = createWagonRenderer({ renderer, scene, instances, put });
  // Ground markings live in this depth-tested scene, below trains/stations.
  const basic = () => new THREE.MeshBasicMaterial();
  const slotShape = new THREE.Shape();
  slotShape.moveTo(-9.4,-4.25); slotShape.lineTo(9.4,-4.25);
  slotShape.quadraticCurveTo(11,-4.25,11,-2.65); slotShape.lineTo(11,2.65);
  slotShape.quadraticCurveTo(11,4.25,9.4,4.25); slotShape.lineTo(-9.4,4.25);
  slotShape.quadraticCurveTo(-11,4.25,-11,2.65); slotShape.lineTo(-11,-2.65);
  slotShape.quadraticCurveTo(-11,-4.25,-9.4,-4.25);
  const slotGeometry = new THREE.ShapeGeometry(slotShape, 4);
  const cellCapacity = Math.max(1, network.reduce((n,r) => n + r.cells.length, 0));
  const slotEdges = instances(slotGeometry, cellCapacity, basic());
  const slotFaces = instances(slotGeometry, cellCapacity, basic());
  const tunnelMarks = instances(box, cellCapacity * 8, basic());
  const ship = new THREE.Shape();
  ship.moveTo(-7,-2); ship.lineTo(8,-2); ship.lineTo(5,1); ship.lineTo(0,1);
  ship.lineTo(0,4); ship.lineTo(-3,4); ship.lineTo(-3,2); ship.lineTo(-7,2); ship.closePath();
  const ferryMarks = instances(new THREE.ShapeGeometry(ship), cellCapacity, basic());
  const cityDiscs = instances(new THREE.CircleGeometry(1, 32), Object.keys(map.cities).length * 3, basic());

  // One batch per continuous ribbon layer, with per-route RGBA colors. This
  // avoids hundreds of draw calls while preserving depth at every crossing.
  function ribbons(width, height) {
    const positions = [], ranges = new Map();
    for (const route of network) {
      const points = route.points || route.cells.map(c => [c.x,c.y]);
      const edges = points.map(([x,y],i) => {
        const prev = points[Math.max(0,i-1)], next = points[Math.min(points.length-1,i+1)];
        const span = Math.hypot(next[0]-prev[0],next[1]-prev[1]) || 1;
        const nx = -(next[1]-prev[1]) / span * width / 2, ny = (next[0]-prev[0]) / span * width / 2;
        return [[x+nx,-y-ny,height],[x-nx,-y+ny,height]];
      });
      const start = positions.length / 3, lengths = [];
      let length = 0;
      for (let i = 1; i < points.length; i++) {
        const [ax,ay] = points[i-1], [bx,by] = points[i];
        const span = Math.hypot(bx-ax,by-ay); if (!span) continue;
        const [a,b] = edges[i-1], [c,d] = edges[i];
        positions.push(...a,...c,...b,...b,...c,...d);
        lengths.push(length + span / 2); length += span;
      }
      ranges.set(route.id ?? network.indexOf(route), { start, count: positions.length / 3 - start, lengths });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const rgba = new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 4), 4);
    geometry.setAttribute('color', rgba);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; scene.add(mesh);
    return { mesh, clear() { rgba.array.fill(0); },
      set(id, hex, opacity, dashed = false) {
        const range = ranges.get(id); if (!range) return;
        const tint = new THREE.Color(hex);
        for (let i = 0; i < range.count; i++) {
          const alpha = dashed && Math.floor(range.lengths[Math.floor(i/6)] / 7) % 2 ? 0 : opacity;
          rgba.setXYZW(range.start + i, tint.r,tint.g,tint.b,alpha);
        }
      }, flush() { rgba.needsUpdate = true; } };
  }
  const ownership = ribbons(11.5,.02), connections = ribbons(17,.06);
  const targets = new Map(), animations = new Map();
  let boardKey = '', pieceCount = 0, stationCount = 0, modelCounts = {}, bandCount = 0;
  let spotlightRoutes = [], borrowedRoutes = [], freeCells = 0;
  let selection = { route: null, city: null };
  let frame = 0, disposed = false, dimensions = '', draws = 0;
  const samples = [];
  function target(key, cell, draw) {
    const before = meshes.map(mesh => mesh.count); draw();
    const ranges = targets.get(key) || [];
    meshes.forEach((mesh,i) => {
      if (mesh.count > before[i]) ranges.push({mesh, first:before[i], count:mesh.count-before[i], cell});
    });
    targets.set(key, ranges);
  }
  function bindAnimation(animation) {
    animation.parts = [];
    for (const {mesh,first,count,cell} of targets.get(animation.key) || []) {
      for (let i = first; i < first + count; i++) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i,matrix);
        animation.parts.push({mesh,index:i,base:matrix,cell});
      }
    }
    animation.lastCell = Math.max(0,...animation.parts.map(p=>p.cell));
  }
  let passengerAppearances = [];
  function update({ routes, players, visualSeed = '', hiddenRoute = null, highlight = null, spotlight = null,
    selectedRoute = null, selectedCity = null, routeColors = {} }) {
    // Only public board fields and the local client's authorized path selection.
    const key = JSON.stringify({ routes, players, visualSeed, hiddenRoute, highlight, spotlight, selectedRoute, selectedCity, routeColors });
    if (key === boardKey || disposed) return;
    boardKey = key; pieceCount = stationCount = bandCount = freeCells = 0; modelCounts = {};
    passengerAppearances = [];
    selection = {route:selectedRoute,city:selectedCity};
    targets.clear(); ownership.clear(); connections.clear();
    for (const mesh of meshes) mesh.count = 0;
    spotlightRoutes = [...(spotlight?.routes || [])]; borrowedRoutes = [...(spotlight?.stationRoutes || [])];
    const litRoutes = new Set(spotlightRoutes), litCities = new Set(spotlight?.endpoints || []);
    for (const route of routes) if (litRoutes.has(route.id)) { litCities.add(route.a); litCities.add(route.b); }
    for (const station of spotlight?.stations || []) litCities.add(station.city);
    const tint = (hex, faded) => faded === 'dim' ? new THREE.Color(hex).multiplyScalar(.28)
      : faded ? new THREE.Color(hex).lerp(new THREE.Color('#bbd6d9'), .72) : hex;
    plane.material.color.set(spotlight ? '#73868d' : '#ffffff');
    renderer.setClearColor(spotlight ? '#536c77' : '#bbd6d9');
    for (const route of routes) {
      const geometry = network[route.id]; if (!geometry) continue;
      const owner = route.id === hiddenRoute ? null : route.owner;
      const player = owner === null ? null : players[owner];
      const faded = spotlight ? (litRoutes.has(route.id) ? false : 'dim') : highlight !== null && owner !== highlight;
      if (player) {
        ownership.set(route.id, tint(player.color, faded), .32); bandCount++;
        const appearances = wagonRouteAppearances(wagonStyle(player.color,player.wagon).model,`${visualSeed}:${owner}:${route.id}`,geometry.cells.length);
        for (const [index,cell] of geometry.cells.entries()) {
          target(`route:${route.id}`, index, () => {
            const piece = wagons.draw(cell, player, faded, appearances[index]);
            if (piece.model === 'passenger') passengerAppearances.push({route:route.id,index,variant:piece.variant,cast:piece.cast});
            modelCounts[piece.model] = (modelCounts[piece.model] || 0) + 1; pieceCount++;
          });
        }
      } else {
        for (const [index,cell] of geometry.cells.entries()) {
          const width = cell.width || 22, height = cell.height || 8.5;
          put(slotEdges,cell.x,cell.y,.13,cell.angle,width/22,height/8.5,1,tint('#405351',faded));
          put(slotFaces,cell.x,cell.y,.16,cell.angle,(width-1.8)/22,(height-1.8)/8.5,1,tint(routeColors[route.color] || '#929da5',faded));
          const angle = cell.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
          if (route.tunnel) for (const x of [-8,-3,2,7]) for (const y of [-5.5,5.5]) {
            put(tunnelMarks,cell.x+x*cos-y*sin,cell.y+x*sin+y*cos,.18,cell.angle,2,1.4,.12,tint('#384b4f',faded));
          }
          if (index < (route.ferry || 0)) put(ferryMarks,cell.x,cell.y,.22,cell.angle,1,1,1,tint('#405351',faded));
          freeCells++;
        }
      }
      if (litRoutes.has(route.id) && route.id !== hiddenRoute) connections.set(route.id,'#ffe08a',.7,borrowedRoutes.includes(route.id));
      else if (route.id === selectedRoute) connections.set(route.id,'#eeb84a',.65);
    }
    for (const [city,[x,y]] of Object.entries(map.cities)) {
      const owner = players.findIndex(p => p.placed.includes(city));
      const faded = spotlight ? (litCities.has(city) ? false : 'dim') : highlight !== null && owner >= 0 && owner !== highlight;
      if (owner < 0 || selectedCity === city) {
        const radius = owner >= 0 ? 11.5 : 6.6;
        put(cityDiscs,x,y,.23,0,radius,radius,1,tint('#fffdf1',faded));
        put(cityDiscs,x,y,.25,0,radius-1.7,radius-1.7,1,tint(selectedCity === city ? '#bd6b38' : '#6b7972',faded));
        put(cityDiscs,x,y,.27,0,radius-3.1,radius-3.1,1,tint('#f9f4e6',faded));
      }
      if (owner >= 0) target(`city:${city}`,0,() => {
        put(stations,x,y,5.5,0,14,12,11,tint(players[owner].color,faded));
        put(stationRoofs,x,y,0,0,1,1,1,tint(players[owner].color,faded));
        put(doors,x,y+6.1,3.8,0,4,.3,7.5,tint('#fff3d6',faded)); stationCount++;
      });
    }
    ownership.flush(); connections.flush();
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (const animation of animations.values()) bindAnimation(animation);
    invalidate();
  }
  function animateConstruction(event, onComplete) {
    const key = event.routeId !== undefined ? `route:${event.routeId}` : `city:${event.city}`;
    if (disposed || !targets.has(key)) return false;
    const animation = {key,started:performance.now(),onComplete,maxLift:0};
    bindAnimation(animation); animations.set(key,animation); invalidate(); return true;
  }
  const animatedMatrix = new THREE.Matrix4();
  function advanceAnimations(now) {
    const callbacks = [];
    for (const animation of animations.values()) {
      const elapsed = now - animation.started, stagger = Math.min(80,animation.lastCell * 18);
      animation.maxLift = 0;
      for (const part of animation.parts) {
        const delay = animation.lastCell ? stagger * part.cell / animation.lastCell : 0;
        const progress = THREE.MathUtils.clamp((elapsed-delay)/(500-stagger),0,1);
        const lift = 18 * (1-progress) ** 3;
        animation.maxLift = Math.max(animation.maxLift,lift);
        animatedMatrix.copy(part.base); animatedMatrix.elements[14] += lift;
        part.mesh.setMatrixAt(part.index,animatedMatrix); part.mesh.instanceMatrix.needsUpdate = true;
      }
      if (elapsed >= 500) { animations.delete(animation.key); if (animation.onComplete) callbacks.push(animation.onComplete); }
    }
    return callbacks;
  }
  function cancelAnimations() {
    for (const animation of animations.values()) for (const part of animation.parts) {
      part.mesh.setMatrixAt(part.index,part.base); part.mesh.instanceMatrix.needsUpdate = true;
    }
    animations.clear(); invalidate();
  }
  function lost(event) { event.preventDefault(); onFailure(new Error('Se perdió el contexto WebGL.')); }
  function invalidate() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(now => {
      frame = 0;
      if (disposed || document.hidden) return;
      const callbacks = advanceAnimations(now), start = performance.now();
      renderer.render(scene, camera); draws++;
      samples.push(performance.now() - start); if (samples.length > 240) samples.shift();
      callbacks.forEach(callback => callback());
      if (animations.size) invalidate();
    });
  }
  function visibility() { if (document.hidden) cancelAnimations(); else invalidate(); }
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
    resize, update, animateConstruction, cancelAnimations,
    project(x, y, z = 0) {
      const p = new THREE.Vector3(x, -y, z).project(camera);
      return { x: (p.x + 1) * container.clientWidth / 2, y: (1 - p.y) * container.clientHeight / 2 };
    },
    stats() { return { selection: {...selection}, freeCells, ownershipBands: bandCount, spotlightRoutes: [...spotlightRoutes], borrowedRoutes: [...borrowedRoutes],
      animations: [...animations.values()].map(a=>({key:a.key,maxLift:a.maxLift})), revision: THREE.REVISION, draws, wagons: pieceCount, models: { ...modelCounts }, passengers: passengerAppearances.map(p=>({...p})), stations: stationCount, samples: [...samples], calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio() }; },
    dispose() {
      disposed = true; animations.clear(); cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set(), materials = new Set();
      scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); if (node.isInstancedMesh) node.dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      wagons.dispose(); texture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
