-- Driver details kept by the office: licence and employment info.
-- Run this in the Supabase SQL editor after 0001_init.sql.
alter table public.profiles
  add column licence_number text,
  add column licence_class text,
  add column licence_state text,
  add column licence_expiry date,
  add column start_date date;
