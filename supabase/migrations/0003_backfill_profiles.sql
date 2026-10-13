-- Gives every existing login a profile row. Logins created before
-- 0001_init.sql was run (or added in the Supabase dashboard before the
-- trigger existed) have none, so they never appear on the Drivers page.
-- Safe to run more than once.
insert into public.profiles (id, full_name, email, role)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  u.email,
  case when u.raw_app_meta_data ->> 'role' = 'office' then 'office' else 'driver' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Fill in the login email on profiles that are missing it.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;
