import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LEVELS = { INFO: 0, WARN: 1, ERROR: 2 };
// These lints read runtime statistics (index scans, dead tuples). A database
// that was created a second ago has none, so they only produce noise here.
export const STATS_LINTS = ['unused_index', 'table_bloat'];
const RELEASE_URL = 'https://github.com/supabase/splinter/releases';

export async function loadManifest({ manifest, version } = {}) {
  if (manifest) return JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const url = version
    ? `${RELEASE_URL}/download/${version}/splinter.json`
    : `${RELEASE_URL}/latest/download/splinter.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download ${url}: HTTP ${res.status}`);
  return await res.json();
}

export function listMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(dir, f));
}

export function readIgnore(file) {
  if (!file || !fs.existsSync(file)) return new Set();
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean),
  );
}

export async function runGate({
  migrationsDir,
  manifest,
  minLevel = 'WARN',
  categories = [],
  ignore = new Set(),
  includeStatsLints = false,
}) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(here, 'bootstrap.sql'), 'utf8'));
  const applied = [];
  for (const file of listMigrations(migrationsDir)) {
    try {
      await db.exec(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      await db.close();
      throw new Error(`migration ${path.basename(file)} failed: ${e.message}`);
    }
    applied.push(path.basename(file));
  }

  const findings = [];
  const skipped = [];
  let ran = 0;
  for (const lint of manifest.lints) {
    if (!includeStatsLints && STATS_LINTS.includes(lint.name)) {
      skipped.push({ name: lint.name, reason: 'needs runtime stats' });
      continue;
    }
    if (categories.length && !lint.categories.some((c) => categories.includes(c))) continue;
    if (ignore.has(lint.name)) continue;
    try {
      await db.exec('begin');
      await db.exec(manifest.setup);
      const res = await db.query(`select * from ${lint.query} as lint_row`);
      await db.exec('rollback');
      ran++;
      for (const row of res.rows) {
        if (LEVELS[row.level] < LEVELS[minLevel]) continue;
        if (ignore.has(row.cache_key)) continue;
        findings.push(row);
      }
    } catch (e) {
      await db.exec('rollback').catch(() => {});
      skipped.push({ name: lint.name, reason: e.message });
    }
  }
  await db.close();
  findings.sort((a, b) => LEVELS[b.level] - LEVELS[a.level] || a.name.localeCompare(b.name));
  return { version: manifest.version, applied, ran, skipped, findings };
}

// Some lint detail strings in splinter contain a literal backslash before
// backticks (the SQL source escapes them). Strip that for display.
const clean = (s) => String(s).replace(/\\`/g, '`');

export function formatText(result) {
  const out = [];
  out.push(
    `splinter ${result.version}: ${result.applied.length} migrations applied, ${result.ran} lints run, ${result.findings.length} findings`,
  );
  for (const f of result.findings) {
    out.push(`${f.level.padEnd(5)} ${f.name}: ${clean(f.detail)}`);
    out.push(`      ignore key: ${f.cache_key}`);
    if (f.remediation) out.push(`      ${f.remediation}`);
  }
  for (const s of result.skipped) out.push(`skipped ${s.name} (${s.reason})`);
  return out.join('\n');
}

export function formatGithub(result) {
  return result.findings
    .map((f) => {
      const kind = f.level === 'ERROR' ? 'error' : f.level === 'WARN' ? 'warning' : 'notice';
      const msg = `${clean(f.detail)} (ignore key: ${f.cache_key})`.replace(/\n/g, ' ');
      return `::${kind} title=splinter ${f.name}::${msg}`;
    })
    .join('\n');
}
