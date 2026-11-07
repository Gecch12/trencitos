'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// Only prose and recorded evidence qualify. In particular docs/references
// contains game fixtures, and code/configuration under docs must still be tested.
function documentationOnly(file) {
  return /^(?:README|AGENTS|QC)\.md$/.test(file) ||
    /^docs\/(?!references\/).+\.md$/.test(file) ||
    /^docs\/qa\/.+\.(?:json|png|jpg|jpeg|webp)$/.test(file) ||
    /^skills\/[^/]+\/SKILL\.md$/.test(file);
}

function validationScope({ eventName, event, sha, cwd = process.cwd() }) {
  // Manual validation always certifies the whole revision, including when the
  // latest commit only records a release. Unknown/incomplete events fail closed.
  if (!['push', 'pull_request'].includes(eventName)) return 'full';
  const base = eventName === 'push' ? event?.before : event?.pull_request?.base?.sha;
  if (![base, sha].every(value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value))) return 'full';
  try {
    // --no-renames includes both paths: moving code into docs is a code change.
    // Compare the whole push/PR, not just HEAD's parent, without API file limits.
    const files = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, sha, '--'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
    return files.length && files.every(documentationOnly) ? 'docs' : 'full';
  } catch { return 'full'; }
}

function verifyResults(needs) {
  const scope = needs?.checks?.outputs?.scope;
  if (needs?.checks?.result !== 'success' || !['full', 'docs'].includes(scope)) {
    throw new Error('Scope, documentation or architecture did not pass.');
  }
  const expected = scope === 'full' ? 'success' : 'skipped';
  for (const job of ['node', 'browser']) {
    if (needs[job]?.result !== expected) throw new Error(`${job}: expected ${expected}, received ${needs[job]?.result || 'missing'}.`);
  }
  return scope === 'full'
    ? 'Full validation passed: Node and every browser group.'
    : 'Documentation validation passed. Node/browser were not run; this is not a full release validation.';
}

function main(action, env = process.env) {
  if (action === 'scope') {
    const scope = validationScope({ eventName: env.GITHUB_EVENT_NAME,
      event: JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')), sha: env.GITHUB_SHA });
    fs.appendFileSync(env.GITHUB_OUTPUT, `scope=${scope}\n`);
    const message = `Validation scope: ${scope}. Manual runs always execute the full suite.`;
    console.log(message);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, message + '\n');
  } else if (action === 'verify') {
    const message = verifyResults(JSON.parse(env.CI_NEEDS));
    console.log(message);
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, message + '\n');
  } else throw new Error('Usage: node scripts/ci.js scope|verify');
}

if (require.main === module) {
  try { main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { documentationOnly, validationScope, verifyResults, main };
