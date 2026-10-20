-- Profile photos and Top technicians: people add and remove their own photo;
-- a current photo is seen by whoever sees the profile (other files only by
-- their owner); Top technicians lists approved technicians taking jobs, those
-- nearby first, by weighted rating; deleting an account removes the photo.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);
-- (Supabase guards storage.objects against deletes outside the Storage API; these stand in for it.)
select set_config('storage.allow_delete_query', 'true', true);

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
-- A photo file, as the Storage API stores it (as whoever is signed in).
create function pg_temp.photo(p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata) values ('avatars', p_name, '{"mimetype": "image/jpeg", "size": 1000}');
$$;
-- The photo files the signed-in person can see, by name.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(name, ', ' order by name), '') from storage.objects where bucket_id = 'avatars';
$$;
-- Top technicians, as "name (city)".
create function pg_temp.top(p_city text default null, p_max integer default 10) returns text language sql as $$
  select string_agg(full_name, ', ') from public.top_technicians(p_city, p_max);
$$;

-- People: ...101 Ana, ...102 Ben (customers); approved technicians ...201 Tess (Pasig),
-- ...202 Rey (Cebu), ...203 Carlo (Cebu), ...204 Lito (Pasig, not taking jobs),
-- ...206 Joy (only a hidden service); ...205 Mila (not approved yet); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'carlo@example.com', '{"full_name": "Carlo Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000204', 'lito@example.com', '{"full_name": "Lito Ramos", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000205', 'mila@example.com', '{"full_name": "Mila Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000206', 'joy@example.com', '{"full_name": "Joy Uy", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles t
set verification_status = case when t.id = '00000000-0000-0000-0000-000000000205' then 'pending' else 'approved' end::public.verification_status,
    is_available = t.id <> '00000000-0000-0000-0000-000000000204',
    city = v.city, rating_avg = v.rating, rating_count = v.reviews
from (values ('00000000-0000-0000-0000-000000000201'::uuid, 'Pasig', 4.5, 10),
             ('00000000-0000-0000-0000-000000000202'::uuid, 'Cebu', 5.0, 1),
             ('00000000-0000-0000-0000-000000000203'::uuid, 'Cebu', 4.8, 20),
             ('00000000-0000-0000-0000-000000000204'::uuid, 'Pasig', 5.0, 50),
             ('00000000-0000-0000-0000-000000000205'::uuid, 'Pasig', 5.0, 50),
             ('00000000-0000-0000-0000-000000000206'::uuid, 'Pasig', 5.0, 50)) v(id, city, rating, reviews)
where t.id = v.id;
update public.service_categories set is_active = false where slug = 'carpentry';
insert into public.technician_services (technician_id, category_id)
select v.id::uuid, c.id from public.service_categories c
join (values ('00000000-0000-0000-0000-000000000201', 'plumbing'), ('00000000-0000-0000-0000-000000000202', 'plumbing'),
             ('00000000-0000-0000-0000-000000000202', 'electrical'), ('00000000-0000-0000-0000-000000000203', 'electrical'),
             ('00000000-0000-0000-0000-000000000203', 'carpentry'), ('00000000-0000-0000-0000-000000000204', 'plumbing'),
             ('00000000-0000-0000-0000-000000000205', 'plumbing'), ('00000000-0000-0000-0000-000000000206', 'carpentry')) v(id, slug)
  on v.slug = c.slug;
-- Ana's finished job with Tess: each sees the other.
insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                             street, barangay, city, province, inspection_fee, final_amount, completed_at)
select '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', c.id, 'Sink', 'Leaking',
       now() - interval '1 day', 'completed', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300, 300, now()
from public.service_categories c where c.slug = 'plumbing';

