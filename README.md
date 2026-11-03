# splinter-gate

splinter-gate runs Supabase's database advisor checks on your migrations in CI, before a migration ever reaches a real project. The advisor lints live in [supabase/splinter](https://github.com/supabase/splinter), and since July 2026 each release ships a `splinter.json` manifest with every lint as a separate query. This tool uses that manifest.

What it does:

1. Starts a throwaway Postgres inside the Node process with [PGlite](https://github.com/electric-sql/pglite) (no Docker, no database server).
2. Creates a small stand-in for what a Supabase project already has (`anon` / `authenticated` / `service_role` roles, `auth.users`, `auth.uid()`, `auth.jwt()`, and the default grants on `public`). See `src/bootstrap.sql`.
3. Applies your migrations in file-name order.
4. Downloads the latest `splinter.json` release and runs each lint in its own transaction.
5. Prints findings and exits 1 if anything at or above `--level` is left after your ignore list.

## Usage

```sh
npm install
node bin/splinter-gate.mjs supabase/migrations            # fail on WARN and ERROR
node bin/splinter-gate.mjs supabase/migrations --level ERROR
node bin/splinter-gate.mjs supabase/migrations --category SECURITY --format github
```

Ignore known findings by putting cache keys (or whole lint names) in `.splinterignore`, one per line. The cache key is printed under each finding.

In GitHub Actions it is one step after checkout and `npm install`:

```sh
node bin/splinter-gate.mjs supabase/migrations --format github
```

`--format github` emits `::error` / `::warning` annotations so findings show up on the PR.

## Result on the examples

`examples/bad` is a small schema with common mistakes (a table without RLS, a policy that reads `user_metadata`, a security definer view, `auth.uid()` called per row, a duplicate index, an unindexed foreign key). `examples/fixed` is the same schema with each one fixed.

```
$ node bin/splinter-gate.mjs examples/bad/migrations --level INFO
splinter 2026.09.1: 2 migrations applied, 27 lints run, 14 findings
ERROR rls_disabled_in_public: Table `public.posts` is public, but RLS has not been enabled.
ERROR rls_disabled_in_public: Table `public.audit_log` is public, but RLS has not been enabled.
ERROR rls_references_user_metadata: Table `public.profiles` has a row level security policy `admins see all` that references Supabase Auth `user_metadata`. ...
ERROR security_definer_view: View `public.admin_profiles` is defined with the SECURITY DEFINER property
WARN  anon_security_definer_function_executable: Function `public.touch_profile(pid uuid)` can be executed by the `anon` role ...
WARN  auth_rls_initplan: ... (2 policies)
WARN  authenticated_security_definer_function_executable: ...
WARN  duplicate_index: Table `public.posts` has identical indexes {posts_body_idx,posts_body_idx2}. ...
WARN  function_search_path_mutable: Function `public.touch_profile` has a role mutable search_path
WARN  multiple_permissive_policies: ... (anon and authenticated)
INFO  no_primary_key: Table `public.audit_log` does not have a primary key
INFO  unindexed_foreign_keys: Table `public.posts` has a foreign key `posts_author_id_fkey` without a covering index. ...
(exit 1)

$ node bin/splinter-gate.mjs examples/fixed/migrations --level INFO
splinter 2026.09.1: 2 migrations applied, 27 lints run, 0 findings
(exit 0)
```

All 29 lints in splinter 2026.09.1 ran on PGlite without errors. The whole run takes about a second on my laptop.

## Tests

```sh
npm test
```

The tests pin `test/splinter-2026.09.1.json` so they do not depend on the network. They check that the bad example trips the expected lints, the fixed example is clean, the level filter and ignore file work, and a broken migration is reported by file name.

## Limitations

- PGlite is Postgres 18 compiled to WebAssembly. Hosted Supabase runs 15 or 17, so catalog details could differ in edge cases.
- The Supabase bootstrap is a minimal stand-in, not the real platform schema. Lints about Storage buckets, pg_graphql, queues, and extension versions have nothing to look at here, so they will not fire unless your migrations create those objects.
- `unused_index` and `table_bloat` read runtime statistics, which a brand new database does not have, so they are skipped unless you pass `--include-stats-lints`.
- Some lint `detail` strings in splinter contain a literal backslash before backticks. I strip it for display only.

MIT licensed. splinter itself is maintained by Supabase.
