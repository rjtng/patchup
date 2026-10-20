-- Limits on moving and cancelling visits: what's last-minute (less than 2
-- hours to the visit, or on the way; not in the first 10 minutes after a
-- technician took it; not once the technician is the one running late);
-- the pause after 3 last-minute cancellations in 30 days; last-minute
-- give-backs told to admins; at most two moves by the customer once a
-- technician has the visit, only while it's 2 hours away, to a time 2 hours
-- away. Admins aren't limited. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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
-- A plumbing visit some time from now, taken by its technician some time ago (if taken).
create function pg_temp.visit(p_name text, p_customer uuid, p_technician uuid, p_status public.booking_status,
                              p_in interval, p_taken interval default interval '1 hour')
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                               street, barangay, city, province, inspection_fee)
  select p_customer, p_technician, c.id, p_name, 'Leaking', now() + p_in, p_status,
         '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300
  from public.service_categories c where c.slug = 'plumbing'
  returning id into v_id;
  if p_status in ('accepted', 'en_route') then
    insert into public.booking_events (booking_id, actor_id, event, status, created_at)
    values (v_id, p_technician, 'accepted', 'accepted', now() - p_taken);
  end if;
  perform set_config('test.' || replace(p_name, ' ', '_'), v_id::text, true);
end;
$$;
create function pg_temp.id(p_name text) returns uuid language sql stable as $$
  select current_setting('test.' || replace(p_name, ' ', '_'))::uuid;
$$;
create function pg_temp.last_minute(p_name text, p_event text) returns boolean language sql stable as $$
  select last_minute from public.booking_events where booking_id = pg_temp.id(p_name) and event = p_event;
$$;
create function pg_temp.told(p_user uuid, p_title text, p_body text, p_url text) returns boolean language sql stable as $$
  select exists (select 1 from public.notifications
                 where user_id = p_user and title = p_title and body = p_body and url = p_url);
$$;
create function pg_temp.record(p_person uuid) returns text language sql stable as $$
  select cancellations || ' ' || give_backs || ' ' || coalesce(booking_paused_until::text, 'none')
  from public.last_minute_record(p_person);
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
select t.id, c.id from public.service_categories c,
  (values ('00000000-0000-0000-0000-000000000201'::uuid), ('00000000-0000-0000-0000-000000000202'::uuid)) t (id)
where c.slug = 'plumbing';
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-000000000102', '3 Rizal Ave', 'Kapitolyo', 'Pasig', 'Metro Manila');

