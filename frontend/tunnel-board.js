import * as THREE from './vendor/three.module.js';

// Three small physical cards share the board's camera, depth and public timeline.
export function createTunnelBoard({ scene, map, network, invalidate }) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const geometry = new THREE.PlaneGeometry(30, 46), frameGeometry = new THREE.PlaneGeometry(33, 49);
  const badgeCanvas = document.createElement('canvas'); badgeCanvas.width = badgeCanvas.height = 64;
  const badgeContext = badgeCanvas.getContext('2d');
  badgeContext.fillStyle = '#f5c647'; badgeContext.beginPath(); badgeContext.arc(32, 32, 30, 0, Math.PI * 2); badgeContext.fill();
  badgeContext.fillStyle = '#283c3e'; badgeContext.font = 'bold 34px sans-serif'; badgeContext.textAlign = 'center'; badgeContext.textBaseline = 'middle'; badgeContext.fillText('+1', 32, 34);
  const badgeTexture = new THREE.CanvasTexture(badgeCanvas); badgeTexture.colorSpace = THREE.SRGBColorSpace;
  const badgeGeometry = new THREE.PlaneGeometry(13, 13);
  const textures = new Map(), cards = [], flips = new Map();
  for (let i = 0; i < 3; i++) {
    const root = new THREE.Group(); root.position.x = (i - 1) * 37; group.add(root);
    const shadow = new THREE.Mesh(frameGeometry, new THREE.MeshBasicMaterial({ color: '#253d40', transparent: true, opacity: .24, depthWrite: false }));
    shadow.position.set(2, -3, -.15); root.add(shadow);
    const border = new THREE.Mesh(frameGeometry, new THREE.MeshBasicMaterial({ color: '#fff7df' })); root.add(border);
    const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#24495a', side: THREE.DoubleSide })); face.position.z = .1; root.add(face);
    const badge = new THREE.Mesh(badgeGeometry, new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true, depthWrite: false }));
    badge.position.set(13, 21, .3); badge.visible = false; root.add(badge);
    cards.push({ root, face, border, badge, color: null, match: false });
  }
  let key = '', routeId = null, position = null, current = null;
  function place(id) {
    const route = network.find(r => r.id === id); if (!route) return;
    const mid = route.cells[Math.floor(route.cells.length / 2)], bounds = map.bounds;
    const candidates = [];
    // Prefer nearby clear ground/water, without covering city nodes or rail cells.
    for (const radius of [65, 105, 150]) for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6, x = mid.x + Math.cos(angle) * radius, y = mid.y + Math.sin(angle) * radius;
      if (x - 56 < bounds.x || x + 56 > bounds.x + bounds.width || y - 30 < bounds.y || y + 30 > bounds.y + bounds.height) continue;
      const overlaps = (px, py, margin) => Math.abs(px - x) < 56 + margin && Math.abs(py - y) < 30 + margin;
      const cities = Object.values(map.cities).filter(([cx, cy]) => overlaps(cx, cy, 18)).length;
      const cells = network.reduce((n, r) => n + r.cells.filter(c => overlaps(c.x, c.y, 10)).length, 0);
      candidates.push({ x, y, score: cities * 1000 + cells * 70 + radius });
    }
    position = candidates.sort((a, b) => a.score - b.score)[0] || { x: mid.x, y: mid.y + 65 };
    group.position.set(position.x, -position.y, .7);
  }
  function update(state, images) {
    const nextKey = JSON.stringify([state?.id, state?.routeId, state?.cards.map(c => [c.color, c.match]), images?.size]);
    if (nextKey === key) return;
    key = nextKey; current = state; group.visible = !!state;
    if (!state) { routeId = null; flips.clear(); cards.forEach(item => { item.face.rotation.y = 0; item.color = null; }); invalidate(); return; }
    if (routeId !== state.routeId) { routeId = state.routeId; place(routeId); }
    state.cards.forEach((card, i) => {
      const item = cards[i]; if (!item) return;
      item.root.visible = true;
      const color = card.color || 'back', image = images.get(color);
      if (image && !textures.has(color)) {
        // SVG image uploads are inconsistent across WebGL implementations;
        // rasterize the already-decoded local artwork at an explicit resolution.
        const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 260;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.set(color, texture);
      }
      item.face.material.map = textures.get(color) || null; item.face.material.color.set(image ? '#ffffff' : '#24495a'); item.face.material.needsUpdate = true;
      item.border.material.color.set(card.match ? '#f5c647' : '#fff7df');
      item.badge.visible = card.match;
      if (card.color && item.color !== color && state.animate && card.age < 350) flips.set(i, performance.now() - card.age);
      item.color = color; item.match = card.match;
    });
    cards.forEach((item, i) => { item.root.visible = i < state.cards.length; });
    invalidate();
  }
  function advance(now) {
    for (const [i, start] of flips) {
      const p = Math.min(1, (now - start) / 350);
      cards[i].face.rotation.y = (1 - p) * Math.PI / 2;
      if (p === 1) flips.delete(i);
    }
    return flips.size > 0;
  }
  return { update, advance,
    stats: () => ({ visible: group.visible, routeId, position, cards: current?.cards.map(c => ({ color: c.color, match: c.match })) || [] }),
    dispose() { scene.remove(group); geometry.dispose(); frameGeometry.dispose(); badgeGeometry.dispose(); badgeTexture.dispose(); textures.forEach(t => t.dispose());
      cards.forEach(item => item.root.children.forEach(mesh => mesh.material.dispose())); flips.clear(); }
  };
}
