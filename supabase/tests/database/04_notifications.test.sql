-- Notifications: who hears about each booking step, what it says, who can
-- read and change them, push subscriptions, and handing them to the sender.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

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
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
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
-- Tomorrow at 10:00 in Manila, and how notifications write it.
create function pg_temp.visit() returns timestamptz language sql stable as $$
  select ((now() at time zone 'Asia/Manila')::date + 1 + time '10:00') at time zone 'Asia/Manila';
$$;
create function pg_temp.when_text() returns text language sql stable as $$
  select private.visit_time(pg_temp.visit());
$$;
-- Someone's notifications about a booking, oldest first, as "title | body".
create function pg_temp.notes(p_user uuid, p_booking text) returns text[] language sql stable as $$
  select coalesce(array_agg(n.title || ' | ' || n.body order by n.created_at, n.id), '{}')
  from public.notifications n where n.user_id = p_user and n.booking_id = pg_temp.booking(p_booking);
$$;
create function pg_temp.count_for(p_users uuid[]) returns bigint language sql stable as $$
  select count(*) from public.notifications n where n.user_id = any (p_users);
$$;
-- Whether a phone delivery was asked for (local stand-in, or real pg_net).
create function pg_temp.push_requested(p_id uuid) returns boolean language plpgsql as $$
declare v boolean;
begin
  if to_regclass('net.requests') is not null then
    execute 'select exists (select 1 from net.requests where body ->> ''notification_id'' = $1)' into v using p_id::text;
  elsif to_regclass('net.http_request_queue') is not null then
    execute 'select exists (select 1 from net.http_request_queue where convert_from(body, ''utf8'') like ''%'' || $1 || ''%'')' into v using p_id::text;
  else
    v := false;
  end if;
  return v;
end;
$$;

-- People:  ...101 Ana, ...102 Ben (customers)
--          ...201 Tess (approved, available, plumbing)
--          ...202 Eli  (approved, available, electrical)
--          ...203 Paz  (waiting for approval, plumbing)
--          ...204 Rey  (approved, plumbing, not taking jobs yet)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'eli@example.com', '{"full_name": "Eli Garcia", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'paz@example.com', '{"full_name": "Paz Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000204', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}');
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
update public.technician_profiles set verification_status = 'approved', is_available = false
where id = '00000000-0000-0000-0000-000000000204';
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000202', pg_temp.category('electrical')),
  ('00000000-0000-0000-0000-000000000203', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000204', pg_temp.category('plumbing'));
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-000000000102', '5 Rizal Ave', 'Poblacion', 'Makati', 'Metro Manila');

-- A new open request ---------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'leak', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Kitchen faucet', problem => 'Leaking', scheduled_at => pg_temp.visit());
select pg_temp.logout();

select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array['New plumbing request | Kitchen faucet in San Antonio, Pasig · ' || pg_temp.when_text()],
  'A plumber taking jobs hears about a new plumbing request: what, where (no street) and when'
);
select is(
  (select url from public.notifications where user_id = '00000000-0000-0000-0000-000000000201' and booking_id = pg_temp.booking('leak')),
  '/jobs/' || pg_temp.booking('leak'),
  'and it opens the job'
);
select is(
  pg_temp.count_for(array['00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000203',
                          '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000101']::uuid[]),
  0::bigint,
  'Not the electrician, the plumber awaiting approval, the one not taking jobs, nor the customer who booked'
);

-- A request for a named technician --------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
insert into booking_ids select 'shower', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a102',
  appliance => 'Shower', problem => 'No pressure', scheduled_at => pg_temp.visit(),
  technician_id => '00000000-0000-0000-0000-000000000201');
select pg_temp.logout();

select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000201', 'shower'),
  array['Request for you | Ben asked you: Shower in Poblacion, Makati · ' || pg_temp.when_text()],
  'A technician asked for by name hears it with the customer''s first name'
);
select is(pg_temp.count_for(array['00000000-0000-0000-0000-000000000204']::uuid[]), 0::bigint, 'and nobody else does');

-- The job, step by step ----------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.accept_booking(pg_temp.booking('leak'));
select public.mark_en_route(pg_temp.booking('leak'));
select public.mark_arrived(pg_temp.booking('leak'));
select public.send_quote(pg_temp.booking('leak'), '[{"description": "Replace the cartridge", "amount": 850}]');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking('leak')), true);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.complete_booking(pg_temp.booking('leak'));
select pg_temp.logout();

select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000101', 'leak'),
  array[
    'Tess Cruz accepted your booking | Plumbing: Kitchen faucet · ' || pg_temp.when_text(),
    'Tess Cruz is on the way | Plumbing: Kitchen faucet',
    'Tess Cruz has arrived | Plumbing: Kitchen faucet',
    'Quote ready: ₱850 | Approve it to start the repair. Plumbing: Kitchen faucet',
    'Job done | Total: ₱1,150, paid in cash. Thanks for using PatchUp!'
  ],
  'The customer hears each step: accepted, on the way, arrived, the quote, done'
);
select is(
  (select array_agg(distinct url) from public.notifications where user_id = '00000000-0000-0000-0000-000000000101'),
  array['/bookings/' || pg_temp.booking('leak')],
  'and each opens their booking'
);
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array[
    'New plumbing request | Kitchen faucet in San Antonio, Pasig · ' || pg_temp.when_text(),
    'Quote approved | Ana approved ₱850. You can start the repair.'
  ],
  'The technician hears the customer''s answer, not about their own steps'
);

