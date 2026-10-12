-- SBT Trucking: trip log, driver hours and weekly RCTI.
-- Run this in the Supabase SQL editor (or `supabase db push`).

-- ---------------------------------------------------------------------------
-- Profiles: one row per login. Logins are created by office users through the
-- `manage-driver` edge function (public sign-up should be turned off).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role text not null default 'driver' check (role in ('driver', 'office')),
  phone text,
  -- Contractor details printed on the RCTI (the driver is the supplier).
  business_name text,
  abn text,
  address text,
  gst_registered boolean not null default true,
  hourly_rate numeric(10, 2) not null default 0,
  active boolean not null default true,
  -- Live tracking: only while on duty, and only after the driver agrees.
  tracking_consent_at timestamptz,
  on_duty boolean not null default false,
  on_duty_since timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_office()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'office');
$$;

-- Create a profile automatically for every new login. The role comes from
-- app_metadata, which only the service role can set.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    case when new.raw_app_meta_data ->> 'role' = 'office' then 'office' else 'driver' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Drivers may edit their own contact details, but only office can change
-- role, pay rate, login email or active status.
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
  end if;
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------------
-- Company: the single business that issues the RCTIs (the recipient).
-- ---------------------------------------------------------------------------
create table public.company (
  id int primary key default 1 check (id = 1),
  name text not null default '',
  abn text not null default '',
  address text not null default '',
  email text not null default '',
  -- Printed on every RCTI; the ATO requires a written RCTI agreement.
  rcti_agreement text not null default
    'The recipient and the supplier agree that the recipient will issue tax invoices in respect of supplies made, and the supplier will not issue tax invoices in respect of those supplies.'
);

insert into public.company (id) values (1);

-- ---------------------------------------------------------------------------
-- Trips: the trip log, entered manually and tracked by status + GPS.
-- ---------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete restrict,
  trip_date date not null default current_date,
  truck_rego text not null default '',
  trailer_rego text,
  customer text,
  job_ref text,
  pickup text not null default '',
  dropoff text not null default '',
  start_odometer integer,
  end_odometer integer,
  amount numeric(10, 2) not null default 0,
  notes text,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  started_at timestamptz,
  finished_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index trips_driver_date on public.trips (driver_id, trip_date);

-- Only office can set what a trip pays.
create or replace function public.protect_trip_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_office() and auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.amount := 0;
    else
      new.amount := old.amount;
    end if;
  end if;
  return new;
end;
$$;

create trigger trips_protect_amount
  before insert or update on public.trips
  for each row execute function public.protect_trip_amount();

-- ---------------------------------------------------------------------------
-- Shifts: driver hours, one row per shift.
-- ---------------------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete restrict,
  shift_date date not null default current_date,
  start_at timestamptz not null,
  end_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index shifts_driver_date on public.shifts (driver_id, shift_date);

-- ---------------------------------------------------------------------------
-- RCTIs: one issued statement per driver per week.
-- ---------------------------------------------------------------------------
create table public.rctis (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  driver_id uuid not null references public.profiles (id) on delete restrict,
  week_start date not null,
  week_end date not null,
  subtotal numeric(10, 2) not null,
  gst numeric(10, 2) not null,
  total numeric(10, 2) not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles (id) default auth.uid(),
  unique (driver_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.company enable row level security;
alter table public.trips enable row level security;
alter table public.shifts enable row level security;
alter table public.rctis enable row level security;

create policy "profiles: read own or office" on public.profiles
  for select using (id = auth.uid() or public.is_office());
create policy "profiles: update own or office" on public.profiles
  for update using (id = auth.uid() or public.is_office());

create policy "company: signed-in read" on public.company
  for select using (auth.uid() is not null);
create policy "company: office update" on public.company
  for update using (public.is_office());

create policy "trips: read own or office" on public.trips
  for select using (driver_id = auth.uid() or public.is_office());
create policy "trips: insert own or office" on public.trips
  for insert with check (driver_id = auth.uid() or public.is_office());
create policy "trips: update own or office" on public.trips
  for update using (driver_id = auth.uid() or public.is_office());
create policy "trips: office delete" on public.trips
  for delete using (public.is_office());

create policy "shifts: read own or office" on public.shifts
  for select using (driver_id = auth.uid() or public.is_office());
create policy "shifts: insert own or office" on public.shifts
  for insert with check (driver_id = auth.uid() or public.is_office());
create policy "shifts: update own or office" on public.shifts
  for update using (driver_id = auth.uid() or public.is_office());
create policy "shifts: delete own or office" on public.shifts
  for delete using (driver_id = auth.uid() or public.is_office());

create policy "rctis: read own or office" on public.rctis
  for select using (driver_id = auth.uid() or public.is_office());
create policy "rctis: office insert" on public.rctis
  for insert with check (public.is_office());
create policy "rctis: office update" on public.rctis
  for update using (public.is_office());

-- ---------------------------------------------------------------------------
-- Pre-trip inspections. Submitting one triggers the `send-inspection` edge
-- function, which emails it (with photos) to the office.
-- ---------------------------------------------------------------------------
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete restrict,
  trip_id uuid references public.trips (id) on delete set null,
  truck_rego text not null default '',
  trailer_rego text,
  odometer integer,
  -- [{ "key": "tyres", "label": "Tyres & wheels", "ok": true, "note": "" }, ...]
  items jsonb not null default '[]',
  safe_to_drive boolean not null default true,
  notes text,
  -- Storage paths in the `inspection-photos` bucket.
  photo_paths text[] not null default '{}',
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);

create index inspections_driver_created on public.inspections (driver_id, created_at desc);

alter table public.inspections enable row level security;

create policy "inspections: read own or office" on public.inspections
  for select using (driver_id = auth.uid() or public.is_office());
create policy "inspections: insert own or office" on public.inspections
  for insert with check (driver_id = auth.uid() or public.is_office());

insert into storage.buckets (id, name, public) values ('inspection-photos', 'inspection-photos', false);

-- Photos live under <driver id>/<inspection id>/<n>.jpg
create policy "inspection photos: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "inspection photos: read own or office" on storage.objects
  for select to authenticated
  using (bucket_id = 'inspection-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));

-- ---------------------------------------------------------------------------
-- Live tracking. The app records positions in the background only while the
-- driver is on duty and has given consent (profiles.tracking_consent_at).
-- ---------------------------------------------------------------------------
create table public.driver_locations (
  id bigserial primary key,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  speed real,
  heading real,
  recorded_at timestamptz not null default now()
);

create index driver_locations_driver_time on public.driver_locations (driver_id, recorded_at desc);

alter table public.driver_locations enable row level security;

create policy "locations: read own or office" on public.driver_locations
  for select using (driver_id = auth.uid() or public.is_office());
create policy "locations: insert own while on duty" on public.driver_locations
  for insert with check (
    driver_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.on_duty and p.tracking_consent_at is not null
    )
  );

-- Latest position for each driver who is on duty right now.
create view public.live_drivers with (security_invoker = on) as
  select distinct on (l.driver_id)
    l.driver_id, p.full_name, p.phone, p.on_duty_since, l.lat, l.lng, l.speed, l.recorded_at
  from public.driver_locations l
  join public.profiles p on p.id = l.driver_id
  where p.on_duty and l.recorded_at >= p.on_duty_since
  order by l.driver_id, l.recorded_at desc;

-- Keep 90 days of location history. Schedule with pg_cron, e.g.
--   select cron.schedule('purge-locations', '0 3 * * *', 'select public.purge_old_locations()');
create or replace function public.purge_old_locations()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.driver_locations where recorded_at < now() - interval '90 days';
$$;
