create view public.admin_profiles with (security_invoker = false) as
    select * from public.profiles where is_admin;

create function public.touch_profile(pid uuid) returns void
language sql security definer as $$
    update public.profiles set username = username where id = pid
$$;
