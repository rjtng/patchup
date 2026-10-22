-- Repair warranty: asking for a return visit (the customer of a repair done
-- in the last 30 days; not an inspection only, a return visit itself, or a
-- second one; within the technician's hours and when they're free), what it
-- is (same item and address, no inspection fee, for the technician who did
-- the repair), that it never goes to the other technicians (turned down,
-- unanswered, or its technician can't take jobs: admins give it to someone),
-- coming to nothing to pay, and the counts admins see. Run with
-- `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
-- Next week in Manila: a time on a day (days after Monday).
create function pg_temp.at(p_days integer, p_hour integer) returns timestamptz language sql stable as $$
  select (date_trunc('week', now() at time zone 'Asia/Manila') + make_interval(days => 7 + p_days, hours => p_hour))
         at time zone 'Asia/Manila';
$$;
-- What someone was told about a booking, under a title (the latest).
create function pg_temp.heard(p_user uuid, p_title text, p_booking text) returns text language sql stable as $$
  select body from public.notifications
  where user_id = p_user and title = p_title and booking_id = current_setting(p_booking)::uuid
  order by created_at desc limit 1;
$$;
create function pg_temp.id(p_name text) returns uuid language sql stable as $$
  select current_setting(p_name)::uuid;
$$;

-- People: ...101 Ana, ...102 Ben, ...103 Cara (suspended) (customers); ...201 Tess (works Mon–Fri 8–5),
-- ...202 Rey (approved plumbers); ...203 Pia (a plumber, suspended); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000103', 'cara@example.com', '{"full_name": "Cara Lim"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'pia@example.com', '{"full_name": "Pia Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
update public.technician_profiles set verification_status = 'suspended' where id = '00000000-0000-0000-0000-000000000203';
insert into public.technician_services (technician_id, category_id)
select t.id, c.id from public.service_categories c,
  (values ('00000000-0000-0000-0000-000000000201'::uuid), ('00000000-0000-0000-0000-000000000202'::uuid),
          ('00000000-0000-0000-0000-000000000203'::uuid)) t (id)
where c.slug = 'plumbing';
insert into public.technician_hours (technician_id, weekday, first_visit, last_visit)
select '00000000-0000-0000-0000-000000000201', d, '08:00', '17:00' from generate_series(1, 5) d;
insert into public.account_suspensions (user_id, reason) values ('00000000-0000-0000-0000-000000000103', 'Abusive messages');
select set_config('test.plumbing', (select id::text from public.service_categories where slug = 'plumbing'), true);

-- Jobs done (ids ...b0..):        whose       by       item               done             a repair?
insert into public.bookings (id, customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                             street, barangay, city, province, landmark, latitude, longitude, inspection_fee,
                             final_amount, completed_at)
select v.id, v.customer, v.technician, c.id, v.appliance, 'Leaks', v.done - interval '2 hours', 'completed',
       '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 'Blue gate', 14.57, 121.08, 300, 800, v.done
from public.service_categories c,
  (values
    ('00000000-0000-0000-0000-00000000b001'::uuid, '00000000-0000-0000-0000-000000000101'::uuid,
     '00000000-0000-0000-0000-000000000201'::uuid, 'Kitchen faucet', now() - interval '3 days'),
    ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-000000000101',
     '00000000-0000-0000-0000-000000000201', 'Toilet', now() - interval '2 days'),         -- inspection only
    ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-000000000101',
     '00000000-0000-0000-0000-000000000201', 'Shower', now() - interval '31 days'),
    ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-000000000102',
     '00000000-0000-0000-0000-000000000203', 'Water heater', now() - interval '2 days'),  -- by Pia
    ('00000000-0000-0000-0000-00000000b005', '00000000-0000-0000-0000-000000000103',
     '00000000-0000-0000-0000-000000000201', 'Sink', now() - interval '2 days'),          -- Cara's
    ('00000000-0000-0000-0000-00000000b006', '00000000-0000-0000-0000-000000000101',
     '00000000-0000-0000-0000-000000000201', 'Aircon drain', now() - interval '1 day')
  ) v (id, customer, technician, appliance, done)
where c.slug = 'plumbing';
update public.bookings set final_amount = 300 where id = '00000000-0000-0000-0000-00000000b002';
insert into public.quotes (booking_id, technician_id, items, total, status, responded_at)
select b.id, b.technician_id, '[{"description": "Replace cartridge", "amount": 500}]', 500, 'approved', b.completed_at
from public.bookings b where b.id <> '00000000-0000-0000-0000-00000000b002' and b.status = 'completed';
-- Coming up: Tess's job for Ben on Wednesday at 10, Ana's with her on Thursday at 1, and Ben's open request on Thursday at 10.
insert into public.bookings (id, customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                             street, barangay, city, province, inspection_fee)
select v.id, v.customer, v.technician, c.id, v.appliance, 'Leaks', v.at, v.status,
       '3 Rizal Ave', 'Kapitolyo', 'Pasig', 'Metro Manila', 300
from public.service_categories c,
  (values
    ('00000000-0000-0000-0000-00000000b101'::uuid, '00000000-0000-0000-0000-000000000102'::uuid,
     '00000000-0000-0000-0000-000000000201'::uuid, 'Bidet', pg_temp.at(2, 10), 'accepted'::public.booking_status),
    ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-000000000101',
     '00000000-0000-0000-0000-000000000201', 'Bathtub', pg_temp.at(3, 13), 'accepted'),
    ('00000000-0000-0000-0000-00000000b103', '00000000-0000-0000-0000-000000000102',
     null, 'Drain', pg_temp.at(3, 10), 'requested')
  ) v (id, customer, technician, appliance, at, status)
where c.slug = 'plumbing';
select set_config('test.repair', '00000000-0000-0000-0000-00000000b001', true);
select set_config('test.open', '00000000-0000-0000-0000-00000000b103', true);
select set_config('test.tuesday', private.visit_time(pg_temp.at(1, 10)), true);

-- Asking ------------------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Dripping again', pg_temp.at(1, 10)) $$,
  '42501', 'Only the customer who booked can do that', 'Only the repair''s customer can ask');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.request_return_visit('00000000-0000-0000-0000-00000000b002', 'Running again', pg_temp.at(1, 10)) $$,
  'P0001', 'The warranty covers repairs, and this visit was an inspection only', 'Not for an inspection only');
select throws_ok($$ select public.request_return_visit('00000000-0000-0000-0000-00000000b003', 'Leaking again', pg_temp.at(1, 10)) $$,
  'P0001', 'The 30-day warranty on this repair ended on '
    || to_char((now() - interval '1 day') at time zone 'Asia/Manila', 'Mon FMDD, YYYY'),
  'Not after 30 days');
select throws_ok($$ select public.request_return_visit('00000000-0000-0000-0000-00000000b102', 'Leaking', pg_temp.at(1, 10)) $$,
  'P0001', 'You can ask for a return visit once the repair is done', 'Not before the job is done');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), '  ', pg_temp.at(1, 10)) $$,
  'P0001', 'Say what''s wrong now, in up to 2,000 characters', 'Saying what''s wrong');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Dripping again', now() - interval '1 hour') $$,
  'P0001', 'Pick a time within the next 90 days', 'At a time to come');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Dripping again', pg_temp.at(5, 10)) $$,
  'P0001', 'That''s outside Tess''s working hours. Pick another time.', 'When the technician works');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Dripping again', pg_temp.at(2, 11)) $$,
  'P0001', 'Tess already has a job then. Pick another time.', 'and is free');
select set_config('test.visit',
  (public.request_return_visit(pg_temp.id('test.repair'), '  Dripping again  ', pg_temp.at(1, 10))).id::text, true);
select pg_temp.logout();
select ok(exists (
  select 1 from public.bookings b
  where b.id = pg_temp.id('test.visit') and b.return_of = pg_temp.id('test.repair')
    and b.customer_id = '00000000-0000-0000-0000-000000000101' and b.technician_id = '00000000-0000-0000-0000-000000000201'
    and b.status = 'requested' and b.inspection_fee = 0 and b.discount = 0 and b.appliance = 'Kitchen faucet'
    and b.problem = 'Dripping again' and b.street = '12 Mabini St' and b.landmark = 'Blue gate' and b.latitude = 14.57
), 'A return visit: the same item and address, no inspection fee, for the technician who did the repair');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000201', 'Return visit for you', 'test.visit'),
  'Ana says your repair needs another look: Kitchen faucet in San Antonio, Pasig · ' || current_setting('test.tuesday')
    || '. It''s under warranty: no inspection fee.',
  'She''s told');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Still dripping', pg_temp.at(1, 15)) $$,
  'P0001', 'You''ve already asked for a return visit for this repair', 'One at a time');
select pg_temp.login_as('00000000-0000-0000-0000-000000000103');
select throws_ok($$ select public.request_return_visit('00000000-0000-0000-0000-00000000b005', 'Clogged again', pg_temp.at(1, 10)) $$,
  '42501', 'Your account is suspended, so you can''t book new repairs. Write to PatchUp to sort it out.',
  'Not with a suspended account');
select pg_temp.login_as_visitor();
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Dripping again', pg_temp.at(1, 15)) $$,
  '42501', null, 'Visitors can''t ask');
select pg_temp.logout();
select throws_ok($$
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at,
                               street, barangay, city, province, inspection_fee, return_of)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', current_setting('test.plumbing')::uuid,
          'Kitchen faucet', 'Again', pg_temp.at(4, 10), '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 0,
          pg_temp.id('test.repair')) $$,
  '23505', null, 'The database holds a repair to one return visit');

-- Turned down: for admins, not the other technicians ------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.decline_booking(pg_temp.id('test.visit'));
select pg_temp.logout();
select ok((select status = 'requested' and technician_id is null from public.bookings where id = pg_temp.id('test.visit')),
  'Tess turns it down');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000901', 'Return visit needs a technician', 'test.visit'),
  'Plumbing: Kitchen faucet in San Antonio, Pasig · ' || current_setting('test.tuesday')
    || '. Tess Cruz turned it down. Give it to someone, or it''s cancelled at the visit time.',
  'Admins are told to give it to someone');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000101', 'Finding you another technician', 'test.visit'),
  'Your technician can''t make it, so the PatchUp team is finding someone for your return visit. Plumbing: Kitchen faucet',
  'and so is Ana');
select ok(pg_temp.heard('00000000-0000-0000-0000-000000000202', 'New plumbing request', 'test.visit') is null,
  'The other technicians aren''t');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select ok((select count(*) from public.bookings where id = pg_temp.id('test.visit')) = 0
          and (select count(*) from public.bookings where id = pg_temp.id('test.open')) = 1,
  'nor see it, as they do open requests');
select throws_ok($$ select public.accept_booking(pg_temp.id('test.visit')) $$,
  'P0001', 'This booking is no longer available', 'nor take it');
select pg_temp.logout();
select ok(not exists (
  select 1 from public.bookings b
  where b.id = pg_temp.id('test.visit') and ('requests:' || b.category_id) = any (private.booking_topics(b, b))
), 'nor hear of it live');

-- An admin gives it to Rey, who finds nothing to charge ---------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.assign_technician(pg_temp.id('test.visit'), '00000000-0000-0000-0000-000000000202');
select pg_temp.logout();
select is(pg_temp.heard('00000000-0000-0000-0000-000000000202', 'Return visit for you', 'test.visit'),
  'Kitchen faucet in San Antonio, Pasig · ' || current_setting('test.tuesday') || '. It''s under warranty: no inspection fee.',
  'Rey is told it''s under warranty');
select ok(pg_temp.heard('00000000-0000-0000-0000-000000000101', 'Rey Tan will do your return visit', 'test.visit') is not null,
  'and Ana who''s coming');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select public.mark_arrived(pg_temp.id('test.visit'));
select public.complete_booking(pg_temp.id('test.visit'));
select pg_temp.logout();
select is(pg_temp.heard('00000000-0000-0000-0000-000000000101', 'Job done', 'test.visit'),
  'Nothing to pay. How did it go? Tap to rate Rey Tan.', 'With no new parts, there''s nothing to pay');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.repair'), 'Dripping again', pg_temp.at(4, 10)) $$,
  'P0001', 'You''ve already asked for a return visit for this repair', 'A repair gets one return visit');
select throws_ok($$ select public.request_return_visit(pg_temp.id('test.visit'), 'Dripping again', pg_temp.at(4, 10)) $$,
  'P0001', 'This was a return visit already. If the problem is still there, report a problem and PatchUp will help.',
  'and a return visit has no warranty of its own');

-- A technician who can't take jobs any more; cancelling ---------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select set_config('test.pia_visit',
  (public.request_return_visit('00000000-0000-0000-0000-00000000b004', 'No hot water again', pg_temp.at(5, 10))).id::text, true);
select pg_temp.logout();
select is(pg_temp.heard('00000000-0000-0000-0000-000000000901', 'Return visit needs a technician', 'test.pia_visit'),
  'Plumbing: Water heater in San Antonio, Pasig · ' || private.visit_time(pg_temp.at(5, 10))
    || '. The technician who did the repair can''t take jobs now. Give it to someone, or it''s cancelled at the visit time.',
  'When the technician who did it can''t take jobs, admins give it to someone');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select public.cancel_booking(pg_temp.id('test.pia_visit'));
select lives_ok($$ select public.request_return_visit('00000000-0000-0000-0000-00000000b004', 'No hot water', pg_temp.at(5, 13)) $$,
  'Once one is cancelled, the customer can ask again');

-- Unanswered: it doesn't open to the others ---------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select set_config('test.aircon',
  (public.request_return_visit('00000000-0000-0000-0000-00000000b006', 'Dripping inside', pg_temp.at(3, 10))).id::text, true);
select pg_temp.logout();
update public.bookings set created_at = now() - interval '31 minutes' where id = pg_temp.id('test.aircon');
update public.booking_events set created_at = now() - interval '31 minutes' where booking_id = pg_temp.id('test.aircon');
select private.follow_up_requests();
select ok((select technician_id is null from public.bookings where id = pg_temp.id('test.aircon'))
          and pg_temp.heard('00000000-0000-0000-0000-000000000901', 'No technician yet', 'test.aircon') is not null
          and pg_temp.heard('00000000-0000-0000-0000-000000000202', 'Still open: plumbing request', 'test.aircon') is null,
  'Unanswered, it goes to admins, not the other technicians');

-- Counts ---------------------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select results_eq(
  $$ select repairs, return_visits from public.return_visit_counts('00000000-0000-0000-0000-000000000201') $$,
  $$ values (4, 2) $$,
  'Admins see a technician''s repairs, and how many had a return visit (not inspections or cancelled ones)'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is_empty($$ select * from public.return_visit_counts('00000000-0000-0000-0000-000000000201') $$,
  'Technicians see only their own');
select pg_temp.logout();

select * from finish();
rollback;
