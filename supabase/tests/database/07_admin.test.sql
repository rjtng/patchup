-- The admin dashboard: only admins get its counts, technician list and
-- emails; technicians hear the outcome of their verification; an admin's
-- cancellation says it was PatchUp's.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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

create temp table booking_ids (name text primary key, id uuid not null);
grant all on booking_ids to public;
create function pg_temp.booking(p_name text) returns uuid language sql stable as $$
  select id from booking_ids where name = p_name;
$$;
create function pg_temp.category(p_slug text) returns uuid language sql stable as $$
  select id from public.service_categories where slug = p_slug;
$$;
create function pg_temp.visit() returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + 1 + time '10:00') at time zone 'Asia/Manila';
$$;
create function pg_temp.when_text() returns text language sql stable security definer as $$
  select private.visit_time(pg_temp.visit());
$$;
-- A booking already at some step (the overview only reads them): booked some
-- time ago, and done or cancelled some time ago.
create function pg_temp.add_booking(
  p_name text, p_customer uuid, p_technician uuid, p_status public.booking_status,
  p_booked interval default '0', p_closed interval default null, p_final numeric default null
) returns void language plpgsql as $$
declare v_id uuid;
begin
  insert into public.bookings (customer_id, technician_id, category_id, status, appliance, problem, scheduled_at,
                               street, barangay, city, province, inspection_fee, final_amount,
                               created_at, completed_at, cancelled_at)
  values (p_customer, p_technician, pg_temp.category('plumbing'), p_status, 'Kitchen faucet', 'Leaking', pg_temp.visit(),
          '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300, p_final,
          now() - p_booked,
          case when p_status = 'completed' then now() - p_closed end,
          case when p_status = 'cancelled' then now() - p_closed end)
  returning id into v_id;
  insert into booking_ids values (p_name, v_id);
end;
$$;
-- Someone's notifications, oldest first, as "title | body | url".
create function pg_temp.notes(p_user uuid) returns text[] language sql stable security definer as $$
  select coalesce(array_agg(n.title || ' | ' || n.body || ' | ' || coalesce(n.url, '') order by n.created_at, n.id), '{}')
  from public.notifications n where n.user_id = p_user;
$$;

-- People:  ...101 Ana, ...102 Ben (customers)
--          ...201 Tess (approved, taking jobs), ...202 Rey (approved, not taking jobs)
--          ...203 Pia, ...204 Jun (waiting for approval)
--          ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'pia@example.com', '{"full_name": "Pia Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000204', 'jun@example.com', '{"full_name": "Jun Ocampo", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id = '00000000-0000-0000-0000-000000000201';
update public.technician_profiles set verification_status = 'approved'
where id = '00000000-0000-0000-0000-000000000202';
update public.technician_profiles set city = 'Pasig', years_experience = 8
where id = '00000000-0000-0000-0000-000000000201';
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('electrical')),
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000203', pg_temp.category('carpentry'));
-- (Approving Tess and Rey told them so; start from no notifications.)
delete from public.notifications;

-- Bookings. Ana's: a new request, one for Tess, one Tess did yesterday, one Rey
-- did 10 days ago. Ben's: a request waiting 2 hours, Tess on the way, one
-- cancelled 2 days ago.
select pg_temp.add_booking('new', '00000000-0000-0000-0000-000000000101', null, 'requested');
select pg_temp.add_booking('asked', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'requested');
select pg_temp.add_booking('done', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'completed',
                           '2 days', '1 day', 850);
select pg_temp.add_booking('done_old', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202', 'completed',
                           '12 days', '10 days', 500);
select pg_temp.add_booking('old', '00000000-0000-0000-0000-000000000102', null, 'requested', '2 hours');
select pg_temp.add_booking('going', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', 'en_route');
select pg_temp.add_booking('off', '00000000-0000-0000-0000-000000000102', null, 'cancelled', '3 days', '2 days');

-- Only admins -----------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.admin_overview() $$, '42501', 'Only admins can see this',
  'A customer can''t see the dashboard counts');
select throws_ok($$ select * from public.admin_emails(array['00000000-0000-0000-0000-000000000102'::uuid]) $$,
  '42501', 'Only admins can see this', 'or anyone''s email');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok($$ select * from public.admin_technicians() $$, '42501', 'Only admins can see this',
  'A technician can''t see the technician list');
select pg_temp.login_as_visitor();
select throws_ok($$ select public.admin_overview() $$, '42501', null, 'Nor can a visitor');

-- The counts ------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(
  public.admin_overview(),
  jsonb_build_object(
    'pending_technicians', 2, 'approved_technicians', 2, 'available_technicians', 1, 'customers', 2,
    'unassigned_requests', 2, 'stale_requests', 1, 'awaiting_technician', 1, 'active_bookings', 1, 'late_jobs', 0,
    'booked_week', 6, 'completed_week', 1, 'completed_value_week', 850, 'cancelled_week', 1
  ),
  'The overview counts technicians, customers, waiting requests and the last 7 days'
);

-- The technician list ---------------------------------------------------------------

