-- Paying technicians back for the first-booking offer: what each completed
-- job's payback is, who sees what's owed and paid, and admins recording
-- payouts (all that's owed, once, with the technician told).
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
-- The jobs are named by their item.
create function pg_temp.booking(p_item text) returns uuid language sql stable as $$
  select id from public.bookings where appliance = p_item;
$$;
-- A plumbing job for Ana by p_technician, in p_status, with p_discount off a
-- ₱p_fee inspection, an approved repair of p_repair, and what Ana paid.
create function pg_temp.job(p_item text, p_technician uuid, p_status public.booking_status, p_fee numeric,
                            p_discount numeric, p_repair numeric, p_paid numeric) returns void language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                               street, barangay, city, province, inspection_fee, discount, final_amount, completed_at)
  select '00000000-0000-0000-0000-000000000101', p_technician, c.id, p_item, 'Leaking', now() - interval '1 day',
         p_status, '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', p_fee, p_discount, p_paid,
         case when p_status = 'completed' then now() - interval '1 day' end
  from public.service_categories c where c.slug = 'plumbing'
  returning id into v_id;
  if p_repair is not null then
    insert into public.quotes (booking_id, technician_id, items, total, status)
    values (v_id, p_technician, jsonb_build_array(jsonb_build_object('description', 'Parts', 'amount', p_repair)),
            p_repair, 'approved');
  end if;
end;
$$;
-- The items paybacks() lists for the signed-in person, with whether each is paid.
create function pg_temp.listed(p_technician uuid default null) returns text language sql as $$
  select coalesce(string_agg(r.appliance || case when r.payout_id is null then '' else ' (paid)' end, ', '
                             order by r.appliance), '')
  from public.paybacks(p_technician) r;
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

-- The jobs        technician                              status        fee  offer repair paid
select pg_temp.job('Sink',   '00000000-0000-0000-0000-000000000201', 'completed', 300, 100, null, 200);
select pg_temp.job('Faucet', '00000000-0000-0000-0000-000000000201', 'completed', 300, 100, 500,  700);
select pg_temp.job('Shower', '00000000-0000-0000-0000-000000000201', 'completed', 300, 0,   null, 300);
select pg_temp.job('Toilet', '00000000-0000-0000-0000-000000000201', 'accepted',  300, 100, null, null);
select pg_temp.job('Pipe',   '00000000-0000-0000-0000-000000000201', 'cancelled', 300, 100, null, null);
select pg_temp.job('Drain',  '00000000-0000-0000-0000-000000000202', 'completed', 50,  100, null, 0);

-- What's owed -----------------------------------------------------------------------------
select is(
  (select string_agg(b.appliance || ' ' || private.payback(b)::int, ', ' order by b.appliance) from public.bookings b),
  'Drain 50, Faucet 100, Pipe 0, Shower 0, Sink 100, Toilet 0',
  'A completed job with the offer is owed the offer, never more than the job came to; others nothing'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.listed(), 'Faucet, Sink', 'A technician sees what they''re owed');
select is(
  pg_temp.listed('00000000-0000-0000-0000-000000000202'),
  'Faucet, Sink',
  'and only theirs, even asking for someone else''s'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is(pg_temp.listed(), 'Drain', 'Each technician sees their own');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.listed(), '', 'A customer sees none');
select pg_temp.login_as_visitor();
select throws_ok($$ select * from public.paybacks() $$, '42501', null, 'nor does a visitor');

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(pg_temp.listed(), 'Drain, Faucet, Sink', 'Admins see everyone''s');
select is(
  pg_temp.listed('00000000-0000-0000-0000-000000000201'),
  'Faucet, Sink',
  'or one technician''s'
);
select is(
  (select (o ->> 'payback_owed')::numeric::int || ' to ' || (o ->> 'payback_technicians') from public.admin_overview() o),
  '250 to 2',
  'The admin dashboard counts what''s owed, and to how many technicians'
);

-- Paying --------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok(
  $$ select public.record_payout('00000000-0000-0000-0000-000000000201', 200) $$,
  '42501', 'Only admins can record payouts', 'Technicians can''t record payouts'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select throws_ok(
  $$ select public.record_payout('00000000-0000-0000-0000-000000000201', 100) $$,
  'P0001', 'They''re now owed ₱200. Check it and try again.',
  'An amount that isn''t what''s owed (more jobs since the admin looked) is refused'
);
select is(
  (select amount::int || ' | ' || reference || ' | ' || paid_by
   from public.record_payout('00000000-0000-0000-0000-000000000201', 200, '  GC-1234567  ')),
  '200 | GC-1234567 | 00000000-0000-0000-0000-000000000901',
  'An admin records paying a technician everything owed'
);
select is(
  (select string_agg(b.appliance || ' ' || pb.amount::int, ', ' order by b.appliance)
   from public.payout_bookings pb join public.bookings b on b.id = pb.booking_id),
  'Faucet 100, Sink 100',
  'covering each job owed'
);
select is(
  pg_temp.listed('00000000-0000-0000-0000-000000000201'),
  'Faucet (paid), Sink (paid)',
  'which show as paid'
);
select throws_ok(
  $$ select public.record_payout('00000000-0000-0000-0000-000000000201', 0) $$,
  'P0001', 'Nothing is owed to this technician', 'and aren''t paid twice'
);
select is(
  (select (o ->> 'payback_owed')::numeric::int || ' to ' || (o ->> 'payback_technicians') from public.admin_overview() o),
  '50 to 1',
  'The dashboard now counts only what''s left'
);
select lives_ok(
  $$ select public.record_payout('00000000-0000-0000-0000-000000000202', 50) $$,
  'A reference is optional'
);
select pg_temp.logout();

select is(
  (select array_agg(n.title || ' | ' || n.body || ' | ' || n.url order by n.title) from public.notifications n
   where n.user_id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202')
     and n.title like 'PatchUp paid you%'),
  array[
    'PatchUp paid you ₱200 | For the first-booking offer on 2 jobs. Reference: GC-1234567. | /profile/earnings',
    'PatchUp paid you ₱50 | For the first-booking offer on 1 job. | /profile/earnings'
  ],
  'Each technician is told what they were paid, and for what'
);

-- Who sees payouts ----------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select count(*) || ' payout, ' || (select count(*) from public.payout_bookings) || ' jobs' from public.payouts),
  '1 payout, 2 jobs',
  'A technician sees their own payouts'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is((select count(*) from public.payouts) + (select count(*) from public.payout_bookings), 0::bigint,
  'A customer sees none');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((select count(*) from public.payouts), 2::bigint, 'Admins see all');
select throws_ok(
  $$ insert into public.payouts (technician_id, amount) values ('00000000-0000-0000-0000-000000000201', 100) $$,
  '42501', null, 'Payouts are only recorded through record_payout'
);
select throws_ok(
  $$ update public.payouts set amount = 1 $$,
  '42501', null, 'and can''t be changed'
);

-- Later jobs ----------------------------------------------------------------------------------
select pg_temp.logout();
select pg_temp.job('Tank', '00000000-0000-0000-0000-000000000201', 'completed', 300, 100, null, 200);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.listed(), 'Faucet (paid), Sink (paid), Tank',
  'A job done after a payout is owed again');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is(
  (select amount::int || ' ' || reference from public.record_payout('00000000-0000-0000-0000-000000000201', 100)),
  '100 ',
  'and paid in the next payout'
);
select is(
  (select count(*) from public.payouts where technician_id = '00000000-0000-0000-0000-000000000201'),
  2::bigint,
  'which is a payout of its own'
);

select * from finish();
rollback;
