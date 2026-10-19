-- Phone numbers: people keep their own, and the other side of a job sees it
-- only while the job is under way.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
-- The number the signed-in person sees for someone (null if they can't).
create function pg_temp.number_of(p_user uuid) returns text language sql stable as $$
  select phone from public.phone_numbers where user_id = p_user;
$$;

-- People:  ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000202', pg_temp.category('plumbing'));
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');

-- Keeping your own number ------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok($$ insert into public.phone_numbers (phone) values ('+639171234567') $$, 'A customer saves their mobile number');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), '+639171234567', 'and sees it');
select throws_ok(
  $$ update public.phone_numbers set phone = '0917 123 4567' $$,
  '23514', null,
  'Only the +639XXXXXXXXX form is stored (the app converts what people type)'
);
select throws_ok(
  $$ insert into public.phone_numbers (user_id, phone) values ('00000000-0000-0000-0000-000000000102', '+639181234567') $$,
  '42501', null,
  'Nobody can save a number for someone else'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
insert into public.phone_numbers (phone) values ('+639281234567');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), null, 'A technician with no job for the customer doesn''t see their number');

-- Ana asks Tess; nothing is shared until Tess takes the job.
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'leak', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Kitchen faucet', problem => 'Leaking', scheduled_at => pg_temp.visit(),
  technician_id => '00000000-0000-0000-0000-000000000201');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000201'), null, 'A customer doesn''t see the number of a technician they only asked');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), null, 'nor does the technician see theirs before accepting');

-- While the job is under way ----------------------------------------------------------

select public.accept_booking(pg_temp.booking('leak'));
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), '+639171234567', 'Once the technician accepts, they see the customer''s number');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000201'), '+639281234567', 'and the customer sees theirs');

select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), null, 'Another technician doesn''t');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000201'), null, 'nor does another customer');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.phone_numbers $$, '42501', null, 'nor a visitor');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((select count(*) from public.phone_numbers), 2::bigint, 'Admins see every number');

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
update public.phone_numbers set phone = '+639990000000' where user_id = '00000000-0000-0000-0000-000000000101';
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), '+639171234567', 'Seeing a number doesn''t allow changing it');
select public.mark_en_route(pg_temp.booking('leak'));
select public.mark_arrived(pg_temp.booking('leak'));
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), '+639171234567', 'It stays visible on the way and on arrival');

-- After the job --------------------------------------------------------------------------

select public.complete_booking(pg_temp.booking('leak'));
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), null, 'Once the job is done, the technician no longer sees it');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000201'), null, 'nor the customer theirs');

-- Changing and removing it -----------------------------------------------------------------

update public.phone_numbers set phone = '+639175550000';
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), '+639175550000', 'People change their number');
delete from public.phone_numbers;
select is(pg_temp.number_of('00000000-0000-0000-0000-000000000101'), null, 'and remove it');
select pg_temp.logout();
select is((select count(*) from public.phone_numbers), 1::bigint, 'without touching anyone else''s');

select * from finish();
rollback;
