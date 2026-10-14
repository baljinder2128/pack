-- Drivers accept a planned load (the office is emailed), and the office can
-- change which email address gets the app's emails (Company details screen).
-- Safe to run more than once.
alter table public.trips add column if not exists accepted_at timestamptz;
alter table public.company add column if not exists office_email text not null default 'sbtruckin@outlook.com';

notify pgrst, 'reload schema';
