-- Fleet numbers for trucks and trailers: drivers pick the fleet number and the
-- rego fills in. Safe to run more than once.
alter table public.vehicles add column if not exists fleet_number text;

notify pgrst, 'reload schema';
