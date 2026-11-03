create view public.admin_profiles with (security_invoker = true) as
    select * from public.profiles where is_admin;

create function public.touch_profile(pid uuid) returns void
language sql security invoker set search_path = '' as $$
    update public.profiles set username = username where id = pid
$$;
