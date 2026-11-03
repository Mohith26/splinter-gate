-- Minimal stand-in for the objects a Supabase project already has before your
-- migrations run. It is not the real Supabase schema, just enough for
-- migrations that reference auth.users / auth.uid() to apply, and for the
-- role-based lints to see the same grants a hosted project would have.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists extensions;
create schema if not exists auth;

create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb,
    raw_app_meta_data jsonb,
    created_at timestamptz default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

-- Hosted Supabase projects grant the API roles access to new objects in
-- public by default. This is what makes "RLS disabled in public" dangerous.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
