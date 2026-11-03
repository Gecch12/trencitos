"use strict";

function connected(routes, a, b) {
  const adjacency = new Map();
  for (const route of routes) {
    if (!adjacency.has(route.a)) adjacency.set(route.a, []);
    if (!adjacency.has(route.b)) adjacency.set(route.b, []);
    adjacency.get(route.a).push(route.b);
    adjacency.get(route.b).push(route.a);
  }
  const seen = new Set([a]), stack = [a];
  while (stack.length) {
    const city = stack.pop();
    if (city === b) return true;
    for (const next of adjacency.get(city) || []) if (!seen.has(next)) {
      seen.add(next);stack.push(next);
    }
  }
  return false;
}

function connectionPath(routes, a, b) {
  const queue = [a], previous = new Map([[a, null]]);
  for (const city of queue) {
    if (city === b) break;
    for (const route of routes) {
      const next = route.a === city ? route.b : route.b === city ? route.a : null;
      if (next !== null && !previous.has(next)) {
        previous.set(next, { city, id: route.id });queue.push(next);
      }
    }
  }
  if (!previous.has(b)) return [];
  const path = [];
  for (let city = b; city !== a;) {
    const step = previous.get(city);path.unshift(step.id);city = step.city;
  }
  return path;
}

// A trail may revisit cities, but each physical lane can be used only once.
// Bit positions are local edge positions, never IDs from the map.
function longestTrail(routes) {
  const adjacency = new Map();
  routes.forEach((route, index) => {
    for (const city of [route.a, route.b]) {
      if (!adjacency.has(city)) adjacency.set(city, []);
      adjacency.get(city).push(index);
    }
  });
  let best = { length: 0, routes: [], cities: [] };
  const path = [], cities = [];
  function walk(city, used, length) {
    cities.push(city);
    if (length > best.length) best = { length, routes: [...path], cities: [...cities] };
    for (const index of adjacency.get(city) || []) {
      const mask = 1n << BigInt(index);
      if (used & mask) continue;
      const route = routes[index];path.push(route.id);
      walk(route.a === city ? route.b : route.a, used | mask, length + route.length);
      path.pop();
    }
    cities.pop();
  }
  for (const city of adjacency.keys()) walk(city, 0n, 0);
  return best;
}

module.exports = { connected, connectionPath, longestTrail };
