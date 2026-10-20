-- Double bookings and rescheduling: a technician's taken jobs hold their time
-- (nobody gives them another within two hours: accepting, assigning, asking
-- for them, moving a visit); customers and admins move visits until the
-- technician sets off, and who needs to know is told; busy_times shows when
-- a technician is taken.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
-- Visit times: p_hours after a round hour two days from now.
create function pg_temp.at(p_hours numeric) returns timestamptz language sql stable as $$
  select date_trunc('hour', now()) + interval '2 days' + p_hours * interval '1 hour';
$$;
-- The bookings are named by their item.
create function pg_temp.booking(p_item text) returns uuid language sql stable as $$
  select id from public.bookings where appliance = p_item;
$$;
-- A plumbing booking, in p_status, at pg_temp.at(p_hours).
create function pg_temp.job(p_item text, p_customer uuid, p_technician uuid, p_status public.booking_status,
                            p_hours numeric) returns void language sql as $$
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                               street, barangay, city, province, inspection_fee)
  select p_customer, p_technician, c.id, p_item, 'Leaking', pg_temp.at(p_hours), p_status,
         '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300
  from public.service_categories c where c.slug = 'plumbing';
$$;
-- Whether someone has a notification with this title and body.
create function pg_temp.told(p_user uuid, p_title text, p_body text) returns boolean language sql stable as $$
  select exists (select 1 from public.notifications where user_id = p_user and title = p_title and body = p_body);
$$;

-- People: ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers);
-- ...203 Mila (not approved yet); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'mila@example.com', '{"full_name": "Mila Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id)
select t, c.id from public.service_categories c,
  unnest(array['00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202',
               '00000000-0000-0000-0000-000000000203']::uuid[]) t
where c.slug = 'plumbing';
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');

-- Tess's day: Sink at 0h (taken), and a finished job at 5h. Open requests at 1h, 2h, -1h and 5h.
select pg_temp.job('Sink', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', 0);
select pg_temp.job('Old job', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', 'completed', 5);
select pg_temp.job('Faucet', '00000000-0000-0000-0000-000000000102', null, 'requested', 1);
select pg_temp.job('Pipe', '00000000-0000-0000-0000-000000000102', null, 'requested', 2);
select pg_temp.job('Drain', '00000000-0000-0000-0000-000000000102', null, 'requested', -1);
select pg_temp.job('Toilet', '00000000-0000-0000-0000-000000000102', null, 'requested', 5);
select pg_temp.job('Shower', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'en_route', 30);

select is(
  (select string_agg(s::text, ',' order by s) from unnest(enum_range(null::public.booking_status)) s where private.holds_time(s)),
  'accepted,en_route,arrived,quoted,in_progress',
  'Taken jobs hold a technician''s time until they''re done or cancelled'
);

-- Taking a job --------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_like($$ select public.accept_booking(pg_temp.booking('Faucet')) $$,
  'You already have a job then (%).', 'A technician can''t take a job within two hours of one they have');
select lives_ok($$ select public.accept_booking(pg_temp.booking('Pipe')) $$, 'Two hours apart is fine');
select lives_ok($$ select public.accept_booking(pg_temp.booking('Toilet')) $$, 'and a finished job holds no time');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select lives_ok($$ select public.accept_booking(pg_temp.booking('Faucet')) $$, 'Another technician, free then, can take it');

-- Giving one --------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select throws_like(
  $$ select public.assign_technician(pg_temp.booking('Drain'), '00000000-0000-0000-0000-000000000201') $$,
  'Tess Cruz already has a job then (%).', 'An admin can''t give a technician a job that clashes'
);
select is((select status::text from public.bookings where id = pg_temp.booking('Drain')), 'requested', 'and nothing changes');
select lives_ok(
  $$ select public.assign_technician(pg_temp.booking('Drain'), '00000000-0000-0000-0000-000000000202') $$,
  'but can give it to someone free'
);

-- Asking for a technician ---------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a101', 'Heater', 'Cold water', pg_temp.at(0.5), '',
       '00000000-0000-0000-0000-000000000201') $$,
  'P0001', 'That technician already has a job then. Pick another time, or any available technician.',
  'A customer can''t ask for a technician when they''re taken'
);
select lives_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a101', 'Heater', 'Cold water', pg_temp.at(0.5)) $$,
  'They can send it to any available technician then'
);
select lives_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a101', 'Tap', 'Drips', pg_temp.at(9), '',
       '00000000-0000-0000-0000-000000000201') $$,
  'or ask for them at a time they''re free'
);

