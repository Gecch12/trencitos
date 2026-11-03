"use strict";

// Geometry and label placement work with a separately versioned map layout.
const RailMap = (() => {
  function createLayout(layout) {
  const { bounds, tile, cities, bends = {}, labels = {}, land = [], details = [], seaLabels = [] } = structuredClone(layout);
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function spline(points) {
    const samples = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i];
      const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      const steps = Math.max(12, Math.ceil((distance(p1, c1) + distance(c1, c2) + distance(c2, p2)) / 1.5));
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, u = 1 - t;
        samples.push([0, 1].map(k => u ** 3 * p1[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t ** 3 * p2[k]));
      }
    }
    return samples;
  }
  function measured(points) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    return { points, lengths, length: lengths.at(-1) };
  }
  function pointAt(path, length) {
    length = Math.max(0, Math.min(path.length, length));
    let lo = 1, hi = path.lengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (path.lengths[mid] < length) lo = mid + 1;
      else hi = mid;
    }
    const span = path.lengths[lo] - path.lengths[lo - 1];
    return mix(path.points[lo - 1], path.points[lo], span ? (length - path.lengths[lo - 1]) / span : 0);
  }
  function toPath(points) {
    return points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" ");
  }
  function routeGeometry(route, lane = 0) {
    const a = cities[route.a], b = cities[route.b];
    const key = `${route.a}-${route.b}`, reverse = `${route.b}-${route.a}`;
    const middle = bends[key] || (bends[reverse] ? [...bends[reverse]].reverse() : []);
    let path = measured(spline([a, ...middle, b]));
    const minimum = route.n * tile.width + (route.n - 1) * tile.gap + 2 * tile.cityMargin;
    if (path.length < minimum) throw new Error(`Route ${key} is too short for uniform train slots (${path.length.toFixed(1)} < ${minimum})`);
    if (lane) {
      path = measured(path.points.map((p, i, ps) => {
        const prev = ps[Math.max(0, i - 1)], next = ps[Math.min(ps.length - 1, i + 1)];
        const d = distance(prev, next) || 1;
        // Taper only the city approaches; parallel train slots stay separated.
        const taper = Math.min(1, path.lengths[i] / 12, (path.length - path.lengths[i]) / 12);
        return [p[0] - (next[1] - prev[1]) / d * lane * taper, p[1] + (next[0] - prev[0]) / d * lane * taper];
      }));
    }
    const gap = route.n > 1 ? Math.max(tile.gap, Math.min(6, (path.length - 36 - route.n * tile.width) / (route.n - 1))) : 0;
    const span = route.n * tile.width + (route.n - 1) * gap;
    const margin = (path.length - span) / 2;
    const cells = Array.from({ length: route.n }, (_, i) => {
      const at = margin + tile.width / 2 + i * (tile.width + gap);
      const [x, y] = pointAt(path, at), p = pointAt(path, at - 0.5), q = pointAt(path, at + 0.5);
      return { x, y, angle: Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI, width: tile.width, height: tile.height, at };
    });
    return { id: route.id, ...path, d: toPath(path.points), cells, margin, gap };
  }
  function createNetwork(routes) {
    const pairs = new Map();
    for (const r of routes) {
      const key = JSON.stringify([r.a, r.b].sort());
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(r);
    }
    for (const pair of pairs.values()) pair.sort((a,b) => typeof a.id === "number" && typeof b.id === "number" ? a.id-b.id : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    return routes.map(r => {
      const pair = pairs.get(JSON.stringify([r.a, r.b].sort()));
      const direction = r.a === pair[0].a ? 1 : -1;
      const lane = (pair.indexOf(r) - (pair.length - 1) / 2) * tile.parallel * direction;
      return routeGeometry(r, lane);
    });
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  function placeLabels(entries, width, height, tracks = [], metrics = { height: 15, baseline: 11 }, options = {}) {
    const placed = [];
    // Give the crowded central cities first choice, with a stable tie break.
    const density = new Map(entries.map(p => [p.key, entries.filter(q => Math.hypot(p.x - q.x, p.y - q.y) < 90).length]));
    const ordered = [...entries].sort((a, b) =>
      (b.priority || 0) - (a.priority || 0) || density.get(b.key) - density.get(a.key) || a.key.localeCompare(b.key));
    for (const city of ordered) {
      const candidates = [Object.hasOwn(labels, city.key) ? labels[city.key] : [0, -14, "middle"]];
      for (const gap of [14, 24, 36, 50]) candidates.push(
        [0, -gap, "middle"], [0, gap + 8, "middle"],
        [gap, 4, "start"], [-gap, 4, "end"],
        [gap, -gap, "start"], [-gap, -gap, "end"],
        [gap, gap + 8, "start"], [-gap, gap + 8, "end"],
      );
      const previous = options.previous?.get(city.key);
      if (previous) candidates.unshift([previous.dx, previous.dy + metrics.baseline, "start"]);
      let best = null;
      candidates.forEach(([dx, dy, anchor], i) => {
        const box = { x: city.x + dx - city.width * (anchor === "end" ? 1 : anchor === "middle" ? 0.5 : 0), y: city.y + dy - metrics.baseline, width: city.width, height: metrics.height };
        const padded = { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 };
        const outside = box.width * box.height - overlap(box, { x: 4, y: 4, width: width - 8, height: height - 8 });
        const ex = Math.max(box.x, Math.min(city.x, box.x + box.width));
        const ey = Math.max(box.y, Math.min(city.y, box.y + box.height));
        if (options.maxLeader && Math.hypot(ex - city.x, ey - city.y) > options.maxLeader) return;
        if (options.hideColliding && (outside > .01 || placed.some(other => overlap(padded, other) > 0))) return;
        let score = i * 1.2 + Math.hypot(dx, dy) * 1.2 + outside * 300;
        for (const other of placed) score += overlap(padded, other) * 200;
        for (const other of entries) score += overlap(padded, { x: other.x - 6, y: other.y - 6, width: 12, height: 12 }) * 40;
        for (const track of tracks) score += overlap(padded, track) * 0.07;
        if (!best || score < best.score) best = { ...box, key: city.key, score };
      });
      if (best) placed.push(best);
    }
    return placed;
  }
  return { bounds, tile, cities, bends, labels, land, details, seaLabels, createNetwork, pointAt, placeLabels };
  }
  // Compatibility facade for existing geometry consumers and legacy Europe tests.
  const europe = typeof module !== "undefined" ? require("./layouts/europe-v1") : EuropeLayoutV1;
  return { ...createLayout(europe), createLayout };
})();
if (typeof module !== "undefined") module.exports = RailMap;
