-- Office can remove reviewed inspections and trips from the lists. Nothing is
-- deleted: the row is stamped archived_at and stays in the archive for good.
alter table public.inspections
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id);
alter table public.trips
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id);

create policy "inspections: office update" on public.inspections
  for update using (public.is_office());

-- Records are permanent: no more hard deletes of trips.
drop policy if exists "trips: office delete" on public.trips;

-- Only office can archive or restore.
create or replace function public.protect_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_office() and auth.uid() is not null then
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

create trigger trips_protect_archive
  before update on public.trips
  for each row execute function public.protect_archive();
create trigger inspections_protect_archive
  before update on public.inspections
  for each row execute function public.protect_archive();
