-- Live tracking: who can share and see a technician's location, only while
-- they're on the way, and that it's gone once the trip ends.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
-- Where the signed-in person sees the technician for a booking, as "lat,lng" (null if they can't).
create function pg_temp.seen(p_booking text) returns text language sql stable as $$
  select l.latitude || ',' || l.longitude from public.technician_locations l where l.booking_id = pg_temp.booking(p_booking);
$$;
create function pg_temp.stored(p_booking text) returns bigint language sql stable security definer as $$
  select count(*) from public.technician_locations l where l.booking_id = pg_temp.booking(p_booking);
$$;
-- Lets the next update through the 2-second limit, as if time had passed.
create function pg_temp.later(p_booking text) returns void language sql security definer as $$
  update public.technician_locations set updated_at = updated_at - interval '1 minute' where booking_id = pg_temp.booking(p_booking);
$$;

-- People:  ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}');
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000202', pg_temp.category('plumbing'));

-- Ana pins her address on the map (her phone's location), and books.
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into public.addresses (id, street, barangay, city, province, latitude, longitude) values
  ('00000000-0000-0000-0000-00000000a101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 14.5826, 121.0614);
insert into booking_ids select 'leak', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Kitchen faucet', problem => 'Leaking', scheduled_at => pg_temp.visit());
select is(
  (select latitude || ',' || longitude from public.bookings where id = pg_temp.booking('leak')),
  '14.5826,121.0614',
  'A pinned address gives the booking its map pin'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.accept_booking(pg_temp.booking('leak'));
select throws_ok(
  $$ select public.share_location(pg_temp.booking('leak'), 14.6, 121.0) $$,
  'P0001', 'Your location is shared only while you''re on the way',
  'A technician who has accepted but not left yet doesn''t share their location'
);

-- On the way -----------------------------------------------------------------------------

select public.mark_en_route(pg_temp.booking('leak'));
select lives_ok($$ select public.share_location(pg_temp.booking('leak'), 14.6091, 121.0223, 12) $$, 'On the way, the technician shares where they are');
select is(pg_temp.seen('leak'), '14.6091,121.0223', 'and sees it themselves');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.seen('leak'), '14.6091,121.0223', 'The customer sees where the technician is');
select is(
  (select accuracy from public.technician_locations where booking_id = pg_temp.booking('leak')),
  12::real,
  'with how accurate it is'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.share_location(pg_temp.booking('leak'), 14.6000, 121.0300);
select is(pg_temp.seen('leak'), '14.6091,121.0223', 'Updates more often than every 2 seconds are ignored');
select pg_temp.later('leak');
select public.share_location(pg_temp.booking('leak'), 14.6000, 121.0300);
select is(pg_temp.seen('leak'), '14.6,121.03', 'After that, the new position replaces the old one');
select is(pg_temp.stored('leak'), 1::bigint, 'Only the latest position is kept');
select pg_temp.later('leak');
select public.share_location(pg_temp.booking('leak'), 14.5990, 121.0310, -1);
select is(
  (select accuracy from public.technician_locations where booking_id = pg_temp.booking('leak')),
  null::real,
  'A nonsense accuracy is left out'
);
select throws_ok(
  $$ select public.share_location(pg_temp.booking('leak'), 95, 121.0) $$,
  'P0001', 'That isn''t a location',
  'Impossible coordinates are refused'
);

select pg_temp.logout();
select case when (select relkind from pg_class where oid = to_regclass('realtime.messages')) = 'r'
  then collect_tap(
    ok(
      exists (select 1 from realtime.messages
              where event = 'location' and topic = 'booking:' || pg_temp.booking('leak')
                and payload = jsonb_build_object('booking_id', pg_temp.booking('leak'))),
      'Each new position is announced live on the booking''s topic, without the position itself'
    ))
  else skip('Realtime''s messages table is managed by Realtime here', 1)
  end;

-- Who can't --------------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select throws_ok(
  $$ select public.share_location(pg_temp.booking('leak'), 14.6, 121.0) $$,
  '42501', 'Only the technician doing this job can share their location',
  'Another technician can''t share a location for the job'
);
select is(pg_temp.seen('leak'), null, 'or see where the technician is');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.seen('leak'), null, 'Another customer can''t either');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.share_location(pg_temp.booking('leak'), 14.6, 121.0) $$,
  '42501', 'Only the technician doing this job can share their location',
  'The customer can''t move the technician'
);
select throws_ok(
  $$ update public.technician_locations set latitude = 0 $$,
  '42501', null,
  'and nobody writes to the table directly'
);
select pg_temp.login_as_visitor();
select throws_ok($$ select pg_temp.seen('leak') $$, '42501', null, 'Signed-out visitors can''t see it');

-- The trip ends ------------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.mark_arrived(pg_temp.booking('leak'));
select is(pg_temp.stored('leak'), 0::bigint, 'Once the technician arrives, their location is deleted');
select throws_ok(
  $$ select public.share_location(pg_temp.booking('leak'), 14.6, 121.0) $$,
  'P0001', 'Your location is shared only while you''re on the way',
  'and no longer shared'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'drain', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Drain', problem => 'Slow', scheduled_at => pg_temp.visit());
insert into booking_ids select 'shower', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Shower', problem => 'No pressure', scheduled_at => pg_temp.visit() + interval '3 hours');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select public.accept_booking(pg_temp.booking('drain'));
select public.mark_en_route(pg_temp.booking('drain'));
select public.share_location(pg_temp.booking('drain'), 14.59, 121.05);
select public.accept_booking(pg_temp.booking('shower'));
select public.mark_en_route(pg_temp.booking('shower'));
select public.share_location(pg_temp.booking('shower'), 14.59, 121.05);
select is(pg_temp.stored('drain') + pg_temp.stored('shower'), 2::bigint, 'Locations are kept per trip');
select public.decline_booking(pg_temp.booking('drain'), 'Flat tire');
select is(pg_temp.stored('drain'), 0::bigint, 'A technician who gives the job back on the way stops being tracked');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.cancel_booking(pg_temp.booking('shower'));
select is(pg_temp.stored('shower'), 0::bigint, 'and so does one whose trip the customer cancels');
select pg_temp.logout();
select is((select count(*) from public.technician_locations), 0::bigint, 'Nothing is left behind after the trips');

select * from finish();
rollback;
