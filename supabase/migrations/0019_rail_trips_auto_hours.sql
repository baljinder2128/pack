-- Billa, 2026-10-14:
--  * Rail bases to Pacific National are trips (kind 'rail'), with the base ID and
--    the docket number (in job_ref). Base IDs are IFRU + exactly 7 digits.
--  * Hours are logged automatically (first trip accepted or entered, to going off
--    duty), so drivers can no longer add, change or delete hours. Office can.
--  * Pre-trip checks record a Visy trailer number.
--  * Drivers on duty more than 14 hours are taken off duty and the breach is recorded.
-- Safe to run more than once.
alter table public.trips add column if not exists kind text not null default 'load';
alter table public.trips add column if not exists base_id text;
alter table public.trips drop constraint if exists trips_kind_check;
alter table public.trips add constraint trips_kind_check check (kind in ('load', 'rail'));
alter table public.trips drop constraint if exists trips_base_id_check;
alter table public.trips add constraint trips_base_id_check check (base_id is null or base_id ~ '^IFRU[0-9]{7}$');
alter table public.trips drop constraint if exists trips_rail_details_check;
alter table public.trips add constraint trips_rail_details_check
  check (kind <> 'rail' or (base_id is not null and coalesce(job_ref, '') <> ''));

alter table public.inspections add column if not exists visy_trailer text;

alter table public.profiles add column if not exists duty_breach_at timestamptz;

drop policy if exists "shifts: insert own or office" on public.shifts;
drop policy if exists "shifts: office insert" on public.shifts;
create policy "shifts: office insert" on public.shifts
  for insert with check (public.is_office());
drop policy if exists "shifts: update own or office" on public.shifts;
drop policy if exists "shifts: office update" on public.shifts;
create policy "shifts: office update" on public.shifts
  for update using (public.is_office()) with check (public.is_office());
drop policy if exists "shifts: delete own or office" on public.shifts;
drop policy if exists "shifts: office delete" on public.shifts;
create policy "shifts: office delete" on public.shifts
  for delete using (public.is_office());

notify pgrst, 'reload schema';
