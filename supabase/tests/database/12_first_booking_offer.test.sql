-- The first-booking offer: a customer's first booking (not counting cancelled
-- ones) has the offer taken off what they pay; admins set the amount.
-- Run with `npx supabase test db`.
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
create temp table booking_ids (name text primary key, id uuid not null);
grant all on booking_ids to public;
create function pg_temp.booking(p_name text) returns uuid language sql stable as $$
  select id from booking_ids where name = p_name;
$$;
create function pg_temp.plumbing() returns uuid language sql stable as $$
  select id from public.service_categories where slug = 'plumbing';
$$;
-- Books plumbing for the signed-in customer at their address, tomorrow.
create function pg_temp.book(p_name text, p_address uuid) returns numeric language plpgsql as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.create_booking(pg_temp.plumbing(), p_address, p_name, 'Leaking', now() + interval '1 day');
  insert into booking_ids values (p_name, v_booking.id);
  return v_booking.discount;
end;
$$;
-- Tess takes the job and arrives; with a quote of p_repair that the customer
-- approves, or none; then finishes it.
create function pg_temp.work(p_name text, p_repair numeric) returns void language plpgsql as $$
declare
  v_customer uuid := (select customer_id from public.bookings where id = pg_temp.booking(p_name));
begin
  perform pg_temp.login_as('00000000-0000-0000-0000-000000000201');
  perform public.accept_booking(pg_temp.booking(p_name));
  perform public.mark_arrived(pg_temp.booking(p_name));
  if p_repair is not null then
    perform public.send_quote(pg_temp.booking(p_name), jsonb_build_array(jsonb_build_object('description', 'Parts', 'amount', p_repair)));
    perform pg_temp.login_as(v_customer);
    perform public.respond_to_quote((select id from public.quotes where booking_id = pg_temp.booking(p_name)), true);
    perform pg_temp.login_as('00000000-0000-0000-0000-000000000201');
  end if;
  perform public.complete_booking(pg_temp.booking(p_name));
end;
$$;
create function pg_temp.paid(p_name text) returns numeric language sql stable as $$
  select final_amount from public.bookings where id = pg_temp.booking(p_name);
$$;

-- Ana, Ben, Cara and Dan are customers; Tess fixes plumbing; there's an admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000103', 'cara@example.com', '{"full_name": "Cara Lim"}'),
  ('00000000-0000-0000-0000-000000000104', 'dan@example.com', '{"full_name": "Dan Cruz"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id = '00000000-0000-0000-0000-000000000201';
insert into public.technician_services (technician_id, category_id)
values ('00000000-0000-0000-0000-000000000201', pg_temp.plumbing());
insert into public.addresses (id, user_id, street, barangay, city, province)
select ('00000000-0000-0000-0000-00000000a' || right(u, 3))::uuid, u::uuid, '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila'
from unnest(array['00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
                  '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000104']) as u;
-- The setup's own notifications aren't what's tested here.
delete from public.notifications;

select pg_temp.login_as_visitor();
select is((select amount from public.first_booking_offer), 100.00, 'The offer is ₱100 to start, and anyone can see it');

-- A first booking -------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(public.first_booking_discount(), 100.00, 'A customer who hasn''t booked gets the offer');
select is(pg_temp.book('first', '00000000-0000-0000-0000-00000000a101'), 100.00, 'Their first booking has it taken off');
select is(public.first_booking_discount(), 0::numeric, 'and after that they don''t get it again');
select is(pg_temp.book('second', '00000000-0000-0000-0000-00000000a101'), 0.00, 'so their next booking has no discount');

select pg_temp.work('first', 500);
select is(pg_temp.paid('first'), 700.00, 'They pay the inspection fee and the repair, less the offer (300 + 500 - 100)');
select pg_temp.logout();
select is(
  (select body from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000101' and title = 'Job done' and booking_id = pg_temp.booking('first')),
  'Total: ₱700, paid in cash. How did it go? Tap to rate Tess Cruz.',
  'and "Job done" tells them that total'
);
select pg_temp.work('second', null);
select is(pg_temp.paid('second'), 300.00, 'Later bookings pay in full');

-- A cancelled booking doesn't use it up ------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.book('cancelled', '00000000-0000-0000-0000-00000000a102'), 100.00, 'Ben''s first booking has the offer');
select public.cancel_booking(pg_temp.booking('cancelled'), 'Fixed it myself');
select is(public.first_booking_discount(), 100.00, 'Cancelled, it doesn''t count: he still has the offer');
select is(pg_temp.book('rebooked', '00000000-0000-0000-0000-00000000a102'), 100.00, 'and his next booking gets it');
select pg_temp.work('rebooked', null);
select is(pg_temp.paid('rebooked'), 200.00, 'With only the inspection, he pays the fee less the offer');

-- The amount ---------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
update public.first_booking_offer set amount = 0;
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
update public.first_booking_offer set amount = 0;
select pg_temp.logout();
select is((select amount from public.first_booking_offer), 100.00, 'Customers and technicians can''t change the offer');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok($$ update public.first_booking_offer set amount = 400 $$, 'Admins can change it');
select is(public.first_booking_discount(), 0::numeric, 'Admins don''t get the offer (they don''t book)');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(public.first_booking_discount(), 0::numeric, 'nor do technicians');

select pg_temp.login_as('00000000-0000-0000-0000-000000000103');
select is(pg_temp.book('big', '00000000-0000-0000-0000-00000000a103'), 400.00, 'A first booking gets the new amount');
select pg_temp.work('big', null);
select is(pg_temp.paid('big'), 0.00, 'and never pays less than nothing (300 - 400)');
select pg_temp.logout();
select is(
  (select discount from public.bookings where id = pg_temp.booking('first')),
  100.00,
  'Bookings already made keep the discount they were made with'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
update public.first_booking_offer set amount = 0;
select pg_temp.login_as('00000000-0000-0000-0000-000000000104');
select is(public.first_booking_discount(), 0::numeric, 'With the offer at 0, nobody gets it');
select is(pg_temp.book('none', '00000000-0000-0000-0000-00000000a104'), 0.00, 'and first bookings have no discount');

-- Only booking sets it -------------------------------------------------------------------
select throws_ok(
  $$ update public.bookings set discount = 300 where id = pg_temp.booking('none') $$,
  '42501', null,
  'Customers can''t give themselves a discount'
);
select pg_temp.login_as_visitor();
select throws_ok($$ select public.first_booking_discount() $$, '42501', null, 'Visitors have no booking to discount');

select * from finish();
rollback;
