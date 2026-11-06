"use strict";
const { AsyncLocalStorage } = require('node:async_hooks');
// Bounded aggregate timings only: never record identities, commands or payloads.
function createRuntimeMetrics(limit = 256) {
  const samples = new Map(), context = new AsyncLocalStorage();
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
  // Scopes follow async commits without attaching diagnostics to domain state.
  function scope(work) { return context.run({}, work); }
  function span(name, work) {
    const started = performance.now(), current = context.getStore();
    const finish = () => {
      const ms = performance.now() - started;
      try { record(name, ms); if (current) current[name] = (current[name] || 0) + ms; } catch { /* Observation cannot fail a command. */ }
    };
    let result;
    try { result = work(); } catch (error) { finish(); throw error; }
    if (result && typeof result.then === 'function') return result.then(value => { finish(); return value; }, error => { finish(); throw error; });
    finish(); return result;
  }
  return { record, summary, scope, span, spans: () => ({ ...context.getStore() }) };
}
module.exports = { createRuntimeMetrics };
