import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate, readIgnore, loadManifest } from '../src/gate.mjs';

const manifest = await loadManifest({ manifest: new URL('./splinter-2026.09.1.json', import.meta.url).pathname });
const ex = (name) => new URL(`../examples/${name}/migrations`, import.meta.url).pathname;

test('bad example trips the expected lints', async () => {
  const r = await runGate({ migrationsDir: ex('bad'), manifest, minLevel: 'INFO' });
  const names = new Set(r.findings.map((f) => f.name));
  for (const n of [
    'rls_disabled_in_public',
    'rls_references_user_metadata',
    'security_definer_view',
    'auth_rls_initplan',
    'duplicate_index',
    'function_search_path_mutable',
    'anon_security_definer_function_executable',
    'unindexed_foreign_keys',
    'no_primary_key',
  ]) {
    assert.ok(names.has(n), `expected ${n}`);
  }
  assert.equal(r.skipped.filter((s) => s.reason !== 'needs runtime stats').length, 0);
});

test('fixed example is clean at every level', async () => {
  const r = await runGate({ migrationsDir: ex('fixed'), manifest, minLevel: 'INFO' });
  assert.deepEqual(r.findings, []);
});

test('level threshold filters INFO findings', async () => {
  const r = await runGate({ migrationsDir: ex('bad'), manifest, minLevel: 'ERROR' });
  assert.ok(r.findings.length > 0);
  assert.ok(r.findings.every((f) => f.level === 'ERROR'));
});

test('ignore file accepts cache keys and lint names', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  const file = path.join(dir, '.splinterignore');
  fs.writeFileSync(file, '# comment\nduplicate_index\nrls_disabled_in_public_public_audit_log\n');
  const r = await runGate({ migrationsDir: ex('bad'), manifest, minLevel: 'INFO', ignore: readIgnore(file) });
  assert.ok(!r.findings.some((f) => f.name === 'duplicate_index'));
  assert.ok(!r.findings.some((f) => f.cache_key === 'rls_disabled_in_public_public_audit_log'));
  assert.ok(r.findings.some((f) => f.cache_key === 'rls_disabled_in_public_public_posts'));
});

test('a broken migration is reported with its file name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
  fs.writeFileSync(path.join(dir, '001.sql'), 'create table oops (');
  await assert.rejects(runGate({ migrationsDir: dir, manifest }), /migration 001.sql failed/);
});
