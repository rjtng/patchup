-- Who can see and change what: sign-up, profiles, technicians, categories,
-- addresses. Run with `npx supabase test db` (needs the local Supabase stack).
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Act as a signed-in user or a signed-out visitor.
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

-- People:  ...101 Ana (customer)      ...102 Ben (customer)
--          ...201 Tess (technician, approved, plumbing)
--          ...203 Paz (technician, waiting for approval)
--          ...901 an admin            ...666 someone trying to sign up as admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'paz@example.com', '{"full_name": "Paz Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}'),
  ('00000000-0000-0000-0000-000000000666', 'sneaky@example.com', '{"full_name": "Sneaky", "role": "admin"}');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id = '00000000-0000-0000-0000-000000000201';
insert into public.technician_services (technician_id, category_id)
select '00000000-0000-0000-0000-000000000201', id from public.service_categories where slug = 'plumbing';

-- Schema ----------------------------------------------------------------------

select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'Row level security is on for every table'
);

-- Sign-up ---------------------------------------------------------------------

select results_eq(
  $$ select role::text, full_name from public.profiles where id = '00000000-0000-0000-0000-000000000101' $$,
  $$ values ('customer', 'Ana Santos') $$,
  'Signing up creates a customer profile with the name given'
);

select results_eq(
  $$ select p.role::text, t.verification_status::text
     from public.profiles p join public.technician_profiles t using (id)
     where p.id = '00000000-0000-0000-0000-000000000203' $$,
  $$ values ('technician', 'pending') $$,
  'Signing up as a technician creates a technician profile waiting for approval'
);

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-000000000666'),
  'customer'::public.user_role,
  'Nobody can sign up as an admin'
);

-- Signed-out visitors -----------------------------------------------------------

select pg_temp.login_as_visitor();

select is((select count(*) from public.service_categories), 7::bigint, 'Visitors can see the service categories');

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-0000-0000-000000000201'::uuid) $$,
  'Visitors can see approved technicians and no other profiles'
);

select results_eq(
  $$ select id from public.technician_profiles $$,
  $$ values ('00000000-0000-0000-0000-000000000201'::uuid) $$,
  'Visitors see only approved technician profiles'
);

select throws_ok($$ select * from public.bookings $$, '42501', 'permission denied for table bookings',
  'Visitors cannot read bookings');

select throws_ok($$ select * from public.addresses $$, '42501', 'permission denied for table addresses',
  'Visitors cannot read addresses');

-- Customers ---------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');

select lives_ok(
  $$ update public.profiles set full_name = 'Ana Marie Santos' where id = '00000000-0000-0000-0000-000000000101' $$,
  'People can change their own name'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000101' $$,
  '42501', 'permission denied for table profiles',
  'People cannot change their own role'
);

select is_empty(
  $$ update public.profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-000000000102' returning id $$,
  'People cannot change someone else''s profile'
);

select is_empty(
  $$ select id from public.profiles where id = '00000000-0000-0000-0000-000000000102' $$,
  'Customers cannot see other customers'
);

select lives_ok(
  $$ insert into public.addresses (street, barangay, city, province, landmark)
     values ('12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 'Blue gate beside the sari-sari store') $$,
  'Customers can save an address'
);

select is(
  (select user_id from public.addresses),
  '00000000-0000-0000-0000-000000000101'::uuid,
  'A new address belongs to whoever saved it'
);

select throws_ok(
  $$ insert into public.addresses (user_id, street, barangay, city, province)
     values ('00000000-0000-0000-0000-000000000102', '1 Fake St', 'Poblacion', 'Makati', 'Metro Manila') $$,
  '42501', 'new row violates row-level security policy for table "addresses"',
  'People cannot save an address for someone else'
);

select throws_ok(
  $$ insert into public.bookings (customer_id, category_id, appliance, problem, scheduled_at,
       street, barangay, city, province, inspection_fee)
     select '00000000-0000-0000-0000-000000000101', id, 'Sink', 'Leak', now() + interval '1 day',
       'x', 'x', 'x', 'x', 0 from public.service_categories limit 1 $$,
  '42501', 'permission denied for table bookings',
  'Bookings cannot be written directly, only through the booking functions'
);

select throws_ok(
  $$ insert into public.service_categories (slug, name) values ('aircon', 'Aircon') $$,
  '42501', 'new row violates row-level security policy for table "service_categories"',
  'Customers cannot add service categories'
);

select throws_ok(
  $$ select public.set_technician_verification('00000000-0000-0000-0000-000000000203', 'approved') $$,
  '42501', 'Only admins can verify technicians',
  'Customers cannot approve technicians'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');

select is_empty($$ select id from public.addresses $$, 'People cannot see other people''s addresses');

-- Technicians -------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');

select lives_ok(
  $$ update public.technician_profiles set bio = 'Licensed plumber, 8 years', is_available = false
     where id = '00000000-0000-0000-0000-000000000201' $$,
  'Technicians can edit their bio and availability'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000203');

select isnt_empty(
  $$ select 1 from public.technician_profiles where id = '00000000-0000-0000-0000-000000000203' $$,
  'Technicians waiting for approval can see their own profile'
);

select throws_ok(
  $$ update public.technician_profiles set verification_status = 'approved'
     where id = '00000000-0000-0000-0000-000000000203' $$,
  '42501', 'permission denied for table technician_profiles',
  'Technicians cannot approve themselves'
);

select lives_ok(
  $$ insert into public.technician_services (technician_id, category_id)
     select '00000000-0000-0000-0000-000000000203', id from public.service_categories where slug = 'electrical' $$,
  'Technicians can choose the services they offer'
);

select throws_ok(
  $$ insert into public.technician_services (technician_id, category_id)
     select '00000000-0000-0000-0000-000000000201', id from public.service_categories where slug = 'electrical' $$,
  '42501', 'new row violates row-level security policy for table "technician_services"',
  'Technicians cannot change another technician''s services'
);

-- Admins ------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');

select lives_ok(
  $$ select public.set_technician_verification('00000000-0000-0000-0000-000000000203', 'approved') $$,
  'Admins can approve technicians'
);

select lives_ok(
  $$ insert into public.service_categories (slug, name, inspection_fee) values ('aircon', 'Aircon', 500) $$,
  'Admins can add service categories'
);

select pg_temp.login_as_visitor();

select is(
  (select count(*) from public.technician_profiles), 2::bigint,
  'Approved technicians become visible to everyone'
);

select is(
  (select count(*) from public.technician_services where technician_id = '00000000-0000-0000-0000-000000000203'),
  1::bigint,
  'Visitors can see what approved technicians offer'
);

select * from finish();
rollback;
