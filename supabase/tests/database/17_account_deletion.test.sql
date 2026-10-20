-- Deleting an account: who can't yet, removing their files first, then what
-- goes, what's kept without saying who, and that the account can't sign in.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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
create function pg_temp.booking(p_item text) returns uuid language sql stable as $$
  select id from public.bookings where appliance = p_item;
$$;
-- A plumbing booking for p_customer with Tess, in p_status.
create function pg_temp.job(p_item text, p_customer uuid, p_technician uuid, p_status public.booking_status) returns void
language sql as $$
  insert into public.bookings (customer_id, technician_id, category_id, appliance, brand, problem, scheduled_at, status,
                               street, barangay, city, province, landmark, latitude, longitude, inspection_fee, final_amount)
  select p_customer, p_technician, c.id, p_item, 'Moen', 'Leaks under the sink near the window', now() - interval '1 day',
         p_status, '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 'Blue gate', 14.57, 121.06, 300,
         case when p_status = 'completed' then 300 end
  from public.service_categories c where c.slug = 'plumbing';
$$;
-- A file in a bucket, as the Storage API stores it.
create function pg_temp.file(p_bucket text, p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata) values (p_bucket, p_name, '{"mimetype": "image/jpeg", "size": 1000}');
$$;
create function pg_temp.files(p_bucket text) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = p_bucket;
$$;
create function pg_temp.remove_files(p_bucket text) returns void language plpgsql as $$
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = p_bucket;
end;
$$;

-- People:  ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers); ...901 an admin
insert into auth.users (id, email, phone, raw_user_meta_data, encrypted_password) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '639171234567', '{"full_name": "Ana Santos"}', 'hash'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', null, '{"full_name": "Ben Reyes"}', 'hash'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', null, '{"full_name": "Tess Cruz", "role": "technician"}', 'hash'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', null, '{"full_name": "Rey Tan", "role": "technician"}', 'hash'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', null, '{"full_name": "Ops Admin"}', 'hash');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles
set verification_status = 'approved', is_available = true, bio = 'Plumber for 10 years', city = 'Pasig', years_experience = 10
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id)
select '00000000-0000-0000-0000-000000000201', id from public.service_categories where slug = 'plumbing';

-- Ana: an address, a mobile number, a phone for notifications, a finished job with a
-- photo, a review and messages, and a cancelled one.
insert into public.addresses (user_id, label, street, barangay, city, province)
values ('00000000-0000-0000-0000-000000000101', 'Bahay', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');
insert into public.phone_numbers (user_id, phone) values ('00000000-0000-0000-0000-000000000101', '+639171234567');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-000000000101', 'https://fcm.googleapis.com/fcm/send/abc', 'key', 'secret');
select pg_temp.job('Sink', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'completed');
select pg_temp.job('Faucet', '00000000-0000-0000-0000-000000000101', null, 'cancelled');
select pg_temp.file('booking-photos', pg_temp.booking('Sink') || '/sink.jpg');
insert into public.booking_photos (booking_id, storage_path) values (pg_temp.booking('Sink'), pg_temp.booking('Sink') || '/sink.jpg');
insert into public.reviews (booking_id, customer_id, technician_id, rating, comment, customer_name)
values (pg_temp.booking('Sink'), '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 5, 'Quick and tidy', 'Ana');
insert into public.messages (booking_id, sender_id, technician_id, body) values
  (pg_temp.booking('Sink'), '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'The gate is blue'),
  (pg_temp.booking('Sink'), '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000201', 'On my way');
-- Tess: her documents. Ben: a job Rey has accepted.
select pg_temp.file('technician-documents', '00000000-0000-0000-0000-000000000201/id.jpg');
insert into public.technician_documents (technician_id, kind, file_name, content_type, size_bytes, storage_path)
values ('00000000-0000-0000-0000-000000000201', 'government_id', 'id.jpg', 'image/jpeg', 1000,
        '00000000-0000-0000-0000-000000000201/id.jpg');
select pg_temp.job('Shower', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'accepted');

-- Who can't yet -------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(public.account_deletion_blocker(), 'You have a booking that isn''t finished. Cancel it, or wait until the job is done.',
  'A customer with a booking under way can''t delete their account yet');
select throws_ok($$ select * from public.start_account_deletion() $$, 'P0001',
  'You have a booking that isn''t finished. Cancel it, or wait until the job is done.', 'and starting is refused');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is(public.account_deletion_blocker(), 'You have a job that isn''t finished. Give it back, or finish it first.',
  'nor can its technician');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(public.account_deletion_blocker(),
  'Admins can''t delete their account. Ask another admin to remove your admin role first.', 'nor an admin');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.start_account_deletion() $$, '42501', null, 'Visitors can''t start');

-- A customer -----------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(public.account_deletion_blocker(), null, 'A customer whose bookings are all finished can');
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'Start deleting your account again.',
  'Deleting needs starting first');
