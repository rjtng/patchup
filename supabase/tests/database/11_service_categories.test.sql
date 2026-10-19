-- Services from the database: icons, admins renaming, reordering, hiding and
-- adding them, and hidden ones keeping their names on earlier bookings.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
create function pg_temp.category(p_slug text) returns uuid language sql stable as $$
  select id from public.service_categories where slug = p_slug;
$$;
-- The active services, as the app lists them: "slug:icon" in order.
create function pg_temp.listed() returns text language sql stable as $$
  select string_agg(slug || ':' || icon, ', ' order by sort_order, name)
  from public.service_categories where is_active;
$$;

-- Ana books a painter; Tess paints and does plumbing.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved' where id = '00000000-0000-0000-0000-000000000201';
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('painting'));
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101',
   '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select public.create_booking(pg_temp.category('painting'), '00000000-0000-0000-0000-00000000a101',
  'Bedroom wall', 'Peeling paint', now() + interval '1 day');

select pg_temp.login_as_visitor();
select is(
  pg_temp.listed(),
  'plumbing:shower-head, repairing:drill, electrical:plug-zap, carpentry:hammer, cleaning:spray-can, painting:paint-roller, handyman:toolbox',
  'Each service has its icon, in the order of the Home screen'
);

-- Admins ----------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok(
  $$ insert into public.service_categories (slug, name, inspection_fee, sort_order) values ('aircon', 'Aircon', 500, 8) $$,
  'Admins add a service'
);
select is((select icon from public.service_categories where slug = 'aircon'), 'wrench', 'which shows a wrench until it has an icon');
select lives_ok(
  $$ update public.service_categories set icon = 'air-vent' where slug = 'aircon' $$,
  'Admins give a service its icon'
);
select throws_ok(
  $$ update public.service_categories set icon = 'Air Vent' where slug = 'aircon' $$,
  '23514', null,
  'An icon is named in lower-case words joined by dashes'
);
select lives_ok(
  $$ update public.service_categories set name = 'Wall painting', is_active = false where slug = 'painting' $$,
  'Admins rename and hide a service'
);
select lives_ok(
  $$ update public.service_categories set sort_order = 0 where slug = 'electrical' $$,
  'and move one'
);

select pg_temp.login_as_visitor();
select is(
  pg_temp.listed(),
  'electrical:plug-zap, plumbing:shower-head, repairing:drill, carpentry:hammer, cleaning:spray-can, handyman:toolbox, aircon:air-vent',
  'The services listed follow: moved, hidden and added'
);

-- Everyone else ------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
update public.service_categories set name = 'Free plumbing', icon = 'bug', is_active = false where slug = 'plumbing';
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
update public.service_categories set name = 'Tess''s plumbing', sort_order = -1 where slug = 'plumbing';
select pg_temp.logout();
select is(
  (select format('%s %s %s %s', name, icon, is_active, sort_order) from public.service_categories where slug = 'plumbing'),
  'Plumbing shower-head t 1',
  'Customers and technicians cannot change a service'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok(
  $$ insert into public.service_categories (slug, name) values ('pest-control', 'Pest control') $$,
  '42501', 'new row violates row-level security policy for table "service_categories"',
  'Technicians cannot add a service'
);

-- A hidden service ---------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select c.name from public.bookings b join public.service_categories c on c.id = b.category_id
   where b.customer_id = '00000000-0000-0000-0000-000000000101'),
  'Wall painting',
  'A booking made before its service was hidden still shows the service'
);
select throws_ok(
  $$ select public.create_booking(pg_temp.category('painting'), '00000000-0000-0000-0000-00000000a101',
       'Fence', 'Repaint', now() + interval '1 day') $$,
  'P0001', 'Unknown service category',
  'but it can''t be booked any more'
);

select pg_temp.login_as_visitor();
select is(
  (select name from public.service_categories where slug = 'painting'),
  'Wall painting',
  'Visitors can read a hidden service too (its name is no secret)'
);
select is(
  (select services::text from public.search_technicians('{tess}')),
  '{Plumbing}',
  'Search leaves a hidden service out of what technicians offer'
);
select is(
  (select count(*) from public.search_technicians('{}', '{painting}')),
  0::bigint,
  'and finds nobody for it'
);
select is(
  (select count(*) from public.technician_services where technician_id = '00000000-0000-0000-0000-000000000201'),
  2::bigint,
  'Technicians keep a hidden service, for when it''s shown again'
);

select * from finish();
rollback;
