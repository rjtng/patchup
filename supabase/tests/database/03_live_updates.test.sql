-- Live updates: which channel topics hear about a booking change, and who may
-- listen to each topic. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create function pg_temp.login_as(user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
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
-- The topics for a booking as it is now, and as if it had changed from `p_before`.
create function pg_temp.topics(p_name text, p_before jsonb default null) returns text[] language sql stable as $$
  select private.booking_topics(b, case when p_before is not null then jsonb_populate_record(b, p_before) end)
  from public.bookings b where b.id = pg_temp.booking(p_name);
$$;

-- People:  ...101 Ana, ...102 Ben (customers)
--          ...201 Tess (approved, available, plumbing)
--          ...202 Eli  (approved, available, electrical)
--          ...204 Rey  (approved, plumbing, not taking jobs)
--          ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'eli@example.com', '{"full_name": "Eli Garcia", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000204', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
update public.technician_profiles set verification_status = 'approved', is_available = false
where id = '00000000-0000-0000-0000-000000000204';
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000202', pg_temp.category('electrical')),
  ('00000000-0000-0000-0000-000000000204', pg_temp.category('plumbing'));
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-000000000102', '5 Rizal Ave', 'Poblacion', 'Makati', 'Metro Manila');

-- Ana asks anyone for a plumber; Ben asks for Tess by name.
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'open', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Kitchen faucet', problem => 'Leaking', scheduled_at => now() + interval '1 day');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
insert into booking_ids select 'direct', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a102',
  appliance => 'Shower', problem => 'No pressure', scheduled_at => now() + interval '1 day',
  technician_id => '00000000-0000-0000-0000-000000000201');
select pg_temp.logout();

-- Which topics -------------------------------------------------------------------

select has_trigger('public', 'bookings', 'bookings_broadcast_changes', 'Booking changes are broadcast');

select is(
  pg_temp.topics('open'),
  array['booking:' || pg_temp.booking('open'), 'user:00000000-0000-0000-0000-000000000101', 'requests:' || pg_temp.category('plumbing')],
  'A new open request: its page, the customer, and the category''s technicians'
);
select is(
  pg_temp.topics('direct'),
  array['booking:' || pg_temp.booking('direct'), 'user:00000000-0000-0000-0000-000000000102', 'user:00000000-0000-0000-0000-000000000201'],
  'A request for a named technician: its page, the customer and that technician, not the whole category'
);

-- Tess takes the open request.
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.accept_booking(pg_temp.booking('open')) $$, 'Booking actions still work with live updates on');
select pg_temp.logout();
select is(
  pg_temp.topics('open', '{"status": "requested", "technician_id": null}'),
  array['booking:' || pg_temp.booking('open'), 'user:00000000-0000-0000-0000-000000000101',
        'user:00000000-0000-0000-0000-000000000201', 'requests:' || pg_temp.category('plumbing')],
  'Taking an open request also tells the category, so it leaves the other technicians'' lists'
);
select is(
  pg_temp.topics('open', '{"status": "accepted"}'),
  array['booking:' || pg_temp.booking('open'), 'user:00000000-0000-0000-0000-000000000101', 'user:00000000-0000-0000-0000-000000000201'],
  'Later steps (on the way, arrived, …) go to the booking, the customer and the technician'
);
select is(
  pg_temp.topics('direct', '{"status": "accepted", "technician_id": "00000000-0000-0000-0000-000000000202"}'),
  array['booking:' || pg_temp.booking('direct'), 'user:00000000-0000-0000-0000-000000000102',
        'user:00000000-0000-0000-0000-000000000201', 'user:00000000-0000-0000-0000-000000000202'],
  'A technician who''s replaced hears about it too'
);

-- Tess gives the job back: it's open to the category again.
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.decline_booking(pg_temp.booking('open')) $$, 'Tess gives it back');
select pg_temp.logout();
select is(
  pg_temp.topics('open', '{"status": "accepted", "technician_id": "00000000-0000-0000-0000-000000000201"}'),
  array['booking:' || pg_temp.booking('open'), 'user:00000000-0000-0000-0000-000000000101',
        'user:00000000-0000-0000-0000-000000000201', 'requests:' || pg_temp.category('plumbing')],
  'Giving a job back tells the technician who had it and the category'
);

-- Who may listen ------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select ok(private.can_listen('user:00000000-0000-0000-0000-000000000101'), 'Customers hear about their own bookings');
select ok(not private.can_listen('user:00000000-0000-0000-0000-000000000102'), 'but not about someone else''s');
select ok(private.can_listen('booking:' || pg_temp.booking('open')), 'Customers can follow their own booking');
select ok(not private.can_listen('booking:' || pg_temp.booking('direct')), 'but not another customer''s');
select ok(not private.can_listen('requests:' || pg_temp.category('plumbing')), 'Customers don''t get the technicians'' requests');

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select ok(private.can_listen('requests:' || pg_temp.category('plumbing')), 'A plumber taking jobs hears about plumbing requests');
select ok(not private.can_listen('requests:' || pg_temp.category('electrical')), 'but not electrical ones');
select ok(private.can_listen('booking:' || pg_temp.booking('open')), 'and can follow an open request they could take');
select ok(private.can_listen('booking:' || pg_temp.booking('direct')), 'and a request made to them by name');
select ok(private.can_listen('user:00000000-0000-0000-0000-000000000201'), 'Technicians hear about their own jobs');

select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select ok(not private.can_listen('booking:' || pg_temp.booking('open')), 'An electrician can''t follow a plumbing request');
select ok(not private.can_listen('booking:' || pg_temp.booking('direct')), 'nor a request made to someone else');

select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
select ok(not private.can_listen('requests:' || pg_temp.category('plumbing')), 'A plumber not taking jobs doesn''t get requests');
select ok(not private.can_listen('booking:' || pg_temp.booking('open')), 'nor follow open ones');

-- Once Tess has it, the other plumbers lose sight of it (and its topic).
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.accept_booking(pg_temp.booking('open')) $$, 'Tess takes it again');
select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
update public.technician_profiles set is_available = true where id = '00000000-0000-0000-0000-000000000204';
select ok(private.can_listen('requests:' || pg_temp.category('plumbing')), 'Taking jobs again brings the requests back');
select ok(not private.can_listen('booking:' || pg_temp.booking('open')), 'but not a request someone else has taken');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select ok(private.can_listen('booking:' || pg_temp.booking('direct')), 'Admins can follow any booking');
select ok(not private.can_listen('user:00000000-0000-0000-0000-000000000101'), 'but not someone''s personal topic');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select ok(not private.can_listen('user:00000000-0000-0000-0000-00000000010'), 'Malformed topics are refused');
select ok(not private.can_listen('USER:00000000-0000-0000-0000-000000000101'), 'Topic names are exact');
select ok(not private.can_listen('user:00000000-0000-0000-0000-000000000101:extra'), 'Nothing may follow the id');
select ok(not private.can_listen('chat:00000000-0000-0000-0000-000000000101'), 'Unknown kinds of topic are refused');
select ok(not coalesce(private.can_listen(null), false), 'No topic, no access');
select pg_temp.logout();

-- The policy itself goes on Realtime's table, wherever Realtime is set up.
select ok(
  to_regclass('realtime.messages') is null
  or exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
             and policyname = 'Listen to live updates about what you can see'),
  'Realtime checks who may listen with private.can_listen'
);

select * from finish();
rollback;
