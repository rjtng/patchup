-- Technicians' working hours: setting them (replacing the week; checked),
-- who sees them (like the rest of an approved profile), and where they
-- apply: asking for a technician and moving a visit only within their hours,
-- requests for any technician only to those working then. Technicians can
-- still take any open request, admins aren't limited, and a technician
-- without hours works any time. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
-- A time next week in Manila: days after Monday, and the hour.
create function pg_temp.next_week(p_days integer, p_hour integer) returns timestamptz language sql stable as $$
  select (date_trunc('week', now() at time zone 'Asia/Manila') + make_interval(days => 7 + p_days, hours => p_hour))
         at time zone 'Asia/Manila';
$$;
create function pg_temp.told(p_user uuid, p_title text, p_booking text) returns boolean language sql stable as $$
  select exists (select 1 from public.notifications
                 where user_id = p_user and title = p_title and booking_id = current_setting(p_booking)::uuid);
$$;

-- People: ...101 Ana (customer); ...201 Tess, ...202 Rey (approved plumbers); ...203 Pia (waiting); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'pia@example.com', '{"full_name": "Pia Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id)
select t.id, c.id from public.service_categories c,
  (values ('00000000-0000-0000-0000-000000000201'::uuid), ('00000000-0000-0000-0000-000000000202'::uuid)) t (id)
where c.slug = 'plumbing';
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');
select set_config('test.plumbing', (select id::text from public.service_categories where slug = 'plumbing'), true);

-- Setting hours -------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select count(*)::integer from public.set_working_hours(
     '[{"weekday": 1, "first_visit": "08:00", "last_visit": "17:00"}, {"weekday": 2, "first_visit": "08:00", "last_visit": "17:00"},
       {"weekday": 3, "first_visit": "08:00", "last_visit": "17:00"}, {"weekday": 4, "first_visit": "08:00", "last_visit": "17:00"},
       {"weekday": 5, "first_visit": "08:00", "last_visit": "17:00"}, {"weekday": 6, "first_visit": "08:00", "last_visit": "13:00"}]')),
  6, 'A technician sets the days they work'
);
select is(
  (select string_agg(weekday || ' ' || first_visit || '-' || last_visit, ', ' order by weekday) from public.set_working_hours(
     '[{"weekday": 1, "first_visit": "08:00", "last_visit": "15:00"}, {"weekday": 2, "first_visit": "08:00", "last_visit": "15:00"},
       {"weekday": 3, "first_visit": "08:00", "last_visit": "15:00"}, {"weekday": 4, "first_visit": "08:00", "last_visit": "15:00"},
       {"weekday": 5, "first_visit": "08:00", "last_visit": "15:00"}]')),
  '1 08:00:00-15:00:00, 2 08:00:00-15:00:00, 3 08:00:00-15:00:00, 4 08:00:00-15:00:00, 5 08:00:00-15:00:00',
  'Setting them again replaces the week'
);
select throws_ok($$ select public.set_working_hours('[]') $$,
  'P0001', 'Pick at least one day. To stop new jobs for a while, turn off Taking new jobs.', 'At least one day');
select throws_ok($$ select public.set_working_hours('[{"weekday": 1, "first_visit": "15:00", "last_visit": "08:00"}]') $$,
  'P0001', 'A day''s last visit can''t be before its first', 'The last visit can''t be before the first');
select throws_ok($$ select public.set_working_hours('[{"weekday": 1, "first_visit": "08:00", "last_visit": "10:00"}, {"weekday": 1, "first_visit": "13:00", "last_visit": "15:00"}]') $$,
  'P0001', 'Give each day once', 'Each day once');
select throws_ok($$ select public.set_working_hours('[{"weekday": 8, "first_visit": "08:00", "last_visit": "10:00"}]') $$,
  'P0001', 'Each day needs a weekday and its first and last visit times', 'Only real weekdays');
select throws_ok($$ insert into public.technician_hours (technician_id, weekday, first_visit, last_visit)
                    values ('00000000-0000-0000-0000-000000000201', 7, '08:00', '17:00') $$,
  '42501', null, 'Hours can''t be written directly');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.set_working_hours('[{"weekday": 1, "first_visit": "08:00", "last_visit": "10:00"}]') $$,
  '42501', 'Only technicians set working hours', 'Customers can''t set hours');
