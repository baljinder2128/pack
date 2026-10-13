-- Day or night shift, and rail bases (IFRU + 7 digits).
-- Night shift: drivers log each base they load (load number + base ID); the count goes in the day report.
-- Rail: on a trip, drivers log bases taken to Pacific National (base ID + docket number).
-- Safe to run more than once.
alter table public.profiles add column if not exists shift_type text not null default 'day';
alter table public.profiles drop constraint if exists profiles_shift_type_check;
alter table public.profiles add constraint profiles_shift_type_check check (shift_type in ('day', 'night'));

create table if not exists public.bases (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('night_load', 'rail')),
  base_id text not null check (base_id ~ '^IFRU[0-9]{7}$'),
  load_number text,
  docket_number text,
  trip_id uuid references public.trips (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (kind <> 'night_load' or coalesce(load_number, '') <> ''),
  check (kind <> 'rail' or coalesce(docket_number, '') <> '')
);
create index if not exists bases_driver_created on public.bases (driver_id, created_at);
create index if not exists bases_trip on public.bases (trip_id);

alter table public.bases enable row level security;
drop policy if exists "bases: read own or office" on public.bases;
create policy "bases: read own or office" on public.bases for select using (driver_id = auth.uid() or public.is_office());
drop policy if exists "bases: add own or office" on public.bases;
create policy "bases: add own or office" on public.bases for insert with check (driver_id = auth.uid() or public.is_office());
drop policy if exists "bases: fix own or office" on public.bases;
create policy "bases: fix own or office" on public.bases for update using (driver_id = auth.uid() or public.is_office());
drop policy if exists "bases: remove own or office" on public.bases;
create policy "bases: remove own or office" on public.bases for delete using (driver_id = auth.uid() or public.is_office());
grant select, insert, update, delete on public.bases to authenticated;

notify pgrst, 'reload schema';
