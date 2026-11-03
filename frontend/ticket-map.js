import { createBoard3D } from './board-3d.js';

// A separate camera over the same board renderer. No game actions live here.
export function createTicketMap({ container, map, network, camera, onPreview, onSelect, onFailure }) {
  const board = createBoard3D({ container, map, network, onFailure });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('ticket-map-overlay'); svg.setAttribute('aria-hidden', 'true'); container.append(svg);
  const paths = new Map(network.map(r => [r.id, r]));
  let data = null, view = null, frame = null, disposed = false, gesture = null, dragged = false, down = null, transition = null;
  const pointers = new Map();
  const shownItems = () => data.items.filter(item => data.focus === null ? item.overview : item.key === data.focus);
  function el(tag, attrs, parent = svg) {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.append(node); return node;
  }
  function refresh() {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return false;
    view = BoardCamera.view(map.bounds, { width, height }, { x: 16, y: 38, width: Math.max(1, width - 32), height: Math.max(1, height - 54) }, camera.zoom, camera.center, GameUI.camera);
    camera.center = view.focus;
    board.resize(view); return true;
  }
  function paint() {
    frame = null;
    if (disposed || !data || !refresh()) return;
    const { cityName } = data;
    const shown = shownItems();
    svg.setAttribute('viewBox', `0 0 ${container.clientWidth} ${container.clientHeight}`); svg.replaceChildren();
    const world = el('g', { transform: `scale(${1 / view.scale} ${1 / view.scaleY}) translate(${-view.x} ${-view.y})` });
    const endpoints = new Map();
    for (const item of shown) {
      for (const id of item.plan.routes) {
        const geometry = paths.get(id); if (!geometry) continue;
        el('path', { d: geometry.d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(15, 12 * view.scale), 'data-preview-key': item.key }, world);
      }
      const middle = paths.get(item.plan.routes[Math.floor(item.plan.routes.length / 2)]);
      if (middle) {
        const cell = middle.cells[Math.floor(middle.cells.length / 2)], p = board.project(cell.x, cell.y, 8);
        const marker = el('g', { transform: `translate(${p.x} ${p.y})`, 'data-preview-key': item.key, class: 'ticket-path-badge' });
        el('circle', { r: 10, fill: item.color, stroke: '#fff9e8', 'stroke-width': 2 }, marker);
        el('text', { y: 4, 'text-anchor': 'middle', fill: '#fff' }, marker).textContent = item.number;
      }
      for (const city of [item.ticket.a, item.ticket.b]) {
        if (!endpoints.has(city)) endpoints.set(city, []);
        endpoints.get(city).push(item);
      }
    }
    const boxes = [], nodes = new Map(), width = container.clientWidth, height = container.clientHeight;
    for (const [city, entries] of endpoints) {
      const pos = board.project(...map.cities[city]);
      const p = GameUI.endpointPosition(pos, { x: 0, y: 30, width, height: height - 30 }, 12);
      const group = el('g', { 'data-ticket-city': city });
      el('circle', { cx: p.x, cy: p.y, r: 6, fill: '#fff9e8', stroke: '#c7993f', 'stroke-width': 2 }, group);
      const label = el('text', { class: 'ticket-endpoint-name' }, group); label.textContent = cityName(city);
      const badges = el('g', {}, group);
      entries.forEach((item, i) => {
        const g = el('g', { transform: `translate(${i * 20} 0)`, 'data-preview-key': item.key }, badges);
        el('rect', { width: 18, height: 16, rx: 4, fill: item.color, stroke: '#fff9e8' }, g);
        el('text', { x: 9, y: 12, 'text-anchor': 'middle', fill: '#fff', class: 'ticket-endpoint-number' }, g).textContent = item.number;
      });
      boxes.push({ key: city, x: p.x, y: p.y, width: Math.max(label.getComputedTextLength() + 4, entries.length * 20) });
      nodes.set(city, { label, badges, count: entries.length });
    }
    for (const box of map.placeLabels(boxes, width, height, [{ x: 0, y: 0, width, height: 33 }], { height: 34, baseline: 31 })) {
      const { label, badges, count } = nodes.get(box.key);
      label.setAttribute('x', box.x + box.width / 2); label.setAttribute('y', box.y + 31);
      badges.setAttribute('transform', `translate(${box.x + (box.width - count * 20) / 2} ${box.y})`);
    }
  }
  function schedule() { if (frame === null && !disposed) frame = requestAnimationFrame(paint); }
  function update(next) {
    data = next;
    const shown = shownItems();
    const routes = [...new Set(shown.flatMap(item => item.plan.routes))];
    const strength = data.shadingEnabled === undefined
      ? (!shown.length ? 0 : data.focus === null ? data.overviewStrength : 1)
      : Number(data.shadingEnabled);
    board.update({ routes: data.routes, players: data.players, routeColors: data.routeColors, visualSeed: data.visualSeed,
      preview: { routes, player: data.players[data.seat] },
      // A zero-strength spotlight keeps route ribbons and previews without dimming the map.
      transitionMs: 180, spotlight: { strength,
        routes, endpoints: shown.flatMap(item => [item.ticket.a, item.ticket.b]),
        stationRoutes: shown.flatMap(item => item.plan.stationRoutes), stations: shown.flatMap(item => item.plan.stations) } });
    if (data.changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      transition?.cancel();
      transition = container.querySelector('canvas').animate([{ opacity: .6 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
    schedule();
  }
  function point(event) { const r = container.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function start() {
    if (!pointers.size || !refresh()) { gesture = null; return; }
    const ps = [...pointers.values()], mid = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    gesture = { zoom: camera.zoom, center: { ...camera.center }, scale: view.scale, scaleY: view.scaleY,
      mid, distance: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : null };
  }
  const events = new AbortController(), options = { signal: events.signal };
  container.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    down = point(event); pointers.set(event.pointerId, down); dragged = pointers.size > 1; start();
  }, options);
  container.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) {
      const key = event.target.closest('[data-preview-key]')?.dataset.previewKey;
      if (event.pointerType === 'mouse') onPreview(key ?? null);
      return;
    }
    const p = point(event); pointers.set(event.pointerId, p);
    if (!gesture) return;
    if (down && Math.hypot(p.x - down.x, p.y - down.y) > 5) dragged = true;
    if (!dragged) return;
    container.setPointerCapture(event.pointerId);
    const ps = [...pointers.values()], mid = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    const z = gesture.distance && ps.length > 1 ? Math.min(6, Math.max(1, gesture.zoom * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / gesture.distance)) : gesture.zoom;
    camera.zoom = z;
    camera.center = { x: gesture.center.x + (gesture.mid.x - view.sx) * gesture.scale - (mid.x - view.sx) * gesture.scale * gesture.zoom / z,
      y: gesture.center.y + (gesture.mid.y - view.sy) * gesture.scaleY - (mid.y - view.sy) * gesture.scaleY * gesture.zoom / z };
    schedule();
  }, options);
  function end(event) {
    if (!pointers.has(event.pointerId)) return;
    const key = event.target.closest('[data-preview-key]')?.dataset.previewKey;
    if (event.type === 'pointerup' && !dragged) onSelect(key ?? null);
    pointers.delete(event.pointerId);
    if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    start();
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) container.addEventListener(type, end, options);
  container.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && !pointers.size) onPreview(null); }, options);
  function zoomAt(next, p = { x: container.clientWidth / 2, y: container.clientHeight / 2 }) {
    if (!refresh()) return;
    const z = Math.max(1, Math.min(6, next)), ratio = camera.zoom / z;
    camera.center = { x: camera.center.x + (p.x - view.sx) * view.scale * (1 - ratio), y: camera.center.y + (p.y - view.sy) * view.scaleY * (1 - ratio) };
    camera.zoom = z; schedule();
  }
  function reset() { camera.zoom = 1; camera.center = { x: map.bounds.x + map.bounds.width / 2, y: map.bounds.y + map.bounds.height / 2 }; schedule(); }
  container.addEventListener('wheel', event => {
    event.preventDefault(); event.stopPropagation();
    zoomAt(camera.zoom * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1) * .002), point(event));
  }, { ...options, passive: false });
  container.addEventListener('keydown', event => {
    if (event.target.closest('button')) return;
    if (['+', '=', '-', 'Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Home') reset();
      else if (['+', '=', '-'].includes(event.key)) zoomAt(camera.zoom * (event.key === '-' ? .8 : 1.25));
      else if (refresh()) { camera.center.x += ({ ArrowLeft: -1, ArrowRight: 1 }[event.key] || 0) * 40 * view.scale;
        camera.center.y += ({ ArrowUp: -1, ArrowDown: 1 }[event.key] || 0) * 40 * view.scaleY; schedule(); }
    }
  }, options);
  const resize = new ResizeObserver(schedule); resize.observe(container);
  return { update, zoom: direction => zoomAt(camera.zoom * (direction > 0 ? 1.25 : .8)), reset,
    stats: () => ({ ...board.stats(), camera: structuredClone(camera) }),
    dispose() { disposed = true; transition?.cancel(); events.abort(); resize.disconnect(); cancelAnimationFrame(frame); board.dispose(); svg.remove(); } };
}
