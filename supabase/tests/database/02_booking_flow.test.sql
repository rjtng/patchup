-- The booking flow: who sees a request, accepting, quotes, chat, finishing,
-- reviews and cancelling. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

-- Act as a signed-in user or a signed-out visitor.
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

-- Bookings made during the test, by nickname.
create temp table booking_ids (name text primary key, id uuid not null);
grant all on booking_ids to public;
create function pg_temp.booking(p_name text) returns uuid language sql stable as $$
  select id from booking_ids where name = p_name;
$$;
create function pg_temp.plumbing() returns uuid language sql stable as $$
  select id from public.service_categories where slug = 'plumbing';
$$;

-- People:  ...101 Ana, ...102 Ben (customers)
--          ...201 Tess (approved, available, plumbing)
--          ...202 Eli  (approved, available, electrical only)
--          ...203 Paz  (waiting for approval, plumbing)
--          ...204 Rey  (approved, plumbing, not available yet)
--          ...901 an admin
-- Totals here are without the first-booking offer (tested in 12_first_booking_offer).
update public.first_booking_offer set amount = 0;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'eli@example.com', '{"full_name": "Eli Garcia", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'paz@example.com', '{"full_name": "Paz Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000204', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
update public.technician_profiles set verification_status = 'approved', is_available = false
where id = '00000000-0000-0000-0000-000000000204';
insert into public.technician_services (technician_id, category_id)
select t.id::uuid, c.id
from (values
  ('00000000-0000-0000-0000-000000000201', 'plumbing'),
  ('00000000-0000-0000-0000-000000000202', 'electrical'),
  ('00000000-0000-0000-0000-000000000203', 'plumbing'),
  ('00000000-0000-0000-0000-000000000204', 'plumbing')
) t (id, slug)
join public.service_categories c on c.slug = t.slug;

insert into public.addresses (id, user_id, street, barangay, city, province, landmark, latitude, longitude) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101',
   '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 'Blue gate beside the sari-sari store', 14.5869, 121.0614),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-000000000102',
   '5 Rizal Ave', 'Poblacion', 'Makati', 'Metro Manila', '', null, null);

-- Booking ---------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');

select lives_ok(
  $$ insert into booking_ids
     select 'leak', id from public.create_booking(
       category_id => pg_temp.plumbing(),
       address_id => '00000000-0000-0000-0000-00000000a101',
       appliance => 'Kitchen faucet',
       brand => 'Moen',
       problem => 'Leaking under the sink',
       scheduled_at => now() + interval '1 day') $$,
  'Customers can book a repair'
);

select results_eq(
  $$ select status::text, inspection_fee, city, landmark from public.bookings where id = pg_temp.booking('leak') $$,
  $$ values ('requested', 300.00, 'Pasig', 'Blue gate beside the sari-sari store') $$,
  'A new booking waits for a technician, with the inspection fee and address copied in'
);

select throws_ok(
  $$ select public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a102',
       'Toilet', 'Clogged', now() + interval '1 day') $$,
  'P0001', 'Unknown address',
  'Customers cannot book at someone else''s address'
);

select throws_ok(
  $$ select public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a101',
       'Toilet', 'Clogged', now() - interval '1 hour') $$,
  'P0001', 'Pick a time within the next 90 days',
  'Bookings must be in the future'
);

select throws_ok(
  $$ select public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a101',
       'Toilet', 'Clogged', now() + interval '1 day',
       technician_id => '00000000-0000-0000-0000-000000000203') $$,
  'P0001', 'That technician isn''t taking plumbing bookings right now',
  'Customers cannot request a technician who is not approved'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');

select throws_ok(
  $$ select public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a101',
       'Toilet', 'Clogged', now() + interval '1 day') $$,
  '42501', 'Only customer accounts can book a repair',
  'Technician accounts cannot book'
);

-- Who sees an open request ------------------------------------------------------

select is((select count(*) from public.bookings), 1::bigint, 'An available plumber sees the open plumbing request');

select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is_empty($$ select id from public.bookings $$, 'An electrician does not see plumbing requests');
select throws_ok(
  $$ select public.accept_booking(pg_temp.booking('leak')) $$,
  '42501', 'You can''t take this job: check your availability and services',
  'An electrician cannot take a plumbing job'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000203');
select is_empty($$ select id from public.bookings $$, 'A technician waiting for approval sees no requests');

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is_empty($$ select id from public.bookings $$, 'Other customers cannot see the booking');

select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
select is_empty($$ select id from public.bookings $$, 'A technician who is not available sees no requests');
select lives_ok(
  $$ update public.technician_profiles set is_available = true where id = '00000000-0000-0000-0000-000000000204' $$,
  'Technicians can switch their availability on'
);
select is((select count(*) from public.bookings), 1::bigint, 'Once available, they see the request');

-- Accepting -----------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.accept_booking(pg_temp.booking('leak')) $$, 'A technician can accept an open request');