-- Adding a photo --------------------------------------------------------------------------------
select is(
  (select public::text || ' ' || file_size_limit || ' ' || array_to_string(allowed_mime_types, ',')
   from storage.buckets where id = 'avatars'),
  'false 2097152 image/jpeg,image/png,image/webp',
  'Photos are in a private bucket, small images only'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok(
  $$ select pg_temp.photo('00000000-0000-0000-0000-000000000101/me.jpg') $$,
  'Ana adds a photo to her folder'
);
select lives_ok(
  $$ update public.profiles set avatar_url = '00000000-0000-0000-0000-000000000101/me.jpg'
     where id = '00000000-0000-0000-0000-000000000101' $$,
  'and makes it her profile photo'
);
select throws_ok(
  $$ select pg_temp.photo('00000000-0000-0000-0000-000000000102/me.jpg') $$,
  '42501', null, 'She can''t add one to someone else''s folder'
);
select throws_ok(
  $$ update public.profiles set avatar_url = '00000000-0000-0000-0000-000000000201/new.jpg'
     where id = '00000000-0000-0000-0000-000000000101' $$,
  '23514', null, 'or use someone else''s photo as hers'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select pg_temp.photo('00000000-0000-0000-0000-000000000201/old.jpg');
select pg_temp.photo('00000000-0000-0000-0000-000000000201/new.jpg');
update public.profiles set avatar_url = '00000000-0000-0000-0000-000000000201/new.jpg'
where id = '00000000-0000-0000-0000-000000000201';

-- Who sees them --------------------------------------------------------------------------------
select pg_temp.login_as_visitor();
select is(pg_temp.seen(), '00000000-0000-0000-0000-000000000201/new.jpg',
  'Visitors see an approved technician''s current photo');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.seen(), '00000000-0000-0000-0000-000000000201/new.jpg',
  'and so do customers, but not another customer''s');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  pg_temp.seen(),
  '00000000-0000-0000-0000-000000000101/me.jpg, 00000000-0000-0000-0000-000000000201/new.jpg, 00000000-0000-0000-0000-000000000201/old.jpg',
  'A technician sees their customers'' photos, and all their own files'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  pg_temp.seen(),
  '00000000-0000-0000-0000-000000000101/me.jpg, 00000000-0000-0000-0000-000000000201/new.jpg',
  'A customer sees their own and their technician''s, not the technician''s old one'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(
  pg_temp.seen(),
  '00000000-0000-0000-0000-000000000101/me.jpg, 00000000-0000-0000-0000-000000000201/new.jpg',
  'Admins see everyone''s current photo'
);

-- Removing ---------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
delete from storage.objects where name = '00000000-0000-0000-0000-000000000201/new.jpg';
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select count(*)::int from storage.objects where name = '00000000-0000-0000-0000-000000000201/new.jpg'),
  1,
  'Nobody removes someone else''s photo'
);
delete from storage.objects where name = '00000000-0000-0000-0000-000000000201/old.jpg';
select is(
  (select count(*)::int from storage.objects where name = '00000000-0000-0000-0000-000000000201/old.jpg'),
  0,
  'People remove their own'
);

-- Top technicians -----------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.top(), 'Carlo Lim, Tess Cruz, Rey Tan',
  'Top technicians: by rating, where a single 5-star review counts for less than many good ones');
select is(pg_temp.top('pasig '), 'Tess Cruz, Carlo Lim, Rey Tan', 'Those in the customer''s city come first');
select is(pg_temp.top(null, 2), 'Carlo Lim, Tess Cruz', 'As many as asked for');
select is(
  (select count(*)::int from public.top_technicians() where full_name in ('Lito Ramos', 'Mila Cruz', 'Joy Uy')),
  0,
  'Not those not taking jobs, not approved yet, or in no shown service'
);
select is(
  (select services from public.top_technicians() where full_name = 'Carlo Lim'),
  array['Electrical'],
  'Each with the shown services they do'
);
select is(
  (select array_length(services, 1) from public.top_technicians() where full_name = 'Rey Tan'),
  2,
  'all of them'
);
select is(
  (select city || ' ' || rating_avg || ' ' || rating_count from public.top_technicians() where full_name = 'Tess Cruz'),
  'Pasig 4.50 10',
  'with their city and rating'
);
select pg_temp.login_as_visitor();
select is(pg_temp.top(), 'Carlo Lim, Tess Cruz, Rey Tan', 'Visitors see them too');

-- Deleting an account removes the photo ------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select array_agg(bucket || ' ' || path) from public.start_account_deletion()),
  array['avatars 00000000-0000-0000-0000-000000000101/me.jpg'],
  'Deleting an account lists the photo with the other files'
);
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'Some of your files weren''t removed. Try again.',
  'which must be removed first');
delete from storage.objects where name = '00000000-0000-0000-0000-000000000101/me.jpg';
select lives_ok($$ select public.delete_my_account() $$, 'Once removed, the account is deleted');
select pg_temp.logout();
select is(
  (select avatar_url from public.profiles where id = '00000000-0000-0000-0000-000000000101'),
  null,
  'and the profile has no photo'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-000000000101/%'),
  0,
  'nor any file left'
);

select * from finish();
rollback;
