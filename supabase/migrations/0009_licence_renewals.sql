-- Licence expiry alerts and renewals.
-- The licence-alerts function emails the office once per licence when it is
-- a week from expiry (licence_alert_sent_for remembers which expiry date was
-- alerted). Drivers send a photo of their renewed licence from the app; the
-- function emails it to the office and updates their expiry date.
-- Safe to run more than once.
alter table public.profiles add column if not exists licence_alert_sent_for date;

-- Drivers can no longer change their own licence details; the office (or a
-- renewal the office is emailed about) does.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_office() and auth.uid() is not null then
    new.role := old.role;
    new.hourly_rate := old.hourly_rate;
    new.active := old.active;
    new.email := old.email;
    new.pay_type := old.pay_type;
    new.employment_type := old.employment_type;
    new.tax_scale := old.tax_scale;
    new.has_study_loan := old.has_study_loan;
    new.licence_number := old.licence_number;
    new.licence_class := old.licence_class;
    new.licence_state := old.licence_state;
    new.licence_expiry := old.licence_expiry;
    new.licence_alert_sent_for := old.licence_alert_sent_for;
  end if;
  return new;
end;
$$;

create table if not exists public.licence_renewals (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete restrict,
  old_expiry date,
  new_expiry date not null,
  licence_number text,
  photo_paths text[] not null default array[]::text[],
  submitted_at timestamptz not null default now(),
  emailed_at timestamptz,
  email_error text
);
alter table public.licence_renewals enable row level security;
drop policy if exists "licence renewals: read own or office" on public.licence_renewals;
create policy "licence renewals: read own or office" on public.licence_renewals
  for select using (driver_id = auth.uid() or public.is_office());
drop policy if exists "licence renewals: send own" on public.licence_renewals;
create policy "licence renewals: send own" on public.licence_renewals
  for insert with check (driver_id = auth.uid() or public.is_office());
grant select, insert on public.licence_renewals to authenticated;

insert into storage.buckets (id, name, public)
values ('licence-photos', 'licence-photos', false)
on conflict (id) do nothing;
drop policy if exists "licence photos: upload own" on storage.objects;
create policy "licence photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'licence-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));
drop policy if exists "licence photos: read own or office" on storage.objects;
create policy "licence photos: read own or office" on storage.objects
  for select to authenticated
  using (bucket_id = 'licence-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));

notify pgrst, 'reload schema';
