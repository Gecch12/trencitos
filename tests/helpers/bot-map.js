"use strict";

// Synthetic topology for engine/bot acceptance, not a selectable product map.
// Long corridors let a normal 45-train two-player game reach its final round.
function botMap(version = "1") {
  const ids = ["__proto__", "0", "a,b", "c", "a", "b,c", "rail-90", "rail-03"];
  const cities = Array.from({ length: 8 }, (_, i) => ({ id: `town-${i}`, name: `Town ${i}` }));
  const corridors = [], routes = [];
  for (const distance of [1, 2, 3, 4]) for (let i = 0; i < (distance === 4 ? 4 : cities.length); i++) {
    const a = cities[i].id, b = cities[(i + distance) % cities.length].id, id = `corridor-${distance}-${i}`;
    corridors.push({ id, cityIds: [a, b] });
    routes.push({ id: distance === 1 ? ids[i] : distance === 2 ? `chord-${i}` : `link-${distance}-${i}`, corridorId: id, a, b,
      length: [0, 6, 8, 2, 1][distance], color: "gray", tunnel: distance < 3 && i === 2, ferry: distance < 3 && i === 4 ? 1 : 0 });
  }
  return { schemaVersion: 1, id: "bot-fixture", version, cities, corridors, routes,
    tickets: Array.from({ length: 24 }, (_, i) => ({ id: `destination-${i}`, a: cities[i % 8].id,
      b: cities[(i + 3) % 8].id, points: 10 + i % 4, kind: i < 5 ? "long" : "short" })) };
}
module.exports = { botMap };
