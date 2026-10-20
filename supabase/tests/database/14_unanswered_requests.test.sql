-- Requests nobody accepts: the follow-up job tells admins (and the customer,
-- and the technicians who could take it) about requests waiting too long,
-- opens a chosen technician's unanswered request to the others, and cancels
-- the requests nobody took before the visit time.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
-- The bookings are named by their item.
create function pg_temp.booking(p_item text) returns uuid language sql stable as $$
  select id from public.bookings where appliance = p_item;
$$;
-- A plumbing request made p_ago ago for a visit p_visit_in from now, as
-- create_booking makes it (with its 'created' event), optionally for a chosen technician.
create function pg_temp.request(p_item text, p_customer uuid, p_ago interval, p_visit_in interval, p_technician uuid default null)
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at,
                               street, barangay, city, province, inspection_fee, created_at)
  select p_customer, p_technician, c.id, p_item, 'Leaking', now() + p_visit_in,
         '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300, now() - p_ago
  from public.service_categories c where c.slug = 'plumbing'
  returning id into v_id;
  insert into public.booking_events (booking_id, actor_id, event, status, created_at)
  values (v_id, p_customer, 'created', 'requested', now() - p_ago);
end;
$$;
create function pg_temp.event(p_item text, p_event text, p_ago interval, p_actor uuid default null) returns void language sql as $$
  insert into public.booking_events (booking_id, actor_id, event, status, created_at)
  values (pg_temp.booking(p_item), p_actor, p_event, 'requested', now() - p_ago);
$$;
create function pg_temp.flagged() returns text language sql stable as $$
  select string_agg(b.appliance, ', ' order by b.appliance)
  from public.booking_events e join public.bookings b on b.id = e.booking_id
  where e.event = 'overdue';
$$;
create function pg_temp.heard(p_user uuid, p_title text) returns bigint language sql stable as $$
  select count(*) from public.notifications where user_id = p_user and title = p_title;
$$;

-- People:  ...101 Ana, ...102 Ben, ...103 Cara (customers)
--          ...201 Tess, ...202 Rey (approved plumbers, taking jobs); ...203 Ed (electrician)
--          ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000103', 'cara@example.com', '{"full_name": "Cara Lim"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'ed@example.com', '{"full_name": "Ed Go", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000203');
insert into public.technician_services (technician_id, category_id)
select t.id::uuid, c.id
from (values ('00000000-0000-0000-0000-000000000201', 'plumbing'), ('00000000-0000-0000-0000-000000000202', 'plumbing'),
             ('00000000-0000-0000-0000-000000000203', 'electrical')) t (id, slug)
join public.service_categories c on c.slug = t.slug;

-- Waiting                                   made     visit in
select pg_temp.request('Sink',          '00000000-0000-0000-0000-000000000101', '40 minutes', '1 day');
select pg_temp.request('Faucet',        '00000000-0000-0000-0000-000000000102', '20 minutes', '1 day');
select pg_temp.request('Toilet',        '00000000-0000-0000-0000-000000000102', '15 minutes', '90 minutes');
select pg_temp.request('Shower',        '00000000-0000-0000-0000-000000000102', '5 minutes',  '90 minutes');
select pg_temp.request('Water heater',  '00000000-0000-0000-0000-000000000102', '40 minutes', '1 day',
                       '00000000-0000-0000-0000-000000000202');  -- for Rey, who hasn't answered
-- Given back by a technician 20 and 40 minutes ago; the second had been flagged before.
select pg_temp.request('Pipe',          '00000000-0000-0000-0000-000000000102', '3 hours', '1 day');
select pg_temp.event('Pipe', 'declined', '20 minutes', '00000000-0000-0000-0000-000000000201');
select pg_temp.request('Drain',         '00000000-0000-0000-0000-000000000102', '3 hours', '1 day');
select pg_temp.event('Drain', 'overdue', '2 hours');
select pg_temp.event('Drain', 'declined', '40 minutes', '00000000-0000-0000-0000-000000000201');
-- Flagged two hours ago, still waiting.
select pg_temp.request('Tank',          '00000000-0000-0000-0000-000000000102', '3 hours', '1 day');
select pg_temp.event('Tank', 'overdue', '2 hours');
-- Visit time passed: Cara's first booking, nobody took it; and one Tess took.
select pg_temp.request('Bidet',         '00000000-0000-0000-0000-000000000103', '2 days', '-10 minutes');
select pg_temp.request('Bathtub',       '00000000-0000-0000-0000-000000000102', '2 days', '-10 minutes');
update public.bookings set status = 'accepted', technician_id = '00000000-0000-0000-0000-000000000201'
where id = pg_temp.booking('Bathtub');
delete from public.notifications; -- from setting up; only the follow-up's count below

-- The rule ------------------------------------------------------------------------------
select is(private.follow_up_at('2026-10-20 08:00+08', '2026-10-21 10:00+08'), '2026-10-20 08:30+08'::timestamptz,
  'A request is followed up after 30 minutes');
