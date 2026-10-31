#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() && file.endsWith('.md') ? [file] : [];
  });
}
function inspect(root) {
  const errors = [], items = new Map();
  const relative = file => path.relative(root, file);
  const docs = path.join(root, 'docs'), work = path.join(docs, 'work');
  const files = ['AGENTS.md', 'README.md', 'QC.md'].map(file => path.join(root, file))
    .filter(file => fs.existsSync(file)).concat(walk(docs));
  for (const required of ['AGENTS.md', 'docs/README.md', 'docs/work/README.md']) {
    if (!fs.existsSync(path.join(root, required))) errors.push(`Falta entrada: ${required}`);
  }
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const prose = content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
    for (const match of prose.matchAll(/\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
      const link = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(link)) continue;
      let target;
      try { target = decodeURIComponent(link.split(/[?#]/)[0]); }
      catch { errors.push(`${relative(file)}: enlace mal codificado ${link}`); continue; }
      if (target && !fs.existsSync(path.resolve(path.dirname(file), target))) {
        errors.push(`${relative(file)}: enlace inexistente ${link}`);
      }
    }
    if (!file.startsWith(work + path.sep) || path.basename(file) === 'README.md') continue;
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) { errors.push(`${relative(file)}: falta frontmatter JSON`); continue; }
    let item;
    try { item = JSON.parse(match[1]); }
    catch { errors.push(`${relative(file)}: frontmatter JSON inválido`); continue; }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${relative(file)}: metadata debe ser un objeto`); continue;
    }
    const statuses = ['idea', 'planned', 'active', 'blocked', 'validated', 'done', 'dropped'];
    const deliveries = ['none', 'worktree', 'integrated', 'released'];
    const id = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
    if (!id(item.id)) { errors.push(`${relative(file)}: id inválido`); continue; }
    if (items.has(item.id)) errors.push(`${relative(file)}: id duplicado ${item.id}`);
    if (!statuses.includes(item.status)) errors.push(`${item.id}: status inválido`);
    if (!deliveries.includes(item.delivery)) errors.push(`${item.id}: delivery inválido`);
    if (item.parent !== null && !id(item.parent)) errors.push(`${item.id}: parent inválido`);
    if (item.branch !== null && !(typeof item.branch === 'string' && item.branch.trim())) errors.push(`${item.id}: branch inválido`);
    if (!Array.isArray(item.depends_on) || item.depends_on.some(value => !id(value))) {
      errors.push(`${item.id}: depends_on debe ser una lista de IDs`);
      item.depends_on = [];
    }
    if (new Set(item.depends_on).size !== item.depends_on.length) errors.push(`${item.id}: dependencia duplicada`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.updated || '') ||
        !Number.isFinite(Date.parse(item.updated)) || new Date(item.updated).toISOString().slice(0, 10) !== item.updated) {
      errors.push(`${item.id}: fecha updated inválida`);
    }
    if (item.status === 'done' && /^\s*- \[ \]/m.test(content.slice(match[0].length))) {
      errors.push(`${item.id}: tarea done con checklist abierta`);
    }
    items.set(item.id, { ...item, file: relative(file) });
  }
  for (const item of items.values()) {
    for (const target of [...item.depends_on, ...(item.parent ? [item.parent] : [])]) {
      if (!items.has(target)) errors.push(`${item.id}: referencia inexistente ${target}`);
    }
    const parent = items.get(item.parent);
    if (parent?.status === 'done' && !['done', 'dropped'].includes(item.status)) {
      errors.push(`${parent.id}: padre done con hijo abierto ${item.id}`);
    }
    if (item.status === 'done') for (const target of item.depends_on) {
      if (items.has(target) && items.get(target).status !== 'done') errors.push(`${item.id}: dependencia sin resolver ${target}`);
    }
  }
  for (const relation of ['parent', 'depends_on']) {
    const visiting = new Set(), visited = new Set();
    function visit(id, chain = []) {
      if (visiting.has(id)) { errors.push(`Ciclo ${relation}: ${[...chain, id].join(' -> ')}`); return; }
      if (visited.has(id) || !items.has(id)) return;
      visiting.add(id);
      const item = items.get(id), targets = relation === 'parent' ? (item.parent ? [item.parent] : []) : item.depends_on;
      for (const target of targets) visit(target, [...chain, id]);
      visiting.delete(id); visited.add(id);
    }
    for (const id of items.keys()) visit(id);
  }
  const sourceFile = path.join(docs, 'sources.json');
  let sources = {};
  try {
    sources = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    if (!sources || Array.isArray(sources) || typeof sources !== 'object') throw new Error();
    for (const [doc, paths] of Object.entries(sources)) {
      if (!fs.existsSync(path.join(docs, doc))) errors.push(`sources.json: documento inexistente ${doc}`);
      if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || !p)) {
        errors.push(`sources.json: rutas inválidas para ${doc}`); continue;
      }
      for (const p of paths) if (!fs.existsSync(path.join(root, p))) errors.push(`sources.json: fuente inexistente ${p}`);
    }
  } catch { errors.push('Falta docs/sources.json válido'); }
  return { errors, items, files, sources };
}
function main(args) {
  let root = path.resolve(__dirname, '..'), base = null, index = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--index') index = true;
    else if (['--root', '--base'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const flag = args[i++];
      if (flag === '--root') root = path.resolve(args[i]); else base = args[i];
    } else throw new Error('Uso: node scripts/check-docs.js [--index] [--base REF] [--root DIR]');
  }
  const result = inspect(root);
  if (result.errors.length) { result.errors.forEach(e => console.error(`ERROR ${e}`)); return 1; }
  if (index) for (const item of result.items.values()) {
    console.log(`${item.id} | ${item.status} | ${item.delivery} | ${item.branch || '-'} | padre: ${item.parent || '-'} | depende: ${item.depends_on.join(', ') || '-'} | ${item.file}`);
  }
  if (base) {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    const changes = new Set([...git(['diff', '--name-only', '-z', base, '--']), ...git(['ls-files', '--others', '--exclude-standard', '-z'])]);
    for (const [doc, sources] of Object.entries(result.sources)) {
      const affected = [...changes].filter(file => sources.some(source => source.endsWith('/') ? file.startsWith(source) : file === source));
      if (affected.length) console.log(`REVISAR docs/${doc}: ${affected.join(', ')}${changes.has(`docs/${doc}`) ? ' (documento también modificado)' : ''}`);
    }
    console.log('REVISAR solicita contraste semántico; no demuestra drift ni exige editar texto correcto.');
  }
  console.log(`OK: ${result.files.length} documentos, ${result.items.size} fichas. No se validan URLs externas ni anclas.`);
  return 0;
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { inspect };