select is((select count(*) from public.admin_technicians()), 4::bigint, 'Admins see every technician');
select is(
  (select array_agg(full_name order by full_name) from public.admin_technicians(status => 'pending')),
  array['Jun Ocampo', 'Pia Lim'],
  'and can list those waiting for approval'
);
select is(
  (select concat_ws(' / ', full_name, email, city, years_experience, verification_status, is_available::text,
                    services::text, jobs_completed)
   from public.admin_technicians(technician_id => '00000000-0000-0000-0000-000000000201')),
  'Tess Cruz / tess@example.com / Pasig / 8 / approved / true / {Plumbing,Electrical} / 1',
  'or one technician, with their sign-up email, services and jobs done'
);
select is(
  (select services::text || ' ' || jobs_completed from public.admin_technicians(technician_id => '00000000-0000-0000-0000-000000000202')),
  '{} 1',
  'A technician with no services shows none'
);
select is(
  (select array_agg(email order by email) from public.admin_emails(array[
    '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000203']::uuid[])),
  array['ana@example.com', 'pia@example.com'],
  'Admins can get people''s emails to contact them'
);

-- Verification outcomes -------------------------------------------------------------

select public.set_technician_verification('00000000-0000-0000-0000-000000000203', 'approved');
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000203'),
  array['You''re approved | Customers can now book you. Turn on Taking new jobs to get requests. | /jobs'],
  'An approved technician hears it'
);
select public.set_technician_verification('00000000-0000-0000-0000-000000000203', 'approved');
select is(cardinality(pg_temp.notes('00000000-0000-0000-0000-000000000203')), 1, 'but only once');

select public.set_technician_verification('00000000-0000-0000-0000-000000000204', 'rejected');
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000204'),
  array['Your application wasn''t approved | Contact PatchUp support to find out why. | /profile'],
  'A rejected one hears it'
);

select public.set_technician_verification('00000000-0000-0000-0000-000000000201', 'suspended');
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000201'),
  array['Your account is suspended | You won''t get new jobs for now. Contact PatchUp support to find out why. | /profile'],
  'So does a suspended one'
);
select is(
  (select is_available from public.technician_profiles where id = '00000000-0000-0000-0000-000000000201'),
  false,
  'and they stop taking new jobs'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
update public.technician_profiles set bio = 'Fixes leaks fast' where id = '00000000-0000-0000-0000-000000000202';
select is(cardinality(pg_temp.notes('00000000-0000-0000-0000-000000000202')), 0,
  'Editing their own profile tells a technician nothing');

-- Assigning ---------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select throws_ok(
  $$ select public.assign_technician(pg_temp.booking('new'), '00000000-0000-0000-0000-000000000201') $$,
  'P0001', 'That technician isn''t approved',
  'A suspended technician can''t be assigned'
);
select is(
  (select status || ' ' || technician_id from public.assign_technician(pg_temp.booking('new'), '00000000-0000-0000-0000-000000000202')),
  'accepted 00000000-0000-0000-0000-000000000202',
  'An admin assigns an approved technician to an open request'
);
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000202'),
  array['New job for you | Kitchen faucet in San Antonio, Pasig · ' || pg_temp.when_text() || ' | /jobs/' || pg_temp.booking('new')],
  'and the technician hears about it'
);

-- Cancelling --------------------------------------------------------------------------

select public.cancel_booking(pg_temp.booking('asked'), '  No plumber free that day ');
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000101'),
  array[
    'Rey Tan will do your repair | Plumbing: Kitchen faucet · ' || pg_temp.when_text() || ' | /bookings/' || pg_temp.booking('new'),
    'PatchUp cancelled your booking | Plumbing: Kitchen faucet · ' || pg_temp.when_text()
      || '. No plumber free that day | /bookings/' || pg_temp.booking('asked')
  ],
  'When an admin cancels, the customer hears it was PatchUp, and why'
);
select is(
  (pg_temp.notes('00000000-0000-0000-0000-000000000201'))[2],
  'PatchUp cancelled this job | Kitchen faucet · ' || pg_temp.when_text() || '. No plumber free that day | /jobs/'
    || pg_temp.booking('asked'),
  'and so does the technician'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select public.cancel_booking(pg_temp.booking('going'));
select is(
  (pg_temp.notes('00000000-0000-0000-0000-000000000201'))[3],
  'Booking cancelled | Ben cancelled: Kitchen faucet · ' || pg_temp.when_text() || ' | /jobs/' || pg_temp.booking('going'),
  'When the customer cancels, the technician hears it was them'
);
select is(cardinality(pg_temp.notes('00000000-0000-0000-0000-000000000102')), 0, 'and the customer isn''t told');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.cancel_booking(pg_temp.booking('old'));
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000102'),
  array['PatchUp cancelled your booking | Plumbing: Kitchen faucet · ' || pg_temp.when_text() || ' | /bookings/' || pg_temp.booking('old')],
  'Without a reason, the customer still hears which booking'
);
select is(
  (public.admin_overview() ->> 'cancelled_week')::int,
  4,
  'and the overview counts the cancellations'
);

select * from finish();
rollback;