select is(private.follow_up_at('2026-10-20 08:00+08', '2026-10-20 09:30+08'), '2026-10-20 08:10+08'::timestamptz,
  'or after 10 when the visit is under 2 hours away');
select is(private.follow_up_at('2026-10-20 08:00+08', '2026-10-20 10:20+08'), '2026-10-20 08:20+08'::timestamptz,
  'or once the visit is 2 hours away');

select lives_ok($$ select private.follow_up_requests() $$, 'The follow-up runs');

-- Visit time reached --------------------------------------------------------------------
select is(
  (select status::text || ' · ' || coalesce(cancelled_by::text, 'nobody') || ' · ' || cancel_reason
   from public.bookings where id = pg_temp.booking('Bidet')),
  'cancelled · nobody · No technician was free for this time',
  'A request nobody took before the visit time is cancelled'
);
select is(
  (select event || ' · ' || status from public.booking_events
   where booking_id = pg_temp.booking('Bidet') order by id desc limit 1),
  'expired · cancelled',
  'with a step saying why'
);
select is(
  (select title || ' · ' || url from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000103' and booking_id = pg_temp.booking('Bidet')),
  'No technician could make it · /bookings/' || pg_temp.booking('Bidet'),
  'The customer hears that nobody could make it (and nothing else)'
);
select matches(
  (select body from public.notifications where user_id = '00000000-0000-0000-0000-000000000103'),
  '^Sorry, nobody was free for Plumbing: Bidet · .+, so we cancelled it\. Tap to book another time\.$',
  'with the request and the visit time'
);
select is((select status::text from public.bookings where id = pg_temp.booking('Bathtub')), 'accepted',
  'A booking a technician took is left alone');
select pg_temp.login_as('00000000-0000-0000-0000-000000000103');
select is(public.first_booking_discount(), 100.00, 'A request nobody took doesn''t use up the first-booking offer');
select pg_temp.logout();

-- Waiting too long ----------------------------------------------------------------------
select is(pg_temp.flagged(), 'Drain, Drain, Sink, Tank, Toilet, Water heater',
  'Requests waiting too long are flagged, once each time they start waiting');
select is((select count(*) from public.bookings where status = 'requested'), 8::bigint, 'and stay open');
select is(
  (select title || ' · ' || url from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000901' and booking_id = pg_temp.booking('Sink')),
  'No technician yet · /admin/bookings/' || pg_temp.booking('Sink'),
  'Admins hear about each one'
);
select matches(
  (select body from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000901' and booking_id = pg_temp.booking('Sink')),
  '^Plumbing: Sink in San Antonio, Pasig · .+\. Assign someone, or it''s cancelled at the visit time\.$',
  'with what, where and when'
);
select is(pg_temp.heard('00000000-0000-0000-0000-000000000901', 'No technician yet'), 4::bigint,
  'once for each newly flagged request');
select is(
  (select title from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000101' and booking_id = pg_temp.booking('Sink')),
  'Still finding you a technician',
  'The customer hears that PatchUp is helping'
);
select is(pg_temp.heard('00000000-0000-0000-0000-000000000201', 'Still open: plumbing request'), 4::bigint,
  'Technicians who could take them are reminded');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000203', 'Still open: plumbing request'), 0::bigint,
  'but not those in other services');
select is((select technician_id from public.bookings where id = pg_temp.booking('Water heater')), null,
  'A request for a technician who hasn''t answered opens to the others');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000202', 'Still open: plumbing request'), 4::bigint,
  'who hear about it (the technician asked first can still take it)');

select lives_ok($$ select private.follow_up_requests() $$, 'Running again');
select is(
  (select count(*) from public.notifications where title in ('No technician yet', 'No technician could make it')),
  5::bigint,
  'tells nobody twice'
);

-- Elsewhere -----------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((public.admin_overview() ->> 'stale_requests')::int, 5,
  'The admin dashboard counts the requests waiting too long by the same rule');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok($$ select private.follow_up_requests() $$, '42501', null, 'Signed-in people can''t run the follow-up');
select throws_ok(
  $$ insert into public.booking_events (booking_id, event, status) values (pg_temp.booking('Sink'), 'overdue', 'requested') $$,
  '42501', null, 'nor write its steps'
);
select pg_temp.logout();

-- Where pg_cron is available (Supabase), it runs every 5 minutes.
create function pg_temp.schedule() returns text language plpgsql as $$
declare
  v text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return 'every 5 minutes';
  end if;
  execute $q$ select schedule || ' ' || command from cron.job where jobname = 'follow-up-requests' $q$ into v;
  return case v when '*/5 * * * * select private.follow_up_requests()' then 'every 5 minutes' else v end;
end;
$$;
select is(pg_temp.schedule(), 'every 5 minutes', 'The follow-up runs every 5 minutes');

select * from finish();
rollback;