-- When a technician is taken ----------------------------------------------------------------------------
select is(
  (select array_agg(t) from public.busy_times('00000000-0000-0000-0000-000000000201') t),
  array[pg_temp.at(0), pg_temp.at(2), pg_temp.at(5)],
  'busy_times lists when a technician is taken'
);
select is(
  (select array_agg(t) from public.busy_times('00000000-0000-0000-0000-000000000201', pg_temp.booking('Sink')) t),
  array[pg_temp.at(2), pg_temp.at(5)],
  'leaving out the visit being moved'
);
select is((select count(*)::int from public.busy_times('00000000-0000-0000-0000-000000000203')), 0,
  'Not for technicians who aren''t approved');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.busy_times('00000000-0000-0000-0000-000000000201') $$, '42501', null,
  'Visitors can''t see it');

-- Moving a visit ------------------------------------------------------------------------------------------
select pg_temp.logout();
insert into private.booking_reminders (booking_id, kind, user_id)
values (pg_temp.booking('Sink'), 'customer_evening_before', '00000000-0000-0000-0000-000000000101');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.reschedule_booking(pg_temp.booking('Sink'), pg_temp.at(2.5)) $$,
  'P0001', 'Tess already has a job then. Pick another time.', 'A visit can''t move to when its technician is taken');
select throws_ok($$ select public.reschedule_booking(pg_temp.booking('Sink'), pg_temp.at(0)) $$,
  'P0001', 'That''s already the visit time', 'or to the time it already is');
select throws_ok($$ select public.reschedule_booking(pg_temp.booking('Sink'), now() - interval '1 hour') $$,
  'P0001', 'Pick a time within the next 90 days', 'or to the past');
select lives_ok($$ select public.reschedule_booking(pg_temp.booking('Sink'), pg_temp.at(-0.5)) $$,
  'It can move within two hours of where it was (its own time doesn''t count)');
select lives_ok($$ select public.reschedule_booking(pg_temp.booking('Sink'), pg_temp.at(24)) $$,
  'A customer moves their visit');
select pg_temp.logout();
select is(
  (select scheduled_at from public.bookings where id = pg_temp.booking('Sink')),
  pg_temp.at(24),
  'to the new time'
);
select is(
  (select note from public.booking_events where booking_id = pg_temp.booking('Sink') and event = 'rescheduled'
   order by id desc limit 1),
  'Was ' || private.visit_time(pg_temp.at(-0.5)),
  'The timeline says it moved, and from when'
);
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000201', 'Visit time changed',
    'Ana moved Sink in San Antonio, Pasig to ' || private.visit_time(pg_temp.at(24))
    || ' (was ' || private.visit_time(pg_temp.at(-0.5)) || '). If you can''t make it, give the job back.'),
  'The technician is told'
);
select is((select count(*)::int from private.booking_reminders where booking_id = pg_temp.booking('Sink')), 0,
  'and the reminders will go again for the new time');
select is(
  (select private.taken_at(b) from public.bookings b where b.id = pg_temp.booking('Sink')),
  (select max(created_at) from public.booking_events where booking_id = pg_temp.booking('Sink') and event = 'rescheduled'),
  'Running late counts from the new arrangement'
);

select set_config('test.pipe', pg_temp.booking('Pipe')::text, true); -- (Ana can't see Ben's booking)
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.reschedule_booking(current_setting('test.pipe')::uuid, pg_temp.at(30)) $$,
  '42501', 'Only the customer can change the visit time', 'Nobody else''s customer can move it');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select throws_ok($$ select public.reschedule_booking(pg_temp.booking('Shower'), pg_temp.at(40)) $$,
  'P0001', 'The visit time can''t change once the technician is on the way',
  'Once the technician is on the way, it stays');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok($$ select public.reschedule_booking(pg_temp.booking('Pipe'), pg_temp.at(30)) $$,
  'An admin moves a visit');
select pg_temp.logout();
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000102', 'PatchUp changed your visit time',
    'Plumbing: Pipe · now ' || private.visit_time(pg_temp.at(30))),
  'and the customer is told'
);
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000201', 'Visit time changed',
    'PatchUp moved Pipe in San Antonio, Pasig to ' || private.visit_time(pg_temp.at(30))
    || ' (was ' || private.visit_time(pg_temp.at(2)) || '). If you can''t make it, give the job back.'),
  'and so is the technician'
);

select * from finish();
rollback;
