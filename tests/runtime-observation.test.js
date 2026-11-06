"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { createRuntimeMetrics } = require('../backend/runtime-metrics');
const { createDurableQueue } = require('../backend/durable-queue');
const { createProcessMetrics } = require('../backend/process-metrics');

test('async observation scopes stay isolated and preserve results and original errors', async () => {
  const metrics = createRuntimeMetrics(3);
  let release; const gate = new Promise(resolve => { release = resolve; });
  const first = metrics.scope(async () => {
    const value = await metrics.span('checkpointRPC', async () => { await gate; return 42; });
    return { value, spans: metrics.spans() };
  });
  const second = await metrics.scope(async () => { metrics.span('stateView', () => 7); return metrics.spans(); });
  release(); const result = await first;
  assert.equal(result.value, 42); assert.ok(result.spans.checkpointRPC >= 0);
  assert.equal(result.spans.stateView, undefined); assert.equal(second.checkpointRPC, undefined);
  assert.deepEqual(metrics.spans(), {});
  const error = new Error('original');
  assert.throws(() => metrics.span('history', () => { throw error; }), e => e === error);
  await assert.rejects(metrics.span('history', async () => { throw error; }), e => e === error);
  for (let i = 0; i < 20; i++) metrics.record('history', i);
  assert.equal(metrics.summary().history.count, 3);
});

test('operation diagnostics follow commit and cannot fail or roll back a delivered command', async () => {
  let clock = 0, state = 0, saved = 0, release; const messages = [], traces = [];
  const gate = new Promise(resolve => { release = resolve; });
  const q = createDurableQueue({ batchSize: 2, now: () => clock, capture: () => { clock += 2; return state; },
    restore: value => { state = value; }, onFailure: e => { throw e; }, commit: async () => { await gate; clock += 20; saved = state; } });
  const first = q.run(() => { clock += 3; state++; q.dirty(); q.defer(() => messages.push(saved)); }, 'draw', timing => { traces.push(timing); throw Error('observer offline'); });
  const second = q.run(() => { clock += 4; state++; q.dirty(); }, 'build', timing => traces.push(timing));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(traces.length, 0); assert.deepEqual(messages, []);
  release(); await Promise.all([first, second]); await q.idle();
  assert.deepEqual(messages, [2]); assert.equal(saved, 2); assert.equal(state, 2);
  assert.equal(traces.length, 2); assert.equal(traces[0].batchSize, 2);
  assert.equal(traces[0].executionMs, 3); assert.equal(traces[1].executionMs, 4);
  assert.equal(traces[0].batch.captureMs, 2); assert.equal(traces[0].batch.commitMs, 20);
  assert.equal(traces[0].outcome, 'committed');
  assert.deepEqual(Object.keys(traces[0]).sort(), ['batch','batchSize','executionMs','kind','outcome','queueMs','totalMs','version'].sort());
});

test('a failed write reports failure without publishing candidate state', async () => {
  let state = 0; const messages = [], traces = [];
  const q = createDurableQueue({ capture: () => state, restore: v => { state = v; }, commit: async () => { throw Error('offline'); }, onFailure: () => {} });
  await q.run(() => { state++; q.dirty(); q.defer(() => messages.push(state)); }, 'draw', t => traces.push(t));
  assert.equal(state, 0); assert.deepEqual(messages, []); assert.equal(traces[0].outcome, 'failed');
});

test('process telemetry is bounded metadata and can be stopped', async () => {
  const monitor = createProcessMetrics({ interval: 20 });
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    const sample = monitor.snapshot();
    assert.ok(sample.memoryBytes.rss > 0); assert.ok(Number.isFinite(sample.cpuPercent));
    assert.ok(Number.isFinite(sample.eventLoopDelayMs.p95));
    assert.equal(sample.env, undefined); assert.equal(sample.pid, undefined);
  } finally { monitor.close(); }
});