select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
select throws_ok(
  $$ select public.accept_booking(pg_temp.booking('leak')) $$,
  'P0001', 'This booking is no longer available',
  'A second technician cannot accept the same job'
);
select is_empty($$ select id from public.bookings $$, 'A taken request disappears for other technicians');

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000101'),
  'Ana Santos',
  'The technician can see the customer''s name'
);
select is_empty(
  $$ select id from public.profiles where id = '00000000-0000-0000-0000-000000000102' $$,
  'but not other customers'
);

-- On the way, arrived -------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.mark_en_route(pg_temp.booking('leak')) $$,
  '42501', 'Only the assigned technician can do that',
  'Customers cannot move the job along'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.mark_en_route(pg_temp.booking('leak')) $$, 'The technician can mark they are on the way');
select lives_ok($$ select public.mark_arrived(pg_temp.booking('leak')) $$, 'The technician can mark they arrived');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.cancel_booking(pg_temp.booking('leak')) $$,
  'P0001', 'That step isn''t possible: the booking is arrived',
  'Customers cannot cancel once the technician has arrived'
);

-- Chat ----------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.messages (booking_id, body) values (pg_temp.booking('leak'), 'The gate code is 1234') $$,
  'The customer can message the technician'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select body from public.messages where booking_id = pg_temp.booking('leak')),
  'The gate code is 1234',
  'The technician sees the customer''s message'
);
select lives_ok(
  $$ insert into public.messages (booking_id, body) values (pg_temp.booking('leak'), 'Salamat po, see you!') $$,
  'The technician can reply'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is_empty($$ select id from public.messages $$, 'Other people cannot read the chat');
select throws_ok(
  $$ insert into public.messages (booking_id, body) values (pg_temp.booking('leak'), 'Hi') $$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'Other people cannot post in the chat'
);

-- Quote -----------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok(
  $$ select public.send_quote(pg_temp.booking('leak'), '[{"description": "Cartridge", "amount": -5}]') $$,
  'P0001', 'Each amount must be between 0 and 1,000,000',
  'Quote amounts cannot be negative'
);
select throws_ok(
  $$ select public.send_quote(pg_temp.booking('leak'), '[{"amount": 500}]') $$,
  'P0001', 'Each quote item needs a description and an amount',
  'Quote items need a description'
);
select throws_ok(
  $$ select public.send_quote(pg_temp.booking('leak'), '[]') $$,
  'P0001', 'A quote needs between 1 and 30 items',
  'A quote cannot be empty'
);
select lives_ok(
  $$ select public.send_quote(
       pg_temp.booking('leak'),
       '[{"description": "Replace faucet cartridge", "amount": 850}, {"description": "Labor", "amount": 400}]',
       'Parts in stock') $$,
  'The technician can send a quote'
);
select throws_ok(
  $$ select public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking('leak')), true) $$,
  '42501', 'Only the customer who booked can do that',
  'Technicians cannot approve their own quote'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select results_eq(
  $$ select q.total, b.status::text from public.quotes q join public.bookings b on b.id = q.booking_id
     where b.id = pg_temp.booking('leak') $$,
  $$ values (1250.00, 'quoted') $$,
  'The customer sees the quote, totalled, and the booking waits for their answer'
);
select lives_ok(
  $$ select public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking('leak')), true) $$,
  'The customer can approve the quote'
);
select is(
  (select status from public.bookings where id = pg_temp.booking('leak')), 'in_progress'::public.booking_status,
  'Approving the quote starts the repair'
);
select throws_ok(
  $$ select public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking('leak')), false) $$,
  'P0001', 'This quote has already been answered',
  'A quote can only be answered once'
);

-- Finish ------------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.complete_booking(pg_temp.booking('leak')) $$, 'The technician can complete the job');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select final_amount from public.bookings where id = pg_temp.booking('leak')), 1550.00,
  'The amount due is the inspection fee plus the approved quote'
);
select throws_ok(
  $$ select public.cancel_booking(pg_temp.booking('leak')) $$,
  'P0001', 'That step isn''t possible: the booking is completed',
  'A completed booking cannot be cancelled'
);
select results_eq(
  $$ select event from public.booking_events where booking_id = pg_temp.booking('leak') order by id $$,
  $$ values ('created'), ('accepted'), ('en_route'), ('arrived'), ('quote_sent'), ('quote_approved'), ('completed') $$,
  'Every step is on the booking''s timeline'
);

