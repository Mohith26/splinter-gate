create table public.profiles (
    id uuid primary key references auth.users (id),
    username text,
    is_admin boolean default false
);
alter table public.profiles enable row level security;

-- policy calls auth.uid() once per row instead of once per query
create policy "own profile" on public.profiles
    for select using (id = auth.uid());

-- trusts user-editable metadata for authorization
create policy "admins see all" on public.profiles
    for select using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create table public.posts (
    id bigint generated always as identity primary key,
    author_id uuid not null references public.profiles (id),
    body text
);
-- forgot to enable RLS on posts

create table public.audit_log (
    happened_at timestamptz default now(),
    message text
);

create index posts_body_idx on public.posts (body);
create index posts_body_idx2 on public.posts (body);
