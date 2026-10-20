-- Receipts: a numbered receipt for every job marked done, in order, once; who
-- sees them (the customer, the technician, admins); and nobody changing them.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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
-- The jobs are named by their item.
create function pg_temp.booking(p_item text) returns uuid language sql stable as $$
  select id from public.bookings where appliance = p_item;
$$;
-- A plumbing job for p_customer by Tess, in p_status.
create function pg_temp.job(p_item text, p_customer uuid, p_status public.booking_status) returns void
language sql as $$
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                               street, barangay, city, province, inspection_fee, final_amount, completed_at)
  select p_customer, '00000000-0000-0000-0000-000000000201', c.id, p_item, 'Leaking', now() - interval '1 day',
         p_status, '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300,
         case when p_status = 'completed' then 300 end, case when p_status = 'completed' then now() - interval '1 hour' end
  from public.service_categories c where c.slug = 'plumbing';
$$;
-- The items whose receipts the signed-in person sees.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(b.appliance, ', ' order by b.appliance), '')
  from public.receipts r join public.bookings b on b.id = r.booking_id;
$$;

-- People: ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers); ...901 an admin
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
select t, c.id from public.service_categories c,
  unnest(array['00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202']::uuid[]) t
where c.slug = 'plumbing';

select pg_temp.job('Sink', '00000000-0000-0000-0000-000000000101', 'arrived');
select pg_temp.job('Faucet', '00000000-0000-0000-0000-000000000101', 'in_progress');
select pg_temp.job('Shower', '00000000-0000-0000-0000-000000000102', 'cancelled');
select pg_temp.job('Toilet', '00000000-0000-0000-0000-000000000102', 'requested');

-- Issuing ------------------------------------------------------------------------------------
select has_table('public', 'receipts', 'Receipts have their own table');
select ok((select relrowsecurity from pg_class where oid = 'public.receipts'::regclass), 'with access rules');
select is((select count(*)::int from public.receipts), 0, 'Jobs that aren''t done (or were cancelled) have none');

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.complete_booking(pg_temp.booking('Sink')) $$, 'Tess marks a job done');
select pg_temp.logout();
select is(
  (select r.issued_at = b.completed_at from public.receipts r join public.bookings b on b.id = r.booking_id
   where r.booking_id = pg_temp.booking('Sink')),
  true,
  'and it gets a receipt, issued when it was done'
);
create temporary table first_number as select number from public.receipts where booking_id = pg_temp.booking('Sink');

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.complete_booking(pg_temp.booking('Faucet'));
select pg_temp.logout();
select is(
  (select number from public.receipts where booking_id = pg_temp.booking('Faucet')),
  (select number + 1 from first_number),
  'The next job done gets the next number'
);

update public.bookings set status = 'completed', updated_at = now() where id = pg_temp.booking('Sink');
select is(
  (select count(*)::int || ' ' || (min(number) = (select number from first_number))::text
   from public.receipts where booking_id = pg_temp.booking('Sink')),
  '1 true',
  'A job has one receipt, and its number never changes'
);

select pg_temp.job('Drain', '00000000-0000-0000-0000-000000000101', 'completed');
select is(
  (select count(*)::int from public.receipts where booking_id = pg_temp.booking('Drain')),
  1,
  'A job added already done (an import) gets one too'
);
select is(
  (select count(*)::int from public.receipts where booking_id in (pg_temp.booking('Shower'), pg_temp.booking('Toilet'))),
  0,
  'Cancelled and open bookings still have none'
);

-- Who sees them --------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.seen(), 'Drain, Faucet, Sink', 'A customer sees the receipts of their jobs');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.seen(), 'Drain, Faucet, Sink', 'and so does their technician');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.seen(), '', 'Another customer sees none');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is(pg_temp.seen(), '', 'nor does another plumber (who sees open requests in plumbing)');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(pg_temp.seen(), 'Drain, Faucet, Sink', 'Admins see all');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.receipts $$, '42501', null, 'Visitors see none');

-- Nobody changes them ---------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ insert into public.receipts (booking_id) values (pg_temp.booking('Shower')) $$,
  '42501', null, 'A customer can''t add a receipt'
);
select throws_ok(
  $$ update public.receipts set issued_at = now() - interval '1 year' where booking_id = pg_temp.booking('Sink') $$,
  '42501', null, 'or change one'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok(
  $$ delete from public.receipts where booking_id = pg_temp.booking('Sink') $$,
  '42501', null, 'A technician can''t remove one'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select throws_ok(
  $$ update public.receipts set issued_at = now() where booking_id = pg_temp.booking('Sink') $$,
  '42501', null, 'nor can an admin change one'
);
select pg_temp.logout();
select throws_ok(
  $$ delete from public.bookings where id = pg_temp.booking('Sink') $$,
  '23503', null, 'A booking with a receipt is kept'
);
select throws_ok(
  $$ insert into public.receipts (booking_id, number) values (pg_temp.booking('Shower'), 1) $$,
  '428C9', null, 'and numbers are only ever given in order'
);

select * from finish();
rollback;