-- Review ------------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select throws_ok(
  $$ select public.submit_review(pg_temp.booking('leak'), 1) $$,
  '42501', 'Only the customer who booked can do that',
  'Only the customer can review the job'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok($$ select public.submit_review(pg_temp.booking('leak'), 5, 'Fast and tidy') $$, 'The customer can leave a review');
select throws_ok(
  $$ select public.submit_review(pg_temp.booking('leak'), 4) $$,
  'P0001', 'You already reviewed this booking',
  'One review per booking'
);

select pg_temp.login_as_visitor();
select results_eq(
  $$ select rating_avg, rating_count from public.technician_profiles where id = '00000000-0000-0000-0000-000000000201' $$,
  $$ values (5.00, 1) $$,
  'Reviews update the technician''s public rating'
);
select is((select customer_name from public.reviews), 'Ana', 'Reviews show only the reviewer''s first name');

-- Direct writes are blocked -----------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok(
  $$ update public.bookings set status = 'completed' where id = pg_temp.booking('leak') $$,
  '42501', 'permission denied for table bookings',
  'Booking status cannot be changed directly'
);
select throws_ok(
  $$ insert into public.booking_events (booking_id, event, status) values (pg_temp.booking('leak'), 'completed', 'completed') $$,
  '42501', 'permission denied for table booking_events',
  'Timeline entries cannot be written directly'
);

-- Requesting a specific technician, declining, admin assignment -------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok(
  $$ insert into booking_ids
     select 'shower', id from public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a101',
       'Shower', 'Weak water pressure', now() + interval '2 days',
       technician_id => '00000000-0000-0000-0000-000000000201') $$,
  'Customers can request a specific technician'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
select is_empty($$ select id from public.bookings $$, 'A request for a specific technician is hidden from other technicians');

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok(
  $$ select public.decline_booking(pg_temp.booking('shower'), 'Fully booked that day') $$,
  'The requested technician can decline'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000204');
select is((select count(*) from public.bookings), 1::bigint, 'A declined request opens up to other technicians');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.assign_technician(pg_temp.booking('shower'), '00000000-0000-0000-0000-000000000201') $$,
  '42501', 'Only admins can assign technicians',
  'Customers cannot assign technicians'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok(
  $$ select public.assign_technician(pg_temp.booking('shower'), '00000000-0000-0000-0000-000000000201') $$,
  'Admins can assign a technician'
);

-- Declined quote: inspection fee only -----------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.mark_arrived(pg_temp.booking('shower')) $$, 'The technician can arrive without marking "on the way"');
select lives_ok(
  $$ select public.send_quote(pg_temp.booking('shower'), '[{"description": "Replace shower valve", "amount": 2500}]') $$,
  'The technician quotes'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok(
  $$ select public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking('shower')), false) $$,
  'The customer can decline the quote'
);
select is(
  (select status from public.bookings where id = pg_temp.booking('shower')), 'arrived'::public.booking_status,
  'Declining sends the booking back to the technician'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.complete_booking(pg_temp.booking('shower')) $$, 'The technician can finish with the inspection only');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select final_amount from public.bookings where id = pg_temp.booking('shower')), 300.00,
  'An inspection-only visit costs just the inspection fee'
);

-- Cancelling ------------------------------------------------------------------------------

select lives_ok(
  $$ insert into booking_ids
     select 'heater', id from public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a101',
       'Water heater', 'No hot water', now() + interval '3 days') $$,
  'Customers can book another repair'
);
select lives_ok(
  $$ select public.cancel_booking(pg_temp.booking('heater'), 'Fixed it myself') $$,
  'Customers can cancel before a technician arrives'
);
select results_eq(
  $$ select status::text, cancelled_by, cancel_reason from public.bookings where id = pg_temp.booking('heater') $$,
  $$ values ('cancelled', '00000000-0000-0000-0000-000000000101'::uuid, 'Fixed it myself') $$,
  'The booking records who cancelled and why'
);

select lives_ok(
  $$ insert into booking_ids
     select 'toilet', id from public.create_booking(pg_temp.plumbing(), '00000000-0000-0000-0000-00000000a101',
       'Toilet', 'Keeps running', now() + interval '3 days',
       technician_id => '00000000-0000-0000-0000-000000000201') $$,
  'Customers can book a third repair'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select lives_ok($$ select public.accept_booking(pg_temp.booking('toilet')) $$, 'The requested technician can accept');
select lives_ok($$ select public.mark_arrived(pg_temp.booking('toilet')) $$, 'and arrive');
select throws_ok(
  $$ select public.cancel_booking(pg_temp.booking('toilet')) $$,
  '42501', 'Only the customer who booked or an admin can cancel',
  'Technicians cannot cancel bookings'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok(
  $$ select public.cancel_booking(pg_temp.booking('toilet'), 'Customer not home') $$,
  'Admins can cancel after the technician arrives'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ insert into public.messages (booking_id, body) values (pg_temp.booking('toilet'), 'Sorry!') $$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'Nobody can post in the chat of a cancelled booking'
);

select * from finish();
rollback;
