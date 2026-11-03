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
  const masks=routes.map((_,i)=>1n<<BigInt(i));
  const totals=new Map();
  for(const start of adjacency.keys()){
    if(totals.has(start))continue;
    const cities=new Set([start]),edges=new Set(),queue=[start];
    for(const city of queue)for(const i of adjacency.get(city)){
      edges.add(i);const r=routes[i],next=r.a===city?r.b:r.a;
      if(!cities.has(next)){cities.add(next);queue.push(next);}
    }
    const weights=[...edges].map(i=>routes[i].length).sort((a,b)=>a-b);
    const odd=[...cities].filter(city=>adjacency.get(city).length%2).length;
    // A trail has at most two odd endpoints. Each omitted lane can repair at
    // most two odd vertices, so their cheapest weights give a safe upper bound.
    const total=weights.reduce((n,w)=>n+w,0)-weights.slice(0,Math.max(0,(odd-2)/2)).reduce((n,w)=>n+w,0);
    for(const city of cities)totals.set(city,total);
  }
  let best = { length: 0, routes: [], cities: [] }, memoSize=0;
  const path = [], cities = [], seen=new Map();
  function availableFrom(start,used){
    const visited=new Set([start]),queue=[start],degrees=new Map(),weights=[];let edges=0n,total=0;
    for(const city of queue)for(const i of adjacency.get(city)){
      if((used|edges)&masks[i])continue;
      edges|=masks[i];total+=routes[i].length;weights.push(routes[i].length);
      for(const endpoint of [routes[i].a,routes[i].b])degrees.set(endpoint,(degrees.get(endpoint)||0)+1);
      const next=routes[i].a===city?routes[i].b:routes[i].a;
      if(!visited.has(next)){visited.add(next);queue.push(next);}
    }
    const odd=[...degrees.values()].filter(n=>n%2).length;
    return total-weights.sort((a,b)=>a-b).slice(0,Math.max(0,(odd-2)/2)).reduce((n,w)=>n+w,0);
  }
  function walk(city, used, length, ceiling) {
    if(best.length>=ceiling)return;
    let visited=seen.get(city);if(visited?.has(used))return;
    // Identical city + used lanes has identical remaining possibilities. Cap
    // memo storage only, never the exact search or its result.
    if(memoSize<200000){if(!visited){visited=new Set();seen.set(city,visited);}visited.add(used);memoSize++;}
    cities.push(city);
    if (length > best.length) best = { length, routes: [...path], cities: [...cities] };
    if(length+availableFrom(city,used)>best.length)for (const index of adjacency.get(city) || []) {
      if (used & masks[index]) continue;
      const route = routes[index];path.push(route.id);
      walk(route.a === city ? route.b : route.a, used | masks[index], length + route.length,ceiling);
      path.pop();if(best.length>=ceiling)break;
    }
    cities.pop();
  }
  // Odd endpoints first quickly find Euler trails in networks with loops. The
  // component's parity bound is an exact upper bound, not a heuristic score.
  const starts=[...adjacency.keys()].sort((a,b)=>(adjacency.get(b).length%2)-(adjacency.get(a).length%2));
  for (const city of starts) walk(city, 0n, 0,totals.get(city));
  return best;
}

module.exports = { connected, connectionPath, longestTrail };
