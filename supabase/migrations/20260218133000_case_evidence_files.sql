insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-evidence',
  'case-evidence',
  true,
  52428800,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
    'application/zip',
    'application/x-zip-compressed'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "case_evidence_read_authenticated" on storage.objects;
create policy "case_evidence_read_authenticated"
on storage.objects
for select
using (
  bucket_id = 'case-evidence'
  and auth.uid() is not null
);

drop policy if exists "case_evidence_write_admin_analyst" on storage.objects;
create policy "case_evidence_write_admin_analyst"
on storage.objects
for insert
with check (
  bucket_id = 'case-evidence'
  and public.has_role(array['admin','analyst'])
);

drop policy if exists "case_evidence_update_admin_analyst" on storage.objects;
create policy "case_evidence_update_admin_analyst"
on storage.objects
for update
using (
  bucket_id = 'case-evidence'
  and public.has_role(array['admin','analyst'])
)
with check (
  bucket_id = 'case-evidence'
  and public.has_role(array['admin','analyst'])
);

drop policy if exists "case_evidence_delete_admin_analyst" on storage.objects;
create policy "case_evidence_delete_admin_analyst"
on storage.objects
for delete
using (
  bucket_id = 'case-evidence'
  and public.has_role(array['admin','analyst'])
);