select pg_temp.remove_files('booking-photos');
select pg_temp.logout();
select is(pg_temp.files('booking-photos'), 1::bigint, 'Before starting, a finished job''s photos can''t be removed');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select array_agg(bucket || ' ' || path) from public.start_account_deletion()),
  array['booking-photos ' || pg_temp.booking('Sink') || '/sink.jpg'],
  'Starting lists their files'
);
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'Some of your files weren''t removed. Try again.',
  'which must be removed first');
select pg_temp.remove_files('booking-photos');
select pg_temp.logout();
select is(pg_temp.files('booking-photos'), 0::bigint, 'Once started, they can remove them');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok($$ select public.delete_my_account() $$, 'and then delete their account');
select pg_temp.logout();

select is(
  (select count(*) from public.addresses where user_id = '00000000-0000-0000-0000-000000000101')
  + (select count(*) from public.phone_numbers where user_id = '00000000-0000-0000-0000-000000000101')
  + (select count(*) from public.push_subscriptions where user_id = '00000000-0000-0000-0000-000000000101')
  + (select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000101'),
  0::bigint,
  'Their addresses, mobile number, phones and notifications are gone'
);
select is(
  (select count(*) from public.booking_photos) || ' photos, '
    || (select string_agg(body, ', ') from public.messages),
  '0 photos, On my way',
  'and so are their photos and messages (the technician''s stay)'
);
select is(
  (select full_name || '|' || coalesce(avatar_url, '') from public.profiles where id = '00000000-0000-0000-0000-000000000101'),
  '|',
  'Their profile no longer has their name'
);
select is(
  (select street || ' | ' || landmark || ' | ' || brand || ' | ' || problem || ' | ' || coalesce(latitude::text, 'no pin')
   from public.bookings where appliance = 'Sink'),
  'Removed |  |  | Removed when the customer deleted their account | no pin',
  'Their bookings no longer say where they live or what they wrote'
);
select is(
  (select status || ' ' || final_amount::int || ' ' || barangay || ', ' || city from public.bookings where appliance = 'Sink'),
  'completed 300 San Antonio, Pasig',
  'but the job and what was paid are kept'
);
select is(
  (select rating || ' ' || comment || ' by "' || customer_name || '"' from public.reviews),
  '5 Quick and tidy by ""',
  'Their review keeps its rating, without their name'
);
select is(
  (select email || ' ' || coalesce(phone, 'no phone') || ' ' || raw_user_meta_data::text || ' ' || (banned_until > now() + interval '50 years')
   from auth.users where id = '00000000-0000-0000-0000-000000000101'),
  'deleted-00000000-0000-0000-0000-000000000101@deleted.invalid no phone {} true',
  'Their sign-in has no email, details or password, and is barred'
);

-- A technician ------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select array_agg(bucket || ' ' || path) from public.start_account_deletion()),
  array['technician-documents 00000000-0000-0000-0000-000000000201/id.jpg'],
  'A technician''s files are their documents'
);
select pg_temp.remove_files('technician-documents');
select pg_temp.logout();
select is(pg_temp.files('technician-documents'), 0::bigint, 'which they can remove, even once approved');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.delete_my_account() $$, 'A technician deletes their account');
select pg_temp.logout();
select is(
  (select verification_status || ' ' || is_available || ' "' || bio || '" "' || city || '" ' || coalesce(years_experience::text, '-')
   from public.technician_profiles where id = '00000000-0000-0000-0000-000000000201'),
  'suspended false "" "" -',
  'Their work profile is blanked, and off the list'
);
select is(
  (select count(*) from public.technician_documents) + (select count(*) from public.technician_services),
  0::bigint,
  'Their documents and services are gone'
);
select is((select count(*) from public.bookings where technician_id = '00000000-0000-0000-0000-000000000201'), 1::bigint,
  'Their jobs are kept');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is((select count(*) from public.technician_profiles where id = '00000000-0000-0000-0000-000000000201'), 0::bigint,
  'Customers no longer see them');
select pg_temp.logout();

-- The window ------------------------------------------------------------------------------
select pg_temp.job('Tank', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'completed');
select pg_temp.file('booking-photos', pg_temp.booking('Tank') || '/tank.jpg');
insert into private.account_deletions (user_id, requested_at)
values ('00000000-0000-0000-0000-000000000102', now() - interval '2 hours');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select pg_temp.remove_files('booking-photos');
select throws_ok($$ select public.delete_my_account() $$, 'P0001', null, 'Starting is good for an hour');
select pg_temp.logout();
select is(pg_temp.files('booking-photos'), 1::bigint, 'after which their files can''t be removed');

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select throws_ok($$ select * from private.account_deletions $$, '42501', null, 'Nobody can read the deletions directly');
select pg_temp.logout();

select * from finish();
rollback;