select pg_temp.login_as('00000000-0000-0000-0000-000000000203');
select public.set_working_hours('[{"weekday": 1, "first_visit": "08:00", "last_visit": "17:00"}]');
select is((select count(*)::integer from public.technician_hours where technician_id = '00000000-0000-0000-0000-000000000203'), 1,
  'A technician waiting for approval sees their own');

-- Who sees them ----------------------------------------------------------------------------------------------
select pg_temp.login_as_visitor();
select is((select count(*)::integer from public.technician_hours where technician_id = '00000000-0000-0000-0000-000000000201'), 5,
  'Visitors see an approved technician''s hours');
select is((select count(*)::integer from public.technician_hours where technician_id = '00000000-0000-0000-0000-000000000203'), 0,
  'but not those of one waiting for approval');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is((select count(*)::integer from public.technician_hours where technician_id = '00000000-0000-0000-0000-000000000203'), 0,
  'nor do customers');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((select count(*)::integer from public.technician_hours where technician_id = '00000000-0000-0000-0000-000000000203'), 1,
  'Admins see everyone''s');
select pg_temp.logout();

-- When they work ---------------------------------------------------------------------------------------------
select ok(private.works_at('00000000-0000-0000-0000-000000000201', pg_temp.next_week(0, 10)), 'Tess works Monday at 10 AM');
select ok(not private.works_at('00000000-0000-0000-0000-000000000201', pg_temp.next_week(0, 17)), 'not Monday at 5 PM, after her last visit');
select ok(not private.works_at('00000000-0000-0000-0000-000000000201', pg_temp.next_week(6, 10)), 'nor on Sunday');
select ok(private.works_at('00000000-0000-0000-0000-000000000202', pg_temp.next_week(6, 10)), 'Rey hasn''t set hours, so he works any time');

-- Asking for a technician, and requests for anyone ------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101', 'Sink', 'Leaks',
       pg_temp.next_week(6, 10), '', '00000000-0000-0000-0000-000000000201') $$,
  'P0001', 'That''s outside the technician''s working hours. Pick another time, or any available technician.',
  'Asking for a technician outside their hours is refused'
);
select set_config('test.asked', (public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101',
  'Sink', 'Leaks', pg_temp.next_week(0, 10), '', '00000000-0000-0000-0000-000000000201')).id::text, true);
select ok(current_setting('test.asked') <> '', 'Within them, it books');
select set_config('test.sunday', (public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101',
  'Faucet', 'Drips', pg_temp.next_week(6, 10))).id::text, true);
select set_config('test.monday', (public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101',
  'Heater', 'No hot water', pg_temp.next_week(0, 13))).id::text, true);
select pg_temp.logout();
select ok(pg_temp.told('00000000-0000-0000-0000-000000000202', 'New plumbing request', 'test.sunday')
          and not pg_temp.told('00000000-0000-0000-0000-000000000201', 'New plumbing request', 'test.sunday'),
  'A request for anyone goes only to the technicians working then');
select ok(pg_temp.told('00000000-0000-0000-0000-000000000201', 'New plumbing request', 'test.monday'),
  'Tess hears of one in her hours');

-- Moving a visit ----------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.reschedule_booking(current_setting('test.asked')::uuid, pg_temp.next_week(0, 17)) $$,
  'P0001', 'That''s outside Tess''s working hours. Pick another time.', 'A customer can''t move a visit outside the technician''s hours');
select lives_ok($$ select public.reschedule_booking(current_setting('test.asked')::uuid, pg_temp.next_week(1, 10)) $$,
  'but can within them');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok($$ select public.reschedule_booking(current_setting('test.asked')::uuid, pg_temp.next_week(6, 15)) $$,
  'Admins can move it anywhere');

-- Taking a request outside one's hours --------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.accept_booking(current_setting('test.sunday')::uuid) $$,
  'A technician can still take a request outside their hours');
select pg_temp.logout();

select ok(not has_function_privilege('authenticated', 'private.works_at(uuid, timestamptz)', 'execute'),
  'The helper can''t be called through the API');

select * from finish();
rollback;
