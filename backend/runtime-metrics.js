"use strict";
// Bounded aggregate timings only: never record identities, commands or payloads.
function createRuntimeMetrics(limit = 256) {
  const samples = new Map();
  function record(name, milliseconds) {
    if (!Number.isFinite(milliseconds)) return;
    const values = samples.get(name) || []; values.push(Math.max(0,milliseconds));
    if (values.length > limit) values.shift(); samples.set(name, values);
  }
  function summary() {
    return Object.fromEntries([...samples].map(([name, values]) => {
      const sorted = [...values].sort((a,b)=>a-b), round=n=>Math.round(n*100)/100;
      return [name,{count:values.length,p50:round(sorted[Math.floor((sorted.length-1)*.5)]),p95:round(sorted[Math.floor((sorted.length-1)*.95)]),max:round(sorted.at(-1))}];
    }));
  }
  return { record, summary };
}
module.exports = { createRuntimeMetrics };
