-- Keeps the PDF of every issued RCTI so it can be opened again later.
-- Safe to run more than once.
alter table public.rctis add column if not exists pdf_path text;

insert into storage.buckets (id, name, public)
values ('rcti-pdfs', 'rcti-pdfs', false)
on conflict (id) do nothing;

-- PDFs live under <driver id>/RCTI-<number>.pdf. Office writes them; the
-- driver can read their own.
drop policy if exists "rcti pdfs: office write" on storage.objects;
create policy "rcti pdfs: office write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'rcti-pdfs' and public.is_office());
drop policy if exists "rcti pdfs: office update" on storage.objects;
create policy "rcti pdfs: office update" on storage.objects
  for update to authenticated
  using (bucket_id = 'rcti-pdfs' and public.is_office());
drop policy if exists "rcti pdfs: read own or office" on storage.objects;
create policy "rcti pdfs: read own or office" on storage.objects
  for select to authenticated
  using (bucket_id = 'rcti-pdfs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_office()));
