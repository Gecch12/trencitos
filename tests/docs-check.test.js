'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspect } = require('../scripts/check-docs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trencitos-docs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'docs/work'), { recursive: true });
  for (const file of ['AGENTS.md', 'docs/README.md', 'docs/work/README.md']) fs.writeFileSync(path.join(root, file), '# Índice\n');
  fs.writeFileSync(path.join(root, 'docs/sources.json'), '{}');
  function item(id, extra = {}, body = '') {
    const metadata = { id, status: 'planned', parent: null, depends_on: [], branch: null, delivery: 'none', updated: '2026-10-31', ...extra };
    fs.writeFileSync(path.join(root, `docs/work/${id}.md`), `---\n${JSON.stringify(metadata)}\n---\n# Trabajo\n${body}\n`);
  }
  return { root, item };
}
test('valid hierarchy resolves from files; local links are checked and sample code is ignored', t => {
  const { root, item } = fixture(t);
  item('parent', {}, '[Índice](../README.md#seccion)\n```md\n[Ejemplo](inexistente.md)\n```');
  item('child', { parent: 'parent' });
  assert.deepEqual(inspect(root).errors, []);
  fs.unlinkSync(path.join(root, 'docs/README.md'));
  assert.ok(inspect(root).errors.some(e => e.includes('enlace inexistente')));
});
test('missing dependencies and cycles in both relationship types fail', t => {
  const { root, item } = fixture(t);
  item('a', { parent: 'b', depends_on: ['b', 'missing'] });
  item('b', { parent: 'a', depends_on: ['a'] });
  const errors = inspect(root).errors;
  assert.ok(errors.some(e => e.includes('referencia inexistente missing')));
  assert.ok(errors.some(e => e.includes('Ciclo parent')));
  assert.ok(errors.some(e => e.includes('Ciclo depends_on')));
});
test('done cannot conceal open children, dependencies or acceptance steps', t => {
  const { root, item } = fixture(t);
  item('parent', { status: 'done', depends_on: ['dependency'] }, '- [ ] Aceptación pendiente');
  item('child', { parent: 'parent', status: 'active' });
  item('dependency', { status: 'dropped' });
  const errors = inspect(root).errors;
  assert.ok(errors.some(e => e.includes('checklist abierta')));
  assert.ok(errors.some(e => e.includes('hijo abierto')));
  assert.ok(errors.some(e => e.includes('dependencia sin resolver')));
});
test('duplicate IDs, invalid states and broken source mappings fail', t => {
  const { root, item } = fixture(t);
  item('a'); item('b', { id: 'a', status: 'unknown' });
  fs.writeFileSync(path.join(root, 'docs/sources.json'), '{"missing.md":["missing.js"]}');
  const errors = inspect(root).errors;
  assert.ok(errors.some(e => e.includes('id duplicado')));
  assert.ok(errors.some(e => e.includes('status inválido')));
  assert.ok(errors.some(e => e.includes('documento inexistente')));
  assert.ok(errors.some(e => e.includes('fuente inexistente')));
});