-- A quote declined ----------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'heater', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Water heater', problem => 'No hot water', scheduled_at => pg_temp.visit());
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.accept_booking(pg_temp.booking('heater'));
select public.mark_arrived(pg_temp.booking('heater'));
select public.send_quote(pg_temp.booking('heater'), '[{"description": "New heater", "amount": 1250.5}]');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking('heater')), false);
select pg_temp.logout();

select is(
  (pg_temp.notes('00000000-0000-0000-0000-000000000101', 'heater'))[3],
  'Quote ready: ₱1,250.50 | Approve it to start the repair. Plumbing: Water heater',
  'Amounts with centavos are written out'
);
select is(
  (pg_temp.notes('00000000-0000-0000-0000-000000000201', 'heater'))[2],
  'Quote declined | Ana declined the quote. Send a new one, or finish with the inspection only.',
  'The technician hears a quote was declined, and what they can do'
);

-- Giving a job back, then cancelling ---------------------------------------------------

update public.technician_profiles set is_available = true where id = '00000000-0000-0000-0000-000000000204';
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.decline_booking(pg_temp.booking('shower'));
select pg_temp.logout();

select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000102', 'shower'),
  array['Finding you another technician | Your technician can''t make it, so your request went to other plumbing technicians. Plumbing: Shower'],
  'When a technician gives a job back, the customer hears it''s gone to others'
);
select is(
  pg_temp.notes('00000000-0000-0000-0000-000000000204', 'shower'),
  array['New plumbing request | Shower in Poblacion, Makati · ' || pg_temp.when_text()],
  'and plumbers who can take it now hear about it'
);
select is(
  cardinality(pg_temp.notes('00000000-0000-0000-0000-000000000201', 'shower')), 1,
  'but not the one who gave it back'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
select public.accept_booking(pg_temp.booking('shower'));
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select public.cancel_booking(pg_temp.booking('shower'));
select pg_temp.logout();

select is(
  (pg_temp.notes('00000000-0000-0000-0000-000000000204', 'shower'))[2],
  'Booking cancelled | Ben cancelled: Shower · ' || pg_temp.when_text(),
  'A cancellation reaches the technician'
);
select is(
  cardinality(pg_temp.notes('00000000-0000-0000-0000-000000000102', 'shower')), 2,
  'and not the customer who cancelled (just the earlier two)'
);

-- Who can read and change them ---------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select count(*) from public.notifications),
  (select count(*) from public.notifications n where n.user_id = '00000000-0000-0000-0000-000000000101'),
  'People see only their own notifications'
);
select ok((select count(*) from public.notifications) > 0, 'and they do see them');
select throws_ok(
  $$ insert into public.notifications (user_id, title) values ('00000000-0000-0000-0000-000000000101', 'Hi') $$,
  '42501', null, 'Nobody can write notifications directly'
);
select throws_ok(
  $$ update public.notifications set title = 'Changed' $$,
  '42501', null, 'or change them'
);
select lives_ok($$ select public.mark_notifications_read() $$, 'Marking them read works');
select is(
  (select count(*) from public.notifications where read_at is null),
  0::bigint,
  'and leaves none unread'
);
select pg_temp.logout();
select ok(
  exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000201' and read_at is null),
  'without touching anyone else''s'
);

select pg_temp.login_as_visitor();
select throws_ok($$ select count(*) from public.notifications $$, '42501', null, 'Signed-out visitors can''t read notifications');
select throws_ok($$ select public.mark_notifications_read() $$, '42501', null, 'nor use the notification functions');
select pg_temp.logout();