-- Ana's visits with Tess, to cancel.
select pg_temp.visit('Soon', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', interval '1 hour');
select pg_temp.visit('Later', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', interval '3 hours');
select pg_temp.visit('Just taken', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', interval '1 hour', interval '5 minutes');
select pg_temp.visit('On the way', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'en_route', interval '1 hour', interval '2 minutes');
select pg_temp.visit('Tech late', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', interval '-30 minutes', interval '1 day');
select pg_temp.visit('Open', '00000000-0000-0000-0000-000000000101', null, 'requested', interval '1 hour');
select pg_temp.visit('By admin', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', interval '1 hour');
select pg_temp.visit('Third', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'accepted', interval '90 minutes');

-- Cancelling at the last minute ---------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.cancel_booking(pg_temp.id(n)) from unnest(array['Soon', 'Later', 'Just taken', 'On the way', 'Tech late', 'Open']) n;
select is(pg_temp.last_minute('Soon', 'cancelled'), true, 'Cancelling a visit less than 2 hours away is last-minute (the customer sees it marked)');
select pg_temp.logout();
select is(pg_temp.last_minute('Later', 'cancelled'), false, 'Cancelling one 2 hours or more away isn''t');
select is(pg_temp.last_minute('Just taken', 'cancelled'), false, 'nor in the first 10 minutes after the technician took it');
select is(pg_temp.last_minute('On the way', 'cancelled'), true, 'Once the technician is on the way, it is, however soon after they took it');
select is(pg_temp.last_minute('Tech late', 'cancelled'), false, 'Once the visit time has passed, the technician is the one running late');
select is(pg_temp.last_minute('Open', 'cancelled'), false, 'An open request nobody took is never last-minute');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.cancel_booking(pg_temp.id('By admin'), 'Technician is ill');
select pg_temp.logout();
select is(pg_temp.last_minute('By admin', 'cancelled'), false, 'What admins cancel never counts');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.record(null), '2 0 none', 'Her record: 2 last-minute cancellations, and she can still book');
select pg_temp.logout();
select is((select count(*)::integer from public.notifications
           where user_id = '00000000-0000-0000-0000-000000000101' and title = 'Booking is paused'), 0, 'Not paused at 2');

-- The third, with the first of them 20 days ago: paused for 10 more days.
update public.booking_events set created_at = now() - interval '20 days'
where booking_id = pg_temp.id('Soon') and event = 'cancelled';
select set_config('test.until', private.visit_time(now() + interval '10 days'), true);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.cancel_booking(pg_temp.id('Third'));
select is((select booking_paused_until from public.last_minute_record()), now() + interval '10 days',
  'A third in 30 days pauses booking until the first of them is 30 days old');
select throws_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a101', 'Faucet', 'Dripping', now() + interval '1 day') $$,
  '42501',
  'You cancelled 3 visits at the last minute in the past 30 days, so you can book again from ' || current_setting('test.until') || '.',
  'Booking is refused until then, saying when'
);
select pg_temp.logout();
select ok(pg_temp.told('00000000-0000-0000-0000-000000000101', 'Booking is paused',
  'You cancelled 3 visits at the last minute in 30 days, so you can book again from ' || current_setting('test.until') || '.',
  '/home'), 'She''s told when it pauses');

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select lives_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a102', 'Faucet', 'Dripping', now() + interval '5 days') $$,
  'Other customers book as usual'
);
select throws_ok($$ select * from public.last_minute_record('00000000-0000-0000-0000-000000000101') $$,
  '42501', 'Only admins can see someone else''s record', 'Others can''t see her record');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(split_part(pg_temp.record('00000000-0000-0000-0000-000000000101'), ' ', 1), '3', 'Admins can');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.last_minute_record('00000000-0000-0000-0000-000000000101') $$,
  '42501', null, 'Visitors can''t call it');
select pg_temp.logout();

-- Giving back at the last minute ---------------------------------------------------------------------
select pg_temp.visit('Heater', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', 'accepted', interval '1 hour');
select pg_temp.visit('Shower', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', 'accepted', interval '3 hours');
select pg_temp.visit('Asked', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', 'requested', interval '1 hour');
select set_config('test.heater_time', private.visit_time(now() + interval '1 hour'), true);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.decline_booking(pg_temp.id(n)) from unnest(array['Heater', 'Shower', 'Asked']) n;
select pg_temp.logout();
select is(pg_temp.last_minute('Heater', 'declined'), true, 'Giving back a job less than 2 hours before the visit is last-minute');
select ok(pg_temp.told('00000000-0000-0000-0000-000000000901', 'Job given back at the last minute',
  'Tess Cruz gave back Plumbing: Heater in San Antonio, Pasig · ' || current_setting('test.heater_time') || '. Find someone else soon.',
  '/admin/bookings/' || pg_temp.id('Heater')), 'Admins are told at once');
select ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000102'
                  and title = 'Finding you another technician' and booking_id = pg_temp.id('Heater')),
  'and the customer hears as usual');
select is(pg_temp.last_minute('Shower', 'declined'), false, 'Giving one back 2 hours or more before isn''t');
select is(pg_temp.last_minute('Asked', 'declined'), false, 'nor turning down a request one was asked for');
select is((select count(*)::integer from public.notifications where title = 'Job given back at the last minute'), 1,
  'Admins hear only about the last-minute one');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(pg_temp.record('00000000-0000-0000-0000-000000000201'), '0 1 none', 'Her record counts it');
select pg_temp.logout();

-- Moving a visit -----------------------------------------------------------------------------------------
select pg_temp.visit('Tomorrow', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'accepted', interval '1 day');
select pg_temp.visit('Within 2h', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'accepted', interval '1 hour');
select pg_temp.visit('Day after', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'accepted', interval '2 days');
select pg_temp.visit('Nobody yet', '00000000-0000-0000-0000-000000000102', null, 'requested', interval '1 hour');
select pg_temp.visit('Asked soon', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'requested', interval '1 hour');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select lives_ok($$ select public.reschedule_booking(pg_temp.id('Tomorrow'), now() + interval '27 hours') $$, 'The customer moves a visit');
select lives_ok($$ select public.reschedule_booking(pg_temp.id('Tomorrow'), now() + interval '30 hours') $$, 'and again');
select throws_ok($$ select public.reschedule_booking(pg_temp.id('Tomorrow'), now() + interval '33 hours') $$,
  'P0001', 'You''ve already changed the time twice. If this time doesn''t work, cancel and book again.',
  'but not a third time');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok($$ select public.reschedule_booking(pg_temp.id('Tomorrow'), now() + interval '33 hours') $$, 'Admins still can');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select throws_ok($$ select public.reschedule_booking(pg_temp.id('Within 2h'), now() + interval '1 day') $$,
  'P0001', 'The visit is less than 2 hours away, so its time can''t change now. Message Rey if something''s come up.',
  'A visit less than 2 hours away can''t move');
select throws_ok($$ select public.reschedule_booking(pg_temp.id('Day after'), now() + interval '1 hour') $$,
  'P0001', 'Pick a time at least 2 hours from now, so Rey can plan for it.',
  'nor move to less than 2 hours away');
select lives_ok($$ select public.reschedule_booking(pg_temp.id('Nobody yet'), now() + interval '90 minutes') $$,
  'An open request nobody took moves freely');
select throws_ok($$ select public.reschedule_booking(pg_temp.id('Asked soon'), now() + interval '1 day') $$,
  'P0001', 'The visit is less than 2 hours away, so its time can''t change now. Message Rey if something''s come up.',
  'A request for a technician is held to the limits too');
select pg_temp.logout();

-- Housekeeping ---------------------------------------------------------------------------------------------
select is((select count(*)::integer from pg_policies where tablename = 'reviews'
           and policyname = 'Signed-in people read shown reviews; their own and admins all'), 1,
  'The reviews policy has its whole name');
select ok(not has_function_privilege('authenticated', 'private.is_last_minute(public.bookings)', 'execute')
          and not has_function_privilege('authenticated', 'private.booking_paused_until(uuid)', 'execute'),
  'The helpers can''t be called through the API');

select * from finish();
rollback;
