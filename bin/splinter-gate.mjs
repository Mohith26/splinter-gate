#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadManifest, readIgnore, runGate, formatText, formatGithub, LEVELS } from '../src/gate.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    level: { type: 'string', default: 'WARN' },
    category: { type: 'string', multiple: true, default: [] },
    ignore: { type: 'string', default: '.splinterignore' },
    manifest: { type: 'string' },
    version: { type: 'string' },
    format: { type: 'string', default: 'text' },
    'include-stats-lints': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const usage = `usage: splinter-gate [migrations-dir] [options]

Applies your migrations to a throwaway in-process Postgres (PGlite) and runs
Supabase's splinter lints against it. Exits 1 if anything at or above --level
is found.

  --level ERROR|WARN|INFO      minimum level that fails (default WARN)
  --category SECURITY|PERFORMANCE   only run lints in this category (repeatable)
  --ignore FILE                cache keys or lint names to ignore (default .splinterignore)
  --manifest FILE              use a local splinter.json instead of downloading
  --version TAG                download a specific splinter release (default latest)
  --format text|json|github    output format (github = Actions annotations)
  --include-stats-lints        also run unused_index and table_bloat`;

if (values.help) {
  console.log(usage);
  process.exit(0);
}
if (!(values.level in LEVELS)) {
  console.error(`unknown level ${values.level}`);
  process.exit(2);
}

try {
  const manifest = await loadManifest(values);
  const result = await runGate({
    migrationsDir: positionals[0] ?? 'supabase/migrations',
    manifest,
    minLevel: values.level,
    categories: values.category,
    ignore: readIgnore(values.ignore),
    includeStatsLints: values['include-stats-lints'],
  });
  if (values.format === 'json') console.log(JSON.stringify(result, null, 2));
  else if (values.format === 'github') {
    const annotations = formatGithub(result);
    if (annotations) console.log(annotations);
    console.log(formatText(result));
  } else console.log(formatText(result));
  process.exit(result.findings.length ? 1 : 0);
} catch (e) {
  console.error(`splinter-gate: ${e.message}`);
  process.exit(2);
}
