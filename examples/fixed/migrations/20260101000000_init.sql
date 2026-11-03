create table public.profiles (
    id uuid primary key references auth.users (id),
    username text,
    is_admin boolean default false
);
alter table public.profiles enable row level security;

create policy "own profile" on public.profiles
    for select using (id = (select auth.uid()));

create table public.posts (
    id bigint generated always as identity primary key,
    author_id uuid not null references public.profiles (id),
    body text
);
alter table public.posts enable row level security;
create policy "read own posts" on public.posts
    for select using (author_id = (select auth.uid()));
create index posts_author_id_idx on public.posts (author_id);

create table public.audit_log (
    id bigint generated always as identity primary key,
    happened_at timestamptz default now(),
    message text
);
alter table public.audit_log enable row level security;
create policy "service only" on public.audit_log
    for select to service_role using (true);

create index posts_body_idx on public.posts (body);
