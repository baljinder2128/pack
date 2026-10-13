-- Once a week's RCTI or payslip is issued, that week's hours leave the driver's app:
-- they can't see, add, change or delete them. Office still can (then re-issues).
-- Safe to run more than once.
create or replace function public.pay_locked(driver uuid, day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.rctis r where r.driver_id = driver and day between r.week_start and r.week_end)
      or exists (select 1 from public.payslips p where p.employee_id = driver and day between p.week_start and p.week_end);
$$;

drop policy if exists "shifts: read own or office" on public.shifts;
create policy "shifts: read own or office" on public.shifts
  for select using (public.is_office() or (driver_id = auth.uid() and not public.pay_locked(driver_id, shift_date)));
drop policy if exists "shifts: insert own or office" on public.shifts;
create policy "shifts: insert own or office" on public.shifts
  for insert with check (public.is_office() or (driver_id = auth.uid() and not public.pay_locked(driver_id, shift_date)));
drop policy if exists "shifts: update own or office" on public.shifts;
create policy "shifts: update own or office" on public.shifts
  for update using (public.is_office() or (driver_id = auth.uid() and not public.pay_locked(driver_id, shift_date)))
  with check (public.is_office() or (driver_id = auth.uid() and not public.pay_locked(driver_id, shift_date)));
drop policy if exists "shifts: delete own or office" on public.shifts;
create policy "shifts: delete own or office" on public.shifts
  for delete using (public.is_office() or (driver_id = auth.uid() and not public.pay_locked(driver_id, shift_date)));

notify pgrst, 'reload schema';
