-- Office can delete an RCTI from the pay archive (and its saved PDF).
-- One RCTI per driver per week is already enforced by unique (driver_id, week_start):
-- re-issuing a week updates the same RCTI and keeps its number. RCTI and payslip
-- numbers come from separate sequences, so every RCTI number is different and
-- payslips have their own numbers. A deleted RCTI's number is not reused.
-- Safe to run more than once.
drop policy if exists "rctis: office delete" on public.rctis;
create policy "rctis: office delete" on public.rctis
  for delete using (public.is_office());
grant delete on public.rctis to authenticated;

drop policy if exists "rcti pdfs: office delete" on storage.objects;
create policy "rcti pdfs: office delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'rcti-pdfs' and public.is_office());

notify pgrst, 'reload schema';
