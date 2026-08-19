insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume-files',
  'resume-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin can read resume files" on storage.objects;
create policy "Admin can read resume files"
on storage.objects for select
to authenticated
using (bucket_id = 'resume-files' and private.is_app_admin());

drop policy if exists "Admin can upload resume files" on storage.objects;
create policy "Admin can upload resume files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'resume-files' and private.is_app_admin());

drop policy if exists "Admin can update resume files" on storage.objects;
create policy "Admin can update resume files"
on storage.objects for update
to authenticated
using (bucket_id = 'resume-files' and private.is_app_admin())
with check (bucket_id = 'resume-files' and private.is_app_admin());

drop policy if exists "Admin can delete resume files" on storage.objects;
create policy "Admin can delete resume files"
on storage.objects for delete
to authenticated
using (bucket_id = 'resume-files' and private.is_app_admin());
