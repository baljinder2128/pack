-- End-of-day runsheets: the driver photographs their paper runsheet and submits it.
-- Photos live in the runsheet-photos bucket under <driver id>/<runsheet id>/<n>.jpg.
-- Safe to run more than once. (0011 lets drivers delete unchecked runsheets.)
create table if not exists public.runsheets (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete restrict,
  run_date date not null,
  truck_rego text,
  notes text,
  photo_paths text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id)
);
create index if not exists runsheets_driver_date on public.runsheets (driver_id, run_date);

alter table public.runsheets enable row level security;
drop policy if exists "runsheets: read own or office" on public.runsheets;
create policy "runsheets: read own or office" on public.runsheets
  for select using (driver_id = auth.uid() or public.is_office());
drop policy if exists "runsheets: submit own" on public.runsheets;
create policy "runsheets: submit own" on public.runsheets
  for insert with check (driver_id = auth.uid() or public.is_office());
drop policy if exists "runsheets: office review" on public.runsheets;
create policy "runsheets: office review" on public.runsheets
  for update using (public.is_office());
grant select, insert, update on public.runsheets to authenticated;

insert into storage.buckets (id, name, public)
values ('runsheet-photos', 'runsheet-photos', false)
on conflict (id) do nothing;
drop policy if exists "runsheet photos: upload own" on storage.objects;
create policy "runsheet photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'runsheet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));
drop policy if exists "runsheet photos: read own or office" on storage.objects;
create policy "runsheet photos: read own or office" on storage.objects
  for select to authenticated
  using (bucket_id = 'runsheet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));

notify pgrst, 'reload schema';
