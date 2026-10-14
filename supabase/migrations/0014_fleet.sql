-- Trucks and trailers the office sets up, so drivers pick regos from a list.
-- Removing one only hides it (old trips keep their rego). Also a Visy trailer
-- number on trips. Safe to run more than once.
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('truck', 'trailer')),
  rego text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, rego)
);
alter table public.vehicles enable row level security;
drop policy if exists "vehicles: signed-in read" on public.vehicles;
create policy "vehicles: signed-in read" on public.vehicles for select using (auth.uid() is not null);
drop policy if exists "vehicles: office insert" on public.vehicles;
create policy "vehicles: office insert" on public.vehicles for insert with check (public.is_office());
drop policy if exists "vehicles: office update" on public.vehicles;
create policy "vehicles: office update" on public.vehicles for update using (public.is_office());
grant select, insert, update on public.vehicles to authenticated;

alter table public.trips add column if not exists visy_trailer text;

notify pgrst, 'reload schema';
