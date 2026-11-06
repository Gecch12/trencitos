import * as THREE from './vendor/three.module.js';
import { createWagonRenderer } from './wagon-renderer.js';
import { wagonRouteAppearances, wagonStyle } from './wagon-models.mjs';
import { createScoreMedals } from './score-medals.js';
import { createTunnelBoard } from './tunnel-board.js';

// A presentation adapter only. No transport, rule engine or hidden game state.
export function createBoard3D({ container, map, network, onFailure }) {
  const geometryById = new Map(network.map(route => [route.id, route]));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const backgroundColor = map.background?.color ?? '#bbd6d9';
  const baseBackground = new THREE.Color(backgroundColor), shadedBackground = new THREE.Color();
  const previousBackground = container.style.backgroundColor;
  renderer.setClearColor(baseBackground);
  container.style.backgroundColor = backgroundColor;
  renderer.domElement.className = 'board-3d-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.addEventListener('webglcontextlost', lost);
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 5000);
  const scoreMedals=createScoreMedals({scene,camera,container});
  const textureCanvas = document.createElement('canvas');
  const textureScale = Math.min(2, 2048 / Math.max(map.bounds.width, map.bounds.height));
  textureCanvas.width = Math.ceil(map.bounds.width * textureScale); textureCanvas.height = Math.ceil(map.bounds.height * textureScale);
  const ctx = textureCanvas.getContext('2d');
  // Fill every texel before transforming, including rounded-up edge pixels.
  ctx.fillStyle = backgroundColor; ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
  ctx.scale(textureScale, textureScale); ctx.translate(-map.bounds.x, -map.bounds.y);
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
  function syncBackground() {
    // MeshBasicMaterial multiplies the sRGB texture and tint in linear space.
    // Derive the clear color from that same tint, including intermediate frames.
    shadedBackground.copy(baseBackground).multiply(plane.material.color);
    renderer.setClearColor(shadedBackground);
    container.style.backgroundColor = shadedBackground.getStyle();
  }
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
  let previewWagons = null, previewCount = 0;
  function ghostRenderer() {
    if (!previewWagons) {
      const materials = new Map();
      previewWagons = createWagonRenderer({ renderer, put, instances(geometry, capacity, source) {
        if (!materials.has(source)) {
          const material = source.clone(); material.transparent = true; material.opacity = .56; material.depthWrite = false;
          material.onBeforeCompile = source.onBeforeCompile; material.customProgramCacheKey = source.customProgramCacheKey;
          materials.set(source, material);
        }
        const mesh = instances(geometry, capacity, materials.get(source));
        mesh.userData.preview = true;
        return mesh;
      } });
    }
    return previewWagons;
  }
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
      ranges.set(route.id, { start, count: positions.length / 3 - start, lengths });
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
  const ownership = ribbons(11.5,.02), connections = ribbons(17,.06), gold = ribbons(18,.07), halo = ribbons(25,.04);
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const targets = new Map(), animations = new Map();
  let constructionPausedAt=null;
  let boardKey = '', pieceCount = 0, stationCount = 0, modelCounts = {}, bandCount = 0;
  let spotlightRoutes = [], borrowedRoutes = [], completedRoutes = [], freeCells = 0;
  let selection = { route: null, city: null };
  let frame = 0, disposed = false, dimensions = '', draws = 0;
  let layoutKey = '', shadingTransition = null, shadingStrength = 0, spotlightStrength = 0;
  const tunnelBoard = createTunnelBoard({ scene, map, network, invalidate });
  const samples = [];
  function target(key, cell, draw) {
    const before = meshes.map(mesh => mesh.count); draw();
    const ranges = targets.get(key) || [];
    meshes.forEach((mesh,i) => {
      const first=before[i] || 0;
      if (mesh.count > first) ranges.push({mesh, first, count:mesh.count-first, cell});
    });
    targets.set(key, ranges);
  }
  function bindAnimation(animation) {
    animation.parts = [];
    for (const {mesh,first,count,cell} of targets.get(animation.key) || []) {
      if(animation.cells&&!animation.cells.includes(cell))continue;
      for (let i = first; i < first + count; i++) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i,matrix);
        animation.parts.push({mesh,index:i,base:matrix,cell});
      }
    }
    animation.lastCell = Math.max(0,...animation.parts.map(p=>p.cell));
  }
  let passengerAppearances = [];
  function shadingSnapshot() {
    // Positions stay fixed during a focus change. Only interpolate the color
    // buffers, not thousands of wagon matrices. Ghosts may move to a new path.
    const attributes = new Map();
    for (const mesh of meshes) if (!mesh.userData.preview && mesh.instanceColor)
      attributes.set(mesh.instanceColor, mesh.instanceColor.array.slice(0, mesh.count * 3));
    for (const layer of [ownership, connections, gold, halo]) {
      const attribute = layer.mesh.geometry.getAttribute('color');
      attributes.set(attribute, attribute.array.slice());
    }
    return { attributes, plane: plane.material.color.clone(), strength: shadingStrength };
  }
  function advanceShading(now) {
    if (!shadingTransition) return false;
    const { before, after, started, duration } = shadingTransition;
    const progress = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : THREE.MathUtils.clamp((now - started) / duration, 0, 1);
    const blend = progress * progress * (3 - 2 * progress);
    for (const [attribute, end] of after.attributes) {
      const start = before.attributes.get(attribute);
      if (!start || start.length !== end.length) continue;
      for (let i = 0; i < end.length; i++) attribute.array[i] = start[i] + (end[i] - start[i]) * blend;
      attribute.needsUpdate = true;
    }
    plane.material.color.lerpColors(before.plane, after.plane, blend);
    syncBackground();
    shadingStrength = before.strength + (after.strength - before.strength) * blend;
    if (progress === 1) shadingTransition = null;
    return !!shadingTransition;
  }
  function update({ routes, players, visualSeed = '', hiddenRoute = null, highlight = null, spotlight = null,
    selectedRoute = null, selectedCity = null, routeColors = {}, preview = null, recount = null, transitionMs = spotlight?.transitionMs || 0 }) {
    // Only public board fields and the local client's authorized path selection.
    const key = JSON.stringify({ routes, players, visualSeed, hiddenRoute, highlight, spotlight, selectedRoute, selectedCity, routeColors, preview, recount });
    if (key === boardKey || disposed) return;
    const nextLayout = JSON.stringify({ routes, players, visualSeed, hiddenRoute, highlight, selectedRoute, selectedCity, routeColors });
    const duration = Math.max(0, Math.min(1000, transitionMs));
    const before = layoutKey === nextLayout && duration && !matchMedia('(prefers-reduced-motion: reduce)').matches ? shadingSnapshot() : null;
    layoutKey = nextLayout; shadingTransition = null;
    spotlightStrength = spotlight ? THREE.MathUtils.clamp(spotlight.strength ?? 1, 0, 1) : 0;
    shadingStrength = spotlightStrength;
    boardKey = key; pieceCount = stationCount = bandCount = freeCells = previewCount = 0; modelCounts = {};
    passengerAppearances = [];
    selection = {route:selectedRoute,city:selectedCity};
    targets.clear(); ownership.clear(); connections.clear(); gold.clear(); halo.clear();
    for (const mesh of meshes) mesh.count = 0;
    spotlightRoutes = [...(spotlight?.routes || [])]; borrowedRoutes = [...(spotlight?.stationRoutes || [])];
    completedRoutes=(spotlight?.completedRoutes||[]).filter(id=>id!==hiddenRoute);
    const complete=new Set(completedRoutes);
    const litRoutes = new Set(spotlightRoutes), litCities = new Set(spotlight?.endpoints || []);
    const projected = new Set(preview?.routes || []);
    for (const route of routes) if (litRoutes.has(route.id)) { litCities.add(route.a); litCities.add(route.b); }
    for (const station of spotlight?.stations || []) litCities.add(station.city);
    const tint = (hex, faded) => typeof faded === 'number' ? new THREE.Color(hex).multiplyScalar(1 - .72 * faded)
      : faded ? new THREE.Color(hex).lerp(baseBackground, .72) : hex;
    plane.material.color.set('#ffffff').lerp(new THREE.Color('#73868d'), spotlightStrength);
    syncBackground();
    for (const route of routes) {
      const geometry = geometryById.get(route.id); if (!geometry) continue;
      const owner = route.id === hiddenRoute ? null : route.owner;
      const player = owner === null ? null : players[owner];
      const faded = spotlight ? (litRoutes.has(route.id) ? false : spotlightStrength) : highlight !== null && owner !== highlight;
      // Printed board cells stay on the ground, independent of ownership or
      // construction animation. Only the wagon parts belong to animation targets.
      for (const [index,cell] of geometry.cells.entries()) {
        const width = cell.width || 22, height = cell.height || 8.5;
        put(slotEdges,cell.x,cell.y,.13,cell.angle,width/22,height/8.5,1,tint('#405351',faded));
        put(slotFaces,cell.x,cell.y,.16,cell.angle,(width-1.8)/22,(height-1.8)/8.5,1,tint(routeColors[route.color] || '#929da5',faded));
        const angle = cell.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
        if (route.tunnel) for (const x of [-8,-3,2,7]) for (const y of [-5.5,5.5]) {
          put(tunnelMarks,cell.x+x*cos-y*sin,cell.y+x*sin+y*cos,.18,cell.angle,2,1.4,.12,tint('#384b4f',faded));
        }
        if (index < (route.ferry || 0)) put(ferryMarks,cell.x,cell.y,.22,cell.angle,1,1,1,tint('#405351',faded));
      }
      if (player) {
        ownership.set(route.id, tint(player.color, faded), .32); bandCount++;
        const appearances = wagonRouteAppearances(wagonStyle(player.color,player.wagon).model,`${visualSeed}:${owner}:${route.id}`,geometry.cells.length);
        for (const [index,cell] of geometry.cells.entries()) {
          target(`route:${route.id}`, index, () => {
            if(recount?.hidden.includes(route.id)&&!recount.visible[route.id]?.includes(index))return;
            const piece = wagons.draw(cell, player, faded, appearances[index]);
            if (piece.model === 'passenger') passengerAppearances.push({route:route.id,index,variant:piece.variant,cast:piece.cast});
            modelCounts[piece.model] = (modelCounts[piece.model] || 0) + 1; pieceCount++;
          });
        }
      } else {
        freeCells += geometry.cells.length;
        if (projected.has(route.id) && preview.player) {
          const ghost = ghostRenderer(), player = preview.player;
          const appearances = wagonRouteAppearances(wagonStyle(player.color, player.wagon).model, `${visualSeed}:preview:${route.id}`, geometry.cells.length);
          geometry.cells.forEach((cell, i) => { ghost.draw(cell, player, faded, appearances[i]); previewCount++; });
        }
      }
      if(recount&&litRoutes.has(route.id)){
        const active=spotlight.activeRoutes?.includes(route.id);
        connections.set(route.id,active?'#ffcf58':'#9bcfc6',active ? .95 : .65,borrowedRoutes.includes(route.id));
      }
      else if(complete.has(route.id)){gold.set(route.id,'#ffd766',.9,borrowedRoutes.includes(route.id));halo.set(route.id,'#ffbd39',.3,borrowedRoutes.includes(route.id));}
      else if (litRoutes.has(route.id) && route.id !== hiddenRoute) connections.set(route.id,spotlight?.completedRoutes&&!spotlight.activeRoutes?.includes(route.id)?'#7cd7e4':'#ffe08a',.7,borrowedRoutes.includes(route.id));
      else if (route.id === selectedRoute) connections.set(route.id,'#eeb84a',.65);
    }
    for (const [city,[x,y]] of Object.entries(map.cities)) {
      const owner = players.findIndex(p => p.placed.includes(city));
      const faded = spotlight ? (litCities.has(city) ? false : spotlightStrength) : highlight !== null && owner >= 0 && owner !== highlight;
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
    ownership.flush(); connections.flush();gold.flush();halo.flush();
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (const animation of animations.values()) bindAnimation(animation);
    if (before) {
      shadingTransition = { before, after: shadingSnapshot(), started: performance.now(), duration };
      advanceShading(shadingTransition.started);
    }
    invalidate();
  }
  function animateConstruction(event, onComplete, {delay=0,duration=500,hideDuringDelay=false,liftFirst=false,cells=null,simultaneous=false}={}) {
    const key = event.routeId !== undefined ? `route:${event.routeId}` : `city:${event.city}`;
    if (disposed || !targets.has(key)) return false;
    const animation = {key,started:performance.now(),onComplete,maxLift:0,delay,duration,hideDuringDelay,liftFirst,cells,simultaneous,visible:!hideDuringDelay};
    bindAnimation(animation); animations.set(key,animation); invalidate(); return true;
  }
  const animatedMatrix = new THREE.Matrix4(), hiddenScale = new THREE.Vector3(0, 0, 0);
  function advanceAnimations(now) {
    const callbacks = [];
    if(constructionPausedAt!==null)return callbacks;
    for (const animation of animations.values()) {
      const elapsed = now - animation.started - animation.delay, stagger = animation.simultaneous?0:Math.min(animation.duration * .16,animation.lastCell * animation.duration * .036);
      animation.maxLift = 0;
      animation.visible = !animation.hideDuringDelay || elapsed >= 0;
      for (const part of animation.parts) {
        const delay = animation.lastCell ? stagger * part.cell / animation.lastCell : 0;
        const rise = animation.liftFirst ? animation.duration * .22 : 0;
        const progress = THREE.MathUtils.clamp((elapsed-rise-delay)/(animation.duration-rise-stagger),0,1);
        const ascent = rise ? THREE.MathUtils.smoothstep(elapsed,0,rise) : 1;
        const lift = (animation.liftFirst ? 11 : 18) * ascent * (1-progress) ** 3;
        animation.maxLift = Math.max(animation.maxLift,lift);
        animatedMatrix.copy(part.base); animatedMatrix.elements[14] += lift;
        if (!animation.visible) animatedMatrix.scale(hiddenScale);
        part.mesh.setMatrixAt(part.index,animatedMatrix); part.mesh.instanceMatrix.needsUpdate = true;
      }
      if (elapsed >= animation.duration) { animations.delete(animation.key); if (animation.onComplete) callbacks.push(animation.onComplete); }
    }
    return callbacks;
  }
  function cancelAnimations() {
    for (const animation of animations.values()) for (const part of animation.parts) {
      part.mesh.setMatrixAt(part.index,part.base); part.mesh.instanceMatrix.needsUpdate = true;
    }
    animations.clear(); invalidate();
  }
  function cancelConstruction(routeId) {
    const key = `route:${routeId}`, animation = animations.get(key);
    if (!animation) return;
    for (const part of animation.parts) {
      part.mesh.setMatrixAt(part.index,part.base); part.mesh.instanceMatrix.needsUpdate = true;
    }
    animations.delete(key); invalidate();
  }
  function lost(event) { event.preventDefault(); onFailure(new Error('Se perdió el contexto WebGL.')); }
  function invalidate() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(renderFrame);
  }
  function renderFrame(now) {
    frame = 0;
    if (disposed || document.hidden) return;
    const callbacks = advanceAnimations(now), cardsMoving = tunnelBoard.advance(now), shadingMoving = advanceShading(now), start = performance.now();
    const pulse=reducedMotion.matches?1:.78+.22*Math.sin(now/650);
    gold.mesh.material.opacity=pulse;halo.mesh.material.opacity=pulse*.8;
    scoreMedals.layout();renderer.render(scene, camera); draws++;
    samples.push(performance.now() - start); if (samples.length > 240) samples.shift();
    callbacks.forEach(callback => callback());
    if ((animations.size && constructionPausedAt===null) || cardsMoving || shadingMoving || completedRoutes.length&&!reducedMotion.matches) invalidate();
  }
  function visibility() { if (document.hidden) cancelAnimations(); else invalidate(); }
  document.addEventListener('visibilitychange', visibility);
  reducedMotion.addEventListener('change',invalidate);
  function resize(view, immediate = false) {
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
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    if (immediate) { cancelAnimationFrame(frame); renderFrame(performance.now()); }
    else invalidate();
  }
  return {
    resize, update, animateConstruction, cancelAnimations, cancelConstruction, pauseConstruction(paused){if(paused&&constructionPausedAt===null)constructionPausedAt=performance.now();else if(!paused&&constructionPausedAt!==null){for(const a of animations.values())a.started+=performance.now()-constructionPausedAt;constructionPausedAt=null;invalidate();}}, setScoreMedals(values,area){scoreMedals.update(values,area);invalidate();}, setTunnelCards: tunnelBoard.update,
    project(x, y, z = 0) {
      const p = new THREE.Vector3(x, -y, z).project(camera);
      return { x: (p.x + 1) * container.clientWidth / 2, y: (1 - p.y) * container.clientHeight / 2 };
    },
    stats() { return { medals:scoreMedals.stats(), selection: {...selection}, freeCells, previewWagons: previewCount, tunnelCards: tunnelBoard.stats(), ownershipBands: bandCount, spotlightRoutes: [...spotlightRoutes], completedRoutes:[...completedRoutes], goldOpacity:gold.mesh.material.opacity, borrowedRoutes: [...borrowedRoutes],
      ground: { cells: slotFaces.count, edges: slotEdges.count, tunnelMarks: tunnelMarks.count, ferryMarks: ferryMarks.count },
      spotlightStrength, shadingStrength, shadingAnimating: !!shadingTransition,
      animations: [...animations.values()].map(a=>({key:a.key,maxLift:a.maxLift,visible:a.visible})), revision: THREE.REVISION, draws, wagons: pieceCount, models: { ...modelCounts }, passengers: passengerAppearances.map(p=>({...p})), stations: stationCount, samples: [...samples], calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, pixelRatio: renderer.getPixelRatio() }; },
    dispose() {
      scoreMedals.dispose();disposed = true; shadingTransition = null; animations.clear(); cancelAnimationFrame(frame); tunnelBoard.dispose();
      document.removeEventListener('visibilitychange', visibility);
      reducedMotion.removeEventListener('change',invalidate);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      const geometries = new Set(), materials = new Set();
      scene.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); if (node.isInstancedMesh) node.dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      wagons.dispose(); previewWagons?.dispose(); texture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      container.style.backgroundColor = previousBackground;
    },
  };
}
