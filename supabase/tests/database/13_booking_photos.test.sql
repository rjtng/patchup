-- Booking photos: customers add up to three to their own bookings until the
-- job is done; whoever can see the booking can see them (its technician, and
-- technicians who could take the open request); nobody else.
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
  values ('booking-photos', p_name, auth.uid(), auth.uid()::text, '{"mimetype": "image/jpeg", "size": 1000}');
$$;
create function pg_temp.add(p_booking uuid, p_file text) returns void language sql as $$
  insert into public.booking_photos (booking_id, storage_path) values (p_booking, p_booking || '/' || p_file);
$$;
-- Photos and files the signed-in person can see.
create function pg_temp.seen() returns text language sql stable as $$
  select (select count(*) from public.booking_photos) || ' photos, '
      || (select count(*) from storage.objects where bucket_id = 'booking-photos') || ' files';
$$;
create function pg_temp.allow_deletes() returns void language sql as $$
  select set_config('storage.allow_delete_query', 'true', true);
$$;

-- People:  ...101 Ana, ...102 Ben (customers)
--          ...201 Tess (approved plumber, taking jobs); ...202 Rey (approved electrician)
--          ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id)
select t.id::uuid, c.id
from (values ('00000000-0000-0000-0000-000000000201', 'plumbing'), ('00000000-0000-0000-0000-000000000202', 'electrical')) t (id, slug)
join public.service_categories c on c.slug = t.slug;

-- Bookings: Ana's open plumbing request (...b1) and her finished one (...b2); Ben's (...b3).
insert into public.bookings (id, customer_id, technician_id, category_id, appliance, problem, scheduled_at,
                             street, barangay, city, province, inspection_fee, status)
select v.id::uuid, v.customer::uuid, v.technician::uuid, c.id, 'Sink', 'Leaking', now() + interval '1 day',
       '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300, v.status::public.booking_status
from (values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000101', null, 'requested'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'completed'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000102', null, 'requested')
) v (id, customer, technician, status)
join public.service_categories c on c.slug = 'plumbing';

select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'booking-photos'),
  'false 5242880 image/jpeg,image/png,image/webp',
  'The bucket is private, for photos up to 5 MB'
);

-- Adding ------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok($$ select pg_temp.upload('00000000-0000-0000-0000-0000000000b1/sink.jpg') $$,
  'A customer uploads a photo to their booking''s folder');
select lives_ok($$ select pg_temp.add('00000000-0000-0000-0000-0000000000b1', 'sink.jpg') $$, 'and adds it to the booking');
select throws_ok($$ select pg_temp.upload('00000000-0000-0000-0000-0000000000b3/sink.jpg') $$,
  '42501', null, 'but not to someone else''s booking');
select throws_ok($$ select pg_temp.add('00000000-0000-0000-0000-0000000000b3', 'sink.jpg') $$,
  '42501', null, 'nor add one to it');
select throws_ok($$ select pg_temp.upload('00000000-0000-0000-0000-0000000000b2/after.jpg') $$,
  '42501', null, 'Nor to a booking that''s done');
select throws_ok($$ select pg_temp.add('00000000-0000-0000-0000-0000000000b2', 'after.jpg') $$,
  '42501', null, 'nor add one to it');
select throws_ok($$ select pg_temp.upload('sink.jpg') $$, '42501', null, 'Files go in a booking''s folder');
select throws_ok(
  $$ insert into public.booking_photos (booking_id, storage_path)
     values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3/sink.jpg') $$,
  '23514', null, 'and a photo''s file is in its own booking''s folder'
);
select pg_temp.upload('00000000-0000-0000-0000-0000000000b1/pipe.jpg');
select pg_temp.upload('00000000-0000-0000-0000-0000000000b1/floor.jpg');
select pg_temp.add('00000000-0000-0000-0000-0000000000b1', 'pipe.jpg');
select lives_ok($$ select pg_temp.add('00000000-0000-0000-0000-0000000000b1', 'floor.jpg') $$, 'Up to three photos');
select throws_ok($$ select pg_temp.add('00000000-0000-0000-0000-0000000000b1', 'fourth.jpg') $$,
  'P0001', 'A booking can have up to 3 photos', 'and no more');
select is(pg_temp.seen(), '3 photos, 3 files', 'The customer sees their photos');

-- Seeing ------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.seen(), '3 photos, 3 files', 'A technician who could take the open request sees them');
select throws_ok($$ select pg_temp.upload('00000000-0000-0000-0000-0000000000b1/mine.jpg') $$,
  '42501', null, 'but can''t add one');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is(pg_temp.seen(), '0 photos, 0 files', 'A technician in another service doesn''t see them');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.seen(), '0 photos, 0 files', 'nor does another customer');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(pg_temp.seen(), '3 photos, 3 files', 'Admins see them');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.booking_photos $$, '42501', null, 'Visitors can''t see any');

select pg_temp.logout();
update public.bookings set technician_id = '00000000-0000-0000-0000-000000000201', status = 'accepted'
where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.seen(), '3 photos, 3 files', 'Once accepted, the technician doing the job still sees them');

-- Removing ----------------------------------------------------------------------------
select pg_temp.allow_deletes();
delete from public.booking_photos;
delete from storage.objects where bucket_id = 'booking-photos';
select pg_temp.logout();
select is(pg_temp.seen(), '3 photos, 3 files', 'The technician can''t remove them');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select pg_temp.allow_deletes();
delete from public.booking_photos where storage_path like '%/floor.jpg';
delete from storage.objects where name like '%/floor.jpg';
select is(pg_temp.seen(), '2 photos, 2 files', 'The customer removes one');

select pg_temp.logout();
update public.bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select pg_temp.allow_deletes();
delete from public.booking_photos;
delete from storage.objects where bucket_id = 'booking-photos';
select is(pg_temp.seen(), '2 photos, 2 files', 'Once the job is done the photos stay');
select throws_ok($$ select pg_temp.add('00000000-0000-0000-0000-0000000000b1', 'later.jpg') $$,
  '42501', null, 'and no more can be added');

select * from finish();
rollback;
