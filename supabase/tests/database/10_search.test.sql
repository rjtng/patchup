-- Search: only approved technicians, matched by service and by the other
-- words in their name, city, description or services; those taking jobs first.
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
create function pg_temp.category(p_slug text) returns uuid language sql stable as $$
  select id from public.service_categories where slug = p_slug;
$$;
-- Who a search finds, in order, as "First name" list.
create function pg_temp.found(p_terms text[], p_services text[] default '{}') returns text language sql stable as $$
  select coalesce(string_agg(split_part(full_name, ' ', 1), ', ' order by n), '')
  from public.search_technicians(p_terms, p_services) with ordinality as r(id, full_name, city, years, bio, avg, count, available, services, n);
$$;

-- Technicians:
--   Tess Cruz: plumbing and repairing, Pasig, "Aircon cleaning and faucets", 4.8, taking jobs
--   Rey Tan: electrical, Makati, 4.9, not taking jobs
--   Lito Reyes: plumbing, Parañaque, 4.5, taking jobs
--   Pia Lim: plumbing, Pasig, waiting for approval; Jun Ocampo: plumbing, suspended
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000203', 'lito@example.com', '{"full_name": "Lito Reyes", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000204', 'pia@example.com', '{"full_name": "Pia Lim", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000205', 'jun@example.com', '{"full_name": "Jun Ocampo", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles t set
  verification_status = v.status::public.verification_status, is_available = v.available, city = v.city, bio = v.bio,
  rating_avg = v.avg, rating_count = v.count
from (values
  ('00000000-0000-0000-0000-000000000201'::uuid, 'approved', true, 'Pasig', 'Aircon cleaning and faucets, 8 years', 4.8, 12),
  ('00000000-0000-0000-0000-000000000202', 'approved', false, 'Makati', 'Wiring and outlets', 4.9, 30),
  ('00000000-0000-0000-0000-000000000203', 'approved', true, 'Parañaque', '', 4.5, 3),
  ('00000000-0000-0000-0000-000000000204', 'pending', false, 'Pasig', '', 0, 0),
  ('00000000-0000-0000-0000-000000000205', 'suspended', false, 'Pasig', '', 0, 0)
) as v (id, status, available, city, bio, avg, count)
where t.id = v.id;
insert into public.technician_services (technician_id, category_id) values
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000201', pg_temp.category('repairing')),
  ('00000000-0000-0000-0000-000000000202', pg_temp.category('electrical')),
  ('00000000-0000-0000-0000-000000000203', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000204', pg_temp.category('plumbing')),
  ('00000000-0000-0000-0000-000000000205', pg_temp.category('plumbing'));

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');

select is(pg_temp.found('{}', '{plumbing}'), 'Tess, Lito', 'A service finds the approved technicians who offer it, best rated first');
select is(pg_temp.found('{}', '{electrical,repairing}'), 'Tess, Rey', 'Several services find anyone offering one of them; those taking jobs come first');
select is(pg_temp.found('{pasig}', '{}'), 'Tess', 'A place finds technicians who work there, not those waiting for approval or suspended');
select is(pg_temp.found('{pasig}', '{plumbing}'), 'Tess', 'A service and a place together');
select is(pg_temp.found('{makati}', '{plumbing}'), '', 'and nobody, when no one offers it there');
select is(pg_temp.found('{rey}', '{}'), 'Rey, Lito', 'A name finds them, the one called that first (Rey Tan, then Lito Reyes)');
select is(pg_temp.found('{TESS,cruz}', '{}'), 'Tess', 'whatever the case, every word counting');
select is(pg_temp.found('{tess,makati}', '{}'), '', 'Every word has to match');
select is(pg_temp.found('{aircon}', '{}'), 'Tess', 'Words in the description count');
select is(pg_temp.found('{electrical}', '{}'), 'Rey', 'and in the services they offer');
select is(pg_temp.found('{paranaque}', '{}'), 'Lito', 'Accents don''t matter ("Parañaque")');
select is(pg_temp.found('{%}', '{}'), '', 'A % is just a character, not a wildcard');
select is(
  (select services::text from public.search_technicians('{tess}')),
  '{Plumbing,Repairing}',
  'Each result lists the technician''s services'
);
select is((select count(*) from public.search_technicians('{}', '{}', 1)), 1::bigint, 'The number of results can be limited');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(pg_temp.found('{}', '{plumbing}'), 'Tess, Lito', 'Admins'' searches list only bookable technicians too');

select pg_temp.login_as_visitor();
select is(pg_temp.found('{}', '{plumbing}'), 'Tess, Lito', 'Searching needs no account (it''s what anyone can see)');

select * from finish();
rollback;
