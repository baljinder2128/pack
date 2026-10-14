-- Customer pick-up and drop-off places the office sets up, so drivers choose
-- them from a list. Removing one only hides it. Safe to run more than once.
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  use_for text not null default 'both' check (use_for in ('pickup', 'dropoff', 'both')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, address)
);
alter table public.places enable row level security;
drop policy if exists "places: signed-in read" on public.places;
create policy "places: signed-in read" on public.places for select using (auth.uid() is not null);
drop policy if exists "places: office insert" on public.places;
create policy "places: office insert" on public.places for insert with check (public.is_office());
drop policy if exists "places: office update" on public.places;
create policy "places: office update" on public.places for update using (public.is_office());
grant select, insert, update on public.places to authenticated;

notify pgrst, 'reload schema';
