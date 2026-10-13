-- A driver can delete their own runsheet (e.g. a wrong or blurry photo) until the
-- office has checked it, then send a new one. Office can delete any runsheet.
-- Safe to run more than once.
drop policy if exists "runsheets: delete own unchecked or office" on public.runsheets;
create policy "runsheets: delete own unchecked or office" on public.runsheets
  for delete using (public.is_office() or (driver_id = auth.uid() and reviewed_at is null));
grant delete on public.runsheets to authenticated;

drop policy if exists "runsheet photos: delete own or office" on storage.objects;
create policy "runsheet photos: delete own or office" on storage.objects
  for delete to authenticated
  using (bucket_id = 'runsheet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));

notify pgrst, 'reload schema';
