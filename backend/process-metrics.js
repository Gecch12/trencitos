"use strict";
const { monitorEventLoopDelay, PerformanceObserver, performance } = require('node:perf_hooks');

// Process-wide samples, never per-player labels. Timers do not keep Node alive.
function createProcessMetrics({ record = () => {}, interval = 5000 } = {}) {
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  let cpu = process.cpuUsage(), at = performance.now(), utilization = performance.eventLoopUtilization();
  let latest = null;
  const gc = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) record('gc', entry.duration);
  });
  gc.observe({ entryTypes: ['gc'] });
  function sample() {
    const now = performance.now(), used = process.cpuUsage(cpu), elapsed = now - at;
    const nextUtilization = performance.eventLoopUtilization();
    const busy = performance.eventLoopUtilization(nextUtilization, utilization);
    latest = {
      sampledAt: new Date().toISOString(), intervalMs: Math.round(elapsed),
      cpuPercent: elapsed > 0 ? Math.round((used.user + used.system) / (elapsed * 10) * 100) / 100 : 0,
      eventLoopUtilization: Math.round(busy.utilization * 10000) / 10000,
      eventLoopDelayMs: { p50: delay.percentile(50) / 1e6, p95: delay.percentile(95) / 1e6, max: delay.max / 1e6 },
      memoryBytes: process.memoryUsage(),
    };
    cpu = process.cpuUsage(); at = now; utilization = nextUtilization; delay.reset();
  }
  const timer = setInterval(sample, interval); timer.unref();
  return { snapshot: () => ({ uptimeSeconds: Math.floor(process.uptime()), ...latest }), close() { clearInterval(timer); delay.disable(); gc.disconnect(); } };
}
module.exports = { createProcessMetrics };
