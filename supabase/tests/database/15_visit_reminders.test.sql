-- Visit reminders and following up on technicians who don't set off: the
-- customer the evening before, the technician an hour before and at the visit
-- time, and admins (and the customer) 30 minutes late; admins give such a job
-- to another technician.
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
-- A plumbing job Tess took p_taken_ago ago, made p_made_ago ago, for a visit
-- p_visit_in from now; in p_status (accepted unless given).
create function pg_temp.job(p_item text, p_made_ago interval, p_taken_ago interval, p_visit_in interval,
                            p_status public.booking_status default 'accepted')
returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                               street, barangay, city, province, inspection_fee, created_at)
  select '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', c.id, p_item, 'Leaking',
         now() + p_visit_in, p_status, '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300, now() - p_made_ago
  from public.service_categories c where c.slug = 'plumbing'
  returning id into v_id;
  insert into public.booking_events (booking_id, actor_id, event, status, created_at) values
    (v_id, '00000000-0000-0000-0000-000000000101', 'created', 'requested', now() - p_made_ago),
    (v_id, '00000000-0000-0000-0000-000000000201', 'accepted', 'accepted', now() - p_taken_ago);
end;
$$;
create function pg_temp.heard(p_user uuid, p_title text) returns text language sql stable as $$
  select coalesce(string_agg(b.appliance, ', ' order by b.appliance), '')
  from public.notifications n join public.bookings b on b.id = n.booking_id
  where n.user_id = p_user and n.title like p_title;
$$;
create function pg_temp.flagged() returns text language sql stable as $$
  select coalesce(string_agg(b.appliance, ', ' order by b.appliance), '')
  from public.booking_events e join public.bookings b on b.id = e.booking_id
  where e.event = 'late';
$$;

-- People:  ...101 Ana (customer); ...201 Tess, ...202 Rey (approved plumbers); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id)
select t.id::uuid, c.id
from (values ('00000000-0000-0000-0000-000000000201'), ('00000000-0000-0000-0000-000000000202')) t (id)
join public.service_categories c on c.slug = 'plumbing';

-- The jobs                     made       taken       visit in
select pg_temp.job('Sink',      '2 days',  '1 day',    '2 hours');     -- the evening before has come
select pg_temp.job('Faucet',    '2 days',  '1 day',    '3 days');      -- not yet
select pg_temp.job('Shower',    '1 minute', '1 minute', '2 hours');    -- booked after the evening before
select pg_temp.job('Toilet',    '2 days',  '1 day',    '50 minutes');  -- an hour before
select pg_temp.job('Drain',     '2 days',  '5 minutes', '50 minutes');  -- taken within the hour
select pg_temp.job('Pipe',      '2 days',  '1 day',    '-10 minutes'); -- due, not on the way
select pg_temp.job('Tank',      '2 days',  '1 day',    '-10 minutes', 'en_route'); -- on the way
select pg_temp.job('Heater',    '2 days',  '1 day',    '-40 minutes'); -- 30 minutes late
select pg_temp.job('Bidet',     '2 days',  '10 minutes', '-40 minutes'); -- given to Tess after the visit time
delete from public.notifications; -- from setting up; only the follow-up's count below

-- The rules --------------------------------------------------------------------------
select is(private.evening_before('2026-10-21 10:00+08'), '2026-10-20 18:00+08'::timestamptz,
  'The customer is reminded at 6 PM the evening before');
select is(private.evening_before('2026-10-21 00:30+08'), '2026-10-20 18:00+08'::timestamptz,
  'even for a visit just after midnight');
select is(private.late_at('2026-10-21 10:00+08', '2026-10-20 09:00+08'), '2026-10-21 10:30+08'::timestamptz,
  'A technician is late 30 minutes after the visit time');
select is(private.late_at('2026-10-21 10:00+08', '2026-10-21 10:20+08'), '2026-10-21 10:50+08'::timestamptz,
  'or 30 minutes after they took a job past its time');

select lives_ok($$ select private.follow_up_visits() $$, 'The follow-up runs');

-- The evening before -------------------------------------------------------------------
select is(pg_temp.heard('00000000-0000-0000-0000-000000000101', 'Your repair is %'), 'Drain, Sink, Toilet',
  'The customer is reminded once the evening before has come (not after booking that evening)');
