-- Technicians' time off: taking days off (checked: in order, not in the
-- past, within a year, up to 60 days, no overlap, not over a job they have),
-- who sees it (signed-in people an approved technician's coming days off;
-- technicians all theirs; admins everyone's; not visitors), where it counts
-- (like working hours: asking for them, moving a visit, requests for anyone),
-- and taking it back. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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
-- Next week in Manila: a day (days after Monday), and a time on it.
create function pg_temp.day(p_days integer) returns date language sql stable as $$
  select (date_trunc('week', now() at time zone 'Asia/Manila') + make_interval(days => 7 + p_days))::date;
$$;
create function pg_temp.at(p_days integer, p_hour integer) returns timestamptz language sql stable as $$
  select (date_trunc('week', now() at time zone 'Asia/Manila') + make_interval(days => 7 + p_days, hours => p_hour))
         at time zone 'Asia/Manila';
$$;
create function pg_temp.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;
create function pg_temp.told(p_user uuid, p_title text, p_booking text) returns boolean language sql stable as $$
  select exists (select 1 from public.notifications
                 where user_id = p_user and title = p_title and booking_id = current_setting(p_booking)::uuid);
$$;
create function pg_temp.count_for(p_technician uuid) returns integer language sql stable as $$
  select count(*)::integer from public.technician_time_off where technician_id = p_technician;
$$;

-- People: ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers); ...203 Pia (waiting); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
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
-- Tess has a job next Wednesday at 10.
insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                             street, barangay, city, province, inspection_fee)
select '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', c.id, 'Shower', 'Leaks',
       pg_temp.at(2, 10), 'accepted', '3 Rizal Ave', 'Kapitolyo', 'Pasig', 'Metro Manila', 300
from public.service_categories c where c.slug = 'plumbing';
select set_config('test.wednesday_job', private.visit_time(pg_temp.at(2, 10)), true);

-- Taking days off --------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select set_config('test.weekend', (public.add_time_off(pg_temp.day(5), pg_temp.day(6))).id::text, true);
select is(pg_temp.count_for('00000000-0000-0000-0000-000000000201'), 1, 'A technician takes days off');
select throws_ok($$ select public.add_time_off(pg_temp.day(6), pg_temp.day(8)) $$,
  'P0001', 'You''re already off on some of those days', 'Not overlapping time off they have');
select throws_ok($$ select public.add_time_off(pg_temp.day(6), pg_temp.day(5)) $$,
  'P0001', 'Pick your first and last day off, in that order', 'First day, then last');
select throws_ok($$ select public.add_time_off(pg_temp.today() - 1, pg_temp.today()) $$,
  'P0001', 'Time off can''t start in the past', 'Not in the past');
select throws_ok($$ select public.add_time_off(pg_temp.today() + 366, pg_temp.today() + 366) $$,
  'P0001', 'Pick days within the next year', 'Within the next year');
select throws_ok($$ select public.add_time_off(pg_temp.day(20), pg_temp.day(90)) $$,
  'P0001', 'Take up to 60 days at a time. To stop new jobs for longer, turn off Taking new jobs.', 'Up to 60 days at a time');
select throws_ok($$ select public.add_time_off(pg_temp.day(2), pg_temp.day(2)) $$,
  'P0001', 'You have a job then: Shower, ' || current_setting('test.wednesday_job') || '. Give it back first, or pick other days.',
  'Not over a job they have');
select throws_ok($$ insert into public.technician_time_off (technician_id, starts_on, ends_on)
                    values ('00000000-0000-0000-0000-000000000201', pg_temp.day(9), pg_temp.day(9)) $$,
  '42501', null, 'Time off can''t be written directly');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select public.add_time_off(pg_temp.day(5), pg_temp.day(5)) $$,
  '42501', 'Only technicians take time off', 'Customers can''t take time off');
select pg_temp.login_as('00000000-0000-0000-0000-000000000203');
select lives_ok($$ select public.add_time_off(pg_temp.day(5), pg_temp.day(5)) $$, 'A technician waiting for approval can');
select pg_temp.logout();
-- Time off Tess had last week.
insert into public.technician_time_off (technician_id, starts_on, ends_on)
values ('00000000-0000-0000-0000-000000000201', pg_temp.today() - 10, pg_temp.today() - 8);

-- Who sees it ---------------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.count_for('00000000-0000-0000-0000-000000000201'), 1, 'Customers see an approved technician''s coming days off, not past ones');
select is(pg_temp.count_for('00000000-0000-0000-0000-000000000203'), 0, 'nor those of one waiting for approval');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.count_for('00000000-0000-0000-0000-000000000201'), 2, 'Technicians see all of theirs');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(pg_temp.count_for('00000000-0000-0000-0000-000000000203'), 1, 'Admins see everyone''s');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.technician_time_off $$, '42501', null, 'Visitors can''t see when someone is away');
select pg_temp.logout();

-- Where it counts -----------------------------------------------------------------------------------------------
select ok(not private.works_at('00000000-0000-0000-0000-000000000201', pg_temp.at(5, 10)), 'Tess doesn''t work on her day off');
select ok(private.works_at('00000000-0000-0000-0000-000000000201', pg_temp.at(4, 10)), 'but does the day before (no hours set: any time)');
select ok(private.works_at('00000000-0000-0000-0000-000000000202', pg_temp.at(5, 10)), 'Rey works that day');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101', 'Sink', 'Leaks',
       pg_temp.at(5, 10), '', '00000000-0000-0000-0000-000000000201') $$,
  'P0001', 'That''s outside the technician''s working hours. Pick another time, or any available technician.',
  'Asking for her on a day off is refused'
);
select set_config('test.open', (public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101',
  'Faucet', 'Drips', pg_temp.at(5, 10))).id::text, true);
select set_config('test.asked', (public.create_booking(current_setting('test.plumbing')::uuid, '00000000-0000-0000-0000-00000000a101',
  'Heater', 'No hot water', pg_temp.at(4, 10), '', '00000000-0000-0000-0000-000000000201')).id::text, true);
select throws_ok($$ select public.reschedule_booking(current_setting('test.asked')::uuid, pg_temp.at(5, 13)) $$,
  'P0001', 'That''s outside Tess''s working hours. Pick another time.', 'A visit can''t move onto her day off');
select pg_temp.logout();
select ok(pg_temp.told('00000000-0000-0000-0000-000000000202', 'New plumbing request', 'test.open')
          and not pg_temp.told('00000000-0000-0000-0000-000000000201', 'New plumbing request', 'test.open'),
  'A request for anyone that day reaches the technicians working, not her');

-- Taking it back ------------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select throws_ok($$ select public.remove_time_off(current_setting('test.weekend')::uuid) $$,
  'P0002', 'Time off not found', 'Nobody else can take back her time off');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.remove_time_off(current_setting('test.weekend')::uuid);
select pg_temp.logout();
select ok(private.works_at('00000000-0000-0000-0000-000000000201', pg_temp.at(5, 10)), 'Taking it back, she works that day again');

select * from finish();
rollback;
