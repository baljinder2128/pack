-- Fuel dockets are sent the same way as runsheets (same table, photos and rules),
-- marked kind = 'fuel', with optional litres and cost. Safe to run more than once.
alter table public.runsheets
  add column if not exists kind text not null default 'runsheet',
  add column if not exists litres numeric(10, 2),
  add column if not exists fuel_cost numeric(10, 2);
alter table public.runsheets drop constraint if exists runsheets_kind_check;
alter table public.runsheets add constraint runsheets_kind_check check (kind in ('runsheet', 'fuel'));

notify pgrst, 'reload schema';