select matches(
  (select title || ' | ' || body from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000101' and booking_id = pg_temp.booking('Sink')),
  '^Your repair is (today|tomorrow) \| Tess Cruz is coming at \d{1,2}:\d\d [AP]M for Plumbing: Sink, at 12 Mabini St, San Antonio\. If plans change, you can cancel in the app\.$',
  'with who is coming, when and where'
);

-- An hour before ---------------------------------------------------------------------------
select is(pg_temp.heard('00000000-0000-0000-0000-000000000201', 'Coming up at %'), 'Toilet',
  'The technician is reminded an hour before (unless they took it within the hour)');
select matches(
  (select title || ' | ' || body || ' | ' || url from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000201' and booking_id = pg_temp.booking('Toilet')),
  '^Coming up at \d{1,2}:\d\d [AP]M: Toilet \| 12 Mabini St, San Antonio, Pasig\. Tap "I''m on my way" when you leave, so the customer can follow you\. \| /jobs/',
  'with the address'
);

-- The visit time ---------------------------------------------------------------------------
select is(pg_temp.heard('00000000-0000-0000-0000-000000000201', 'You''re due now: %'), 'Heater, Pipe',
  'At the visit time a technician who hasn''t set off is nudged (not one given it after)');

-- 30 minutes late ----------------------------------------------------------------------------
select is(pg_temp.flagged(), 'Heater', 'Thirty minutes late, the job is flagged');
select is(
  (select title || ' | ' || url from public.notifications where user_id = '00000000-0000-0000-0000-000000000901'),
  'Technician hasn''t set off | /admin/bookings/' || pg_temp.booking('Heater'),
  'Admins hear about it'
);
select matches(
  (select body from public.notifications where user_id = '00000000-0000-0000-0000-000000000901'),
  '^Tess Cruz hasn''t tapped "I''m on my way" for Plumbing: Heater in San Antonio, Pasig · .+\. Call them, or give the job to someone else\.$',
  'with who, what, where and when'
);
select is(
  (select title || ' | ' || body from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000101' and booking_id = pg_temp.booking('Heater')),
  'Your technician is running late | The PatchUp team is checking with Tess Cruz. Plumbing: Heater · '
    || private.visit_time((select scheduled_at from public.bookings where appliance = 'Heater')),
  'The customer hears PatchUp is checking'
);

select lives_ok($$ select private.follow_up_visits() $$, 'Running again');
select is((select count(*) from public.notifications), 8::bigint, 'tells nobody twice');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((public.admin_overview() ->> 'late_jobs')::int, 1, 'The admin dashboard counts the job running late');

-- Giving the job to someone else -------------------------------------------------------------
select pg_temp.logout();
delete from public.notifications;
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(
  (select status || ' ' || technician_id from public.assign_technician(pg_temp.booking('Heater'), '00000000-0000-0000-0000-000000000202')),
  'accepted 00000000-0000-0000-0000-000000000202',
  'An admin gives a job that hasn''t set off to another technician'
);
select pg_temp.logout();
select is(
  (select array_agg(event order by id) from public.booking_events where booking_id = pg_temp.booking('Heater')),
  array['created', 'accepted', 'late', 'unassigned', 'assigned'],
  'with both steps on the timeline'
);
select is(
  (select title || ' | ' || body || ' | ' || url from public.notifications where user_id = '00000000-0000-0000-0000-000000000201'),
  'PatchUp gave this job to someone else | Heater in San Antonio, Pasig · '
    || private.visit_time((select scheduled_at from public.bookings where appliance = 'Heater'))
    || '. You don''t need to go. | /jobs',
  'The technician who had it is told they needn''t go'
);
select is(pg_temp.heard('00000000-0000-0000-0000-000000000202', 'New job for you'), 'Heater', 'The new one gets it');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000101', 'Rey Tan will do your repair'), 'Heater',
  'and the customer hears who''s coming now');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is((select count(*) from public.bookings where appliance = 'Heater'), 0::bigint,
  'The technician who had it no longer sees it');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select throws_ok(
  $$ select public.assign_technician(pg_temp.booking('Heater'), '00000000-0000-0000-0000-000000000202') $$,
  'P0001', 'That technician already has this job', 'Giving it to the technician who has it is refused'
);
select throws_ok(
  $$ select public.assign_technician(pg_temp.booking('Tank'), '00000000-0000-0000-0000-000000000202') $$,
  'P0001', 'That step isn''t possible: the booking is en route', 'A technician already on the way keeps the job'
);
select pg_temp.logout();

select lives_ok($$ select private.follow_up_visits() $$, 'Following up again');
select is(pg_temp.heard('00000000-0000-0000-0000-000000000202', 'You''re due now: %'), '',
  'the new technician, given it after the visit time, isn''t nudged or flagged yet');

-- Elsewhere -------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok($$ select private.follow_up_visits() $$, '42501', null, 'Signed-in people can''t run the follow-up');
select throws_ok($$ select * from private.booking_reminders $$, '42501', null, 'nor see the reminders sent');
select pg_temp.logout();

create function pg_temp.schedule() returns text language plpgsql as $$
declare
  v text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return 'every 5 minutes';
  end if;
  execute $q$ select schedule || ' ' || command from cron.job where jobname = 'follow-up-visits' $q$ into v;
  return case v when '*/5 * * * * select private.follow_up_visits()' then 'every 5 minutes' else v end;
end;
$$;
select is(pg_temp.schedule(), 'every 5 minutes', 'The follow-up runs every 5 minutes');

select * from finish();
rollback;
