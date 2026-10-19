-- Technicians' documents, for PatchUp to check before approving them: a
-- government ID, an NBI clearance, and any certificates (TESDA and the like).
-- The files are in a private Storage bucket, in a folder per technician;
-- `technician_documents` says what each one is. Only the technician and
-- admins can see them. Admins hear when one arrives.

-- ---------------------------------------------------------------------------
-- The bucket: private; photos and PDFs up to 10 MB
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('technician-documents', 'technician-documents', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files go in "<technician id>/<anything>". Technicians upload to their own
-- folder, and can remove files until they're approved (after that the
-- documents are the record of the check). Admins can read them all.
create policy "Technician documents: technicians upload their own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'technician-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.technician_profiles t where t.id = (select auth.uid()))
  );

create policy "Technician documents: technicians and admins can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'technician-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
  );

create policy "Technician documents: technicians remove theirs until approved"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'technician-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.technician_profiles t
      where t.id = (select auth.uid()) and t.verification_status in ('pending', 'rejected')
    )
  );

-- ---------------------------------------------------------------------------
-- What each file is
-- ---------------------------------------------------------------------------

create type public.document_kind as enum ('government_id', 'nbi_clearance', 'certificate');

create table public.technician_documents (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null default auth.uid() references public.technician_profiles (id) on delete cascade,
  kind public.document_kind not null,
  -- Where the file is in the bucket: always in the technician's own folder.
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = technician_id::text)
);

create index technician_documents_technician_id_idx on public.technician_documents (technician_id, uploaded_at);

alter table public.technician_documents enable row level security;

revoke all on public.technician_documents from anon, authenticated;
grant all on public.technician_documents to service_role;
grant select, delete on public.technician_documents to authenticated;
grant insert (technician_id, kind, storage_path, file_name, content_type, size_bytes) on public.technician_documents to authenticated;

create policy "Technicians and admins see documents"
  on public.technician_documents for select to authenticated
  using (technician_id = (select auth.uid()) or (select private.is_admin()));

create policy "Technicians add their own documents"
  on public.technician_documents for insert to authenticated
  with check (technician_id = (select auth.uid()));

create policy "Technicians remove theirs until approved"
  on public.technician_documents for delete to authenticated
  using (
    technician_id = (select auth.uid())
    and exists (
      select 1 from public.technician_profiles t
      where t.id = (select auth.uid()) and t.verification_status in ('pending', 'rejected')
    )
  );

-- ---------------------------------------------------------------------------
-- Telling admins
-- ---------------------------------------------------------------------------

create function private.technician_document_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_status public.verification_status;
begin
  select coalesce(nullif(trim(p.full_name), ''), 'A technician'), t.verification_status
  into v_name, v_status
  from public.technician_profiles t join public.profiles p on p.id = t.id
  where t.id = new.technician_id;

  perform private.notify(
    a.id, null,
    v_name || case new.kind
      when 'government_id' then ' sent their government ID'
      when 'nbi_clearance' then ' sent their NBI clearance'
      else ' sent a certificate'
    end,
    case v_status
      when 'pending' then 'Waiting for approval. Check it before approving them.'
      when 'approved' then 'They''re already approved.'
      when 'suspended' then 'Their account is suspended.'
      else 'They weren''t approved before.'
    end,
    '/admin/technicians/' || new.technician_id
  )
  from public.profiles a
  where a.role = 'admin' and a.id <> new.technician_id;
  return null;
exception when others then
  -- Like other notifications, this must never stop the upload itself.
  raise warning 'Notification for document % not written: %', new.id, sqlerrm;
  return null;
end;
$$;

create trigger technician_documents_notify
  after insert on public.technician_documents
  for each row execute function private.technician_document_added();

revoke execute on function private.technician_document_added() from public, anon, authenticated;
