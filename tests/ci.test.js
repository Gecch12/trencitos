'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { documentationOnly, validationScope, verifyResults, main } = require('../scripts/ci');

test('only prose and QA evidence qualify; runtime fixtures and unknown paths run everything', () => {
  for (const file of ['README.md', 'AGENTS.md', 'docs/production.md', 'docs/work/continuous-delivery.md',
    'docs/qa/release/result.json', 'docs/qa/release/live.jpg', 'skills/trencitos-publicar/SKILL.md']) {
    assert.equal(documentationOnly(file), true, file);
  }
  for (const file of ['docs/references/south-america-v3.3-source.json', 'docs/references/fixture.md',
    'docs/qa/verify.js', 'docs/sources.json', 'skills/trencitos-publicar/scripts/build.js',
    '.github/workflows/ci.yml', 'render.yaml', 'package-lock.json', 'frontend/app.js',
    'tests/fixtures/example.md', 'new-file']) assert.equal(documentationOnly(file), false, file);
});

test('Git ranges cover multi-commit pushes, PRs, deletions and renames; missing bases run everything', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-ci-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), content); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=CI Test', '-c', 'user.email=ci@example.test', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '-q'); write('server.js', 'initial'); write('README.md', 'initial'); const base = commit();
  const scope = (sha, before = base, eventName = 'push') => validationScope({ cwd, sha, eventName,
    event: { before, pull_request: { base: { sha: before } } } });
  write('docs/production.md', 'evidence'); const docs = commit();
  assert.equal(scope(docs), 'docs'); assert.equal(scope(docs, base, 'pull_request'), 'docs');
  assert.equal(scope(docs, base, 'workflow_dispatch'), 'full');
  assert.equal(scope(docs, base, 'unknown'), 'full');
  assert.equal(scope(docs, '0'.repeat(40)), 'full');
  assert.equal(scope(docs, 'a'.repeat(40)), 'full');
  assert.equal(scope(docs, '--all'), 'full');
  assert.equal(scope(docs, docs), 'full');
  write('server.js', 'changed'); commit(); write('docs/production.md', 'more evidence'); const multi = commit();
  assert.equal(scope(multi, docs), 'full'); assert.equal(scope(multi, docs, 'pull_request'), 'full');
  git('mv', 'server.js', 'docs/moved.md'); const renamed = commit();
  assert.equal(scope(renamed, multi), 'full');
  git('rm', 'README.md'); const deleted = commit(); assert.equal(scope(deleted, renamed), 'docs');
  const eventFile = path.join(cwd, 'event.json'), output = path.join(cwd, 'output'), summary = path.join(cwd, 'summary');
  fs.writeFileSync(eventFile, '{}');
  main('scope', { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventFile,
    GITHUB_SHA: deleted, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary });
  assert.equal(fs.readFileSync(output, 'utf8'), 'scope=full\n');
  assert.match(fs.readFileSync(summary, 'utf8'), /full/);
});

test('aggregate gate rejects failed, cancelled, missing or unexpectedly skipped required jobs', () => {
  const result = (scope = 'full') => ({ checks: { result: 'success', outputs: { scope } },
    node: { result: scope === 'full' ? 'success' : 'skipped' }, browser: { result: scope === 'full' ? 'success' : 'skipped' } });
  assert.match(verifyResults(result()), /Full validation passed/);
  assert.match(verifyResults(result('docs')), /not a full release validation/);
  for (const job of ['checks', 'node', 'browser']) for (const status of ['failure', 'cancelled', 'skipped', undefined]) {
    const needs = result(); needs[job].result = status; assert.throws(() => verifyResults(needs), undefined, `${job}: ${status}`);
  }
  for (const job of ['node', 'browser']) {
    const needs = result('docs'); needs[job].result = 'failure'; assert.throws(() => verifyResults(needs));
  }
  const invalid = result(); delete invalid.checks.outputs.scope; assert.throws(() => verifyResults(invalid));
  assert.throws(() => verifyResults({}));
  assert.throws(() => main('verify', { CI_NEEDS: JSON.stringify(invalid) }));
});
