-- Drivers paid as TFN employees get a weekly payslip (tax, super, leave and
-- year to date) instead of an RCTI. Safe to run more than once.
alter table public.profiles
  add column if not exists pay_type text not null default 'abn',
  add column if not exists employment_type text not null default 'casual',
  add column if not exists tax_scale text not null default 'tft',
  add column if not exists has_study_loan boolean not null default false,
  add column if not exists super_fund text,
  add column if not exists super_member_no text;

alter table public.profiles drop constraint if exists profiles_pay_type_check;
alter table public.profiles add constraint profiles_pay_type_check check (pay_type in ('abn', 'tfn'));
alter table public.profiles drop constraint if exists profiles_employment_type_check;
alter table public.profiles add constraint profiles_employment_type_check
  check (employment_type in ('full_time', 'part_time', 'casual'));
alter table public.profiles drop constraint if exists profiles_tax_scale_check;
alter table public.profiles add constraint profiles_tax_scale_check
  check (tax_scale in ('tft', 'no_tft', 'foreign', 'no_tfn'));

-- Only office can change how someone is paid or taxed.
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
    new.pay_type := old.pay_type;
    new.employment_type := old.employment_type;
    new.tax_scale := old.tax_scale;
    new.has_study_loan := old.has_study_loan;
  end if;
  return new;
end;
$$;

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  number serial unique,
  employee_id uuid not null references public.profiles (id) on delete restrict,
  week_start date not null,
  week_end date not null,
  pay_date date not null,
  hours numeric(8, 2) not null default 0,
  gross numeric(10, 2) not null,
  tax numeric(10, 2) not null,
  stsl numeric(10, 2) not null default 0,
  net numeric(10, 2) not null,
  super numeric(10, 2) not null,
  annual_leave numeric(8, 2) not null default 0,
  personal_leave numeric(8, 2) not null default 0,
  ytd_gross numeric(12, 2) not null,
  ytd_tax numeric(12, 2) not null,
  ytd_super numeric(12, 2) not null,
  pdf_path text,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles (id) default auth.uid(),
  unique (employee_id, week_start)
);

alter table public.payslips enable row level security;
drop policy if exists "payslips: read own or office" on public.payslips;
create policy "payslips: read own or office" on public.payslips
  for select using (employee_id = auth.uid() or public.is_office());
drop policy if exists "payslips: office insert" on public.payslips;
create policy "payslips: office insert" on public.payslips
  for insert with check (public.is_office());
drop policy if exists "payslips: office update" on public.payslips;
create policy "payslips: office update" on public.payslips
  for update using (public.is_office());
grant select, insert, update on public.payslips to authenticated;
grant usage on sequence public.payslips_number_seq to authenticated;

insert into storage.buckets (id, name, public)
values ('payslip-pdfs', 'payslip-pdfs', false)
on conflict (id) do nothing;

-- PDFs live under <employee id>/Payslip-<number>.pdf.
drop policy if exists "payslip pdfs: office write" on storage.objects;
create policy "payslip pdfs: office write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payslip-pdfs' and public.is_office());
drop policy if exists "payslip pdfs: office update" on storage.objects;
create policy "payslip pdfs: office update" on storage.objects
  for update to authenticated
  using (bucket_id = 'payslip-pdfs' and public.is_office());
drop policy if exists "payslip pdfs: read own or office" on storage.objects;
create policy "payslip pdfs: read own or office" on storage.objects
  for select to authenticated
  using (bucket_id = 'payslip-pdfs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));

notify pgrst, 'reload schema';
