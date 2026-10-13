-- Office can delete a planned load that hasn't started yet (to fix a mistake).
-- Started and finished trips stay as records. Safe to run more than once.
drop policy if exists "trips: office delete planned" on public.trips;
create policy "trips: office delete planned" on public.trips
  for delete using (public.is_office() and status = 'planned' and started_at is null);
grant delete on public.trips to authenticated;
