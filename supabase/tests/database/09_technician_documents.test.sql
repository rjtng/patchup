-- Technicians' documents: technicians upload to their own folder of a private
-- bucket and can remove files until they're approved; only they and admins
-- can see them; admins hear when one arrives.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

create function pg_temp.login_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.login_as_visitor() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
-- A file in the bucket, as the Storage API stores it for the signed-in person.
create function pg_temp.upload(p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('technician-documents', p_name, auth.uid(), auth.uid()::text, '{"mimetype": "image/jpeg", "size": 1000}');
$$;
-- Files and document rows the signed-in person can see.
create function pg_temp.files() returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = 'technician-documents';
$$;
create function pg_temp.documents() returns bigint language sql stable as $$
  select count(*) from public.technician_documents;
$$;
-- Lets the test delete storage rows directly (newer Storage versions refuse
-- direct deletes unless asked to allow them, as their API does).
create function pg_temp.allow_deletes() returns void language sql as $$
  select set_config('storage.allow_delete_query', 'true', true);
$$;

-- People:  ...101 Ana (customer); ...203 Pia (technician, waiting for approval);
--          ...201 Tess (approved technician); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000203', 'pia@example.com', '{"full_name": "Pia Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved' where id = '00000000-0000-0000-0000-000000000201';
delete from public.notifications; -- (approving Tess told her so)

select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'technician-documents'),
  'false 10485760 image/jpeg,image/png,image/webp,application/pdf',
  'The bucket is private, for photos and PDFs up to 10 MB'
);

-- Uploading --------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000203');
select lives_ok($$ select pg_temp.upload('00000000-0000-0000-0000-000000000203/id.jpg') $$,
  'A technician uploads a file to their own folder');
select throws_ok($$ select pg_temp.upload('00000000-0000-0000-0000-000000000201/id.jpg') $$,
  '42501', null, 'but not to another technician''s');
select throws_ok($$ select pg_temp.upload('id.jpg') $$, '42501', null, 'nor outside any folder');
select lives_ok(
  $$ insert into public.technician_documents (kind, storage_path, file_name, content_type, size_bytes)
     values ('government_id', '00000000-0000-0000-0000-000000000203/id.jpg', 'my id.jpg', 'image/jpeg', 1000) $$,
  'and says what it is'
);
select throws_ok(
  $$ insert into public.technician_documents (kind, storage_path, file_name, content_type, size_bytes)
     values ('nbi_clearance', '00000000-0000-0000-0000-000000000201/nbi.jpg', 'nbi.jpg', 'image/jpeg', 1000) $$,
  '23514', null, 'A document must be in the technician''s own folder'
);
select throws_ok(
  $$ insert into public.technician_documents (technician_id, kind, storage_path, file_name, content_type, size_bytes)
     values ('00000000-0000-0000-0000-000000000201', 'nbi_clearance', '00000000-0000-0000-0000-000000000201/nbi.jpg', 'nbi.jpg', 'image/jpeg', 1000) $$,
  '42501', null, 'and nobody adds documents for someone else'
);
select throws_ok(
  $$ insert into public.technician_documents (kind, storage_path, file_name, content_type, size_bytes)
     values ('certificate', '00000000-0000-0000-0000-000000000203/cert.docx', 'cert.docx', 'application/msword', 1000) $$,
  '23514', null, 'Only photos and PDFs'
);
select is((pg_temp.files(), pg_temp.documents())::text, '(1,1)', 'The technician sees their file and document');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select pg_temp.upload('00000000-0000-0000-0000-000000000101/id.jpg') $$,
  '42501', null, 'A customer can''t upload technician documents');

-- Who sees them ----------------------------------------------------------------------

select pg_temp.logout();
select is(
  (select array_agg(n.title || ' | ' || n.body || ' | ' || n.url) from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000901'),
  array['Pia Lim sent their government ID | Waiting for approval. Check it before approving them. | /admin/technicians/00000000-0000-0000-0000-000000000203'],
  'Admins hear a document arrived'
);
select is((select count(*) from public.notifications where user_id <> '00000000-0000-0000-0000-000000000901'), 0::bigint,
  'and nobody else does');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is((pg_temp.files(), pg_temp.documents())::text, '(0,0)', 'Customers don''t see them');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is((pg_temp.files(), pg_temp.documents())::text, '(0,0)', 'Other technicians don''t either');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.technician_documents $$, '42501', null, 'Visitors can''t read the list');
select is(pg_temp.files(), 0::bigint, 'or the files');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((pg_temp.files(), pg_temp.documents())::text, '(1,1)', 'Admins see them');

-- Removing -----------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000203');
select pg_temp.upload('00000000-0000-0000-0000-000000000203/blurry.jpg');
insert into public.technician_documents (kind, storage_path, file_name, content_type, size_bytes)
values ('nbi_clearance', '00000000-0000-0000-0000-000000000203/blurry.jpg', 'blurry.jpg', 'image/jpeg', 1000);
select pg_temp.allow_deletes();
delete from public.technician_documents where storage_path like '%/blurry.jpg';
delete from storage.objects where name like '%/blurry.jpg';
select is((pg_temp.files(), pg_temp.documents())::text, '(1,1)', 'Before approval, a technician can remove a document and its file');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select pg_temp.allow_deletes();
delete from storage.objects;
delete from public.technician_documents;
select is((pg_temp.files(), pg_temp.documents())::text, '(1,1)', 'Admins don''t delete them');
select public.set_technician_verification('00000000-0000-0000-0000-000000000203', 'approved');

select pg_temp.login_as('00000000-0000-0000-0000-000000000203');
select pg_temp.allow_deletes();
delete from public.technician_documents;
delete from storage.objects;
select is((pg_temp.files(), pg_temp.documents())::text, '(1,1)', 'Once approved, their documents stay: the record of the check');
select lives_ok($$ select pg_temp.upload('00000000-0000-0000-0000-000000000203/renewed-nbi.jpg') $$,
  'but they can still add new ones (a renewed clearance, say)');
insert into public.technician_documents (kind, storage_path, file_name, content_type, size_bytes)
values ('nbi_clearance', '00000000-0000-0000-0000-000000000203/renewed-nbi.jpg', 'renewed-nbi.jpg', 'image/jpeg', 1000);
select pg_temp.logout();
select is(
  (select n.title || ' | ' || n.body from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000901' order by n.created_at desc limit 1),
  'Pia Lim sent their NBI clearance | They''re already approved.',
  'and admins hear about those too'
);
select is(
  (select count(*) from public.technician_documents where technician_id = '00000000-0000-0000-0000-000000000203'),
  2::bigint,
  'Pia keeps both: her ID and the renewed clearance'
);

select * from finish();
rollback;