-- Push subscriptions ---------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.save_push_subscription('{"endpoint": "http://example.com/x", "keys": {"p256dh": "a", "auth": "b"}}') $$,
  'P0001', 'That isn''t a valid push subscription', 'Junk subscriptions are refused'
);
select lives_ok(
  $$ select public.save_push_subscription(jsonb_build_object(
       'endpoint', 'https://fcm.googleapis.com/fcm/send/device-1',
       'keys', jsonb_build_object('p256dh', repeat('B', 87), 'auth', repeat('a', 22)))) $$,
  'A browser''s subscription is saved'
);
select pg_temp.logout();
select is(
  (select user_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1'),
  '00000000-0000-0000-0000-000000000101'::uuid,
  'for the person who turned notifications on'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select count(*) from public.push_subscriptions $$, '42501', null, 'Subscriptions can''t be read through the API');

-- Someone else signs in on the same phone.
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.save_push_subscription(jsonb_build_object(
  'endpoint', 'https://fcm.googleapis.com/fcm/send/device-1',
  'keys', jsonb_build_object('p256dh', repeat('C', 87), 'auth', repeat('c', 22))));
select pg_temp.logout();
select is(
  (select user_id from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1'),
  '00000000-0000-0000-0000-000000000201'::uuid,
  'A device that changes hands notifies its new owner only'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.remove_push_subscription('https://fcm.googleapis.com/fcm/send/device-1');
select pg_temp.logout();
select ok(exists (select 1 from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/device-1'),
  'People can''t remove someone else''s device');

-- The sender's keys and deliveries ---------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(public.push_public_key(), null, 'No public key until the sender has set itself up');
select throws_ok($$ select public.push_store_keys('k', '{}') $$, '42501', null, 'Only the sender can store keys');
select throws_ok($$ select public.push_take_delivery(gen_random_uuid()) $$, '42501', null, 'or take deliveries');
select throws_ok($$ select public.push_forget(array['x']) $$, '42501', null, 'or forget devices');

select pg_temp.as_service();
select is(public.push_store_keys('public-1', '{"d": "secret-1"}'), 'public-1', 'The sender stores its key pair');
select is(public.push_store_keys('public-2', '{"d": "secret-2"}'), 'public-1', 'once: later calls keep the first');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(public.push_public_key(), 'public-1', 'Browsers can then get the public key');

-- Phone deliveries are only asked for where the sender is set up, for people with devices.
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.send_test_notification();
select pg_temp.logout();
select ok(
  not pg_temp.push_requested((select id from public.notifications where user_id = '00000000-0000-0000-0000-000000000201'
                              and title = 'Notifications are on')),
  'No phone delivery is asked for when the sender isn''t set up in this database'
);

insert into private.settings (name, value) values ('push_function_url', 'https://example.invalid/functions/v1/send-push');
update public.notifications set created_at = created_at - interval '1 minute' where title = 'Notifications are on';
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.send_test_notification() $$, 'Test notifications can be sent');
select throws_ok($$ select public.send_test_notification() $$, 'P0001', 'Wait a moment before sending another test',
  'but not over and over');
select pg_temp.logout();
select case when to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
  then skip('pg_net isn''t installed here', 2)
  else collect_tap(
    ok(pg_temp.push_requested((select id from public.notifications where user_id = '00000000-0000-0000-0000-000000000201'
                               and title = 'Notifications are on' order by created_at desc limit 1)),
       'With the sender set up, a notification for someone with a device asks for a phone delivery'),
    ok(not pg_temp.push_requested((select id from public.notifications where user_id = '00000000-0000-0000-0000-000000000101'
                                   order by created_at desc limit 1)),
       'and none is asked for someone without devices'))
  end;

select pg_temp.as_service();
select is(
  (select public.push_take_delivery(n.id) - 'vapid' - 'tag' from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000201' and n.title = 'Notifications are on'
   order by n.created_at desc limit 1),
  jsonb_build_object(
    'title', 'Notifications are on',
    'body', 'You''ll hear from PatchUp here when something happens with your bookings.',
    'url', '/notifications',
    'subscriptions', jsonb_build_array(jsonb_build_object(
      'endpoint', 'https://fcm.googleapis.com/fcm/send/device-1', 'p256dh', repeat('C', 87), 'auth', repeat('c', 22)))),
  'The sender gets what to show and the person''s devices'
);
select is(
  (select public.push_take_delivery(n.id) -> 'vapid' from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000201' and n.title = 'Notifications are on'
   order by n.created_at asc limit 1),
  '{"public_key": "public-1", "private_jwk": {"d": "secret-1"}}'::jsonb,
  'and the keys to sign with'
);
select is(
  (select public.push_take_delivery(n.id) from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000201' and n.title = 'Notifications are on'
   order by n.created_at desc limit 1),
  null,
  'Each notification is delivered once'
);
select is(
  (select public.push_take_delivery(n.id) ->> 'tag' from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000201' and n.booking_id = pg_temp.booking('heater') limit 1),
  pg_temp.booking('heater')::text,
  'A booking''s updates share a tag, so the newest replaces the last on the phone'
);
select lives_ok($$ select public.push_forget(array['https://fcm.googleapis.com/fcm/send/device-1']) $$, 'The sender forgets dead devices');
select pg_temp.logout();
select ok(not exists (select 1 from public.push_subscriptions), 'and they''re gone');

-- Formatting ------------------------------------------------------------------------------

select is(private.peso(850), '₱850', 'Whole pesos without centavos');
select is(private.peso(1250.5), '₱1,250.50', 'centavos when there are some');
select is(private.peso(1000000), '₱1,000,000', 'and thousands separated');
select is(
  private.visit_time('2026-10-19 02:00:00+00'),
  'Mon, Oct 19, 10:00 AM',
  'Times are in Manila time, like the app'
);

select * from finish();
rollback;
