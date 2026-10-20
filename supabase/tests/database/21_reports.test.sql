-- Reporting a problem, and moderation: the customer or technician of a
-- booking reports a problem (admins told; one open at a time; only theirs
-- seen); admins resolve it (reporter told); hide a review (out of the
-- rating, seen only by its writer and admins); remove and restore a chat
-- message (original kept privately); suspend a customer (can't book).
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

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
create function pg_temp.booking(p_item text) returns uuid language sql stable as $$
  select id from public.bookings where appliance = p_item;
$$;
-- A finished plumbing job by Tess.
create function pg_temp.job(p_item text, p_customer uuid) returns void language sql as $$
  insert into public.bookings (customer_id, technician_id, category_id, appliance, problem, scheduled_at, status,
                               street, barangay, city, province, inspection_fee, final_amount, completed_at)
  select p_customer, '00000000-0000-0000-0000-000000000201', c.id, p_item, 'Leaking', now() - interval '2 days',
         'completed', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila', 300, 300, now() - interval '1 day'
  from public.service_categories c where c.slug = 'plumbing';
$$;
create function pg_temp.told(p_user uuid, p_title text, p_body text, p_url text) returns boolean language sql stable as $$
  select exists (select 1 from public.notifications
                 where user_id = p_user and title = p_title and body = p_body and url = p_url);
$$;
create function pg_temp.rating() returns text language sql stable as $$
  select rating_avg || ' ' || rating_count from public.technician_profiles where id = '00000000-0000-0000-0000-000000000201';
$$;

-- People: ...101 Ana, ...102 Ben (customers); ...201 Tess, ...202 Rey (approved plumbers); ...901 an admin
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'ana@example.com', '{"full_name": "Ana Santos"}'),
  ('00000000-0000-0000-0000-000000000102', 'ben@example.com', '{"full_name": "Ben Reyes"}'),
  ('00000000-0000-0000-0000-000000000201', 'tess@example.com', '{"full_name": "Tess Cruz", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000202', 'rey@example.com', '{"full_name": "Rey Tan", "role": "technician"}'),
  ('00000000-0000-0000-0000-000000000901', 'admin@example.com', '{"full_name": "Ops Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000901';
update public.technician_profiles set verification_status = 'approved', is_available = true
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');
insert into public.technician_services (technician_id, category_id)
select '00000000-0000-0000-0000-000000000201', id from public.service_categories where slug = 'plumbing';
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');
select pg_temp.job('Sink', '00000000-0000-0000-0000-000000000101');
select pg_temp.job('Faucet', '00000000-0000-0000-0000-000000000102');
insert into public.reviews (booking_id, customer_id, technician_id, rating, comment) values
  (pg_temp.booking('Sink'), '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 1, 'Useless and rude'),
  (pg_temp.booking('Faucet'), '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201', 5, 'Great');
insert into public.messages (booking_id, sender_id, body) values
  (pg_temp.booking('Sink'), '00000000-0000-0000-0000-000000000101', 'You are an idiot');
select set_config('test.sink', pg_temp.booking('Sink')::text, true);
select set_config('test.message', (select id::text from public.messages limit 1), true);

-- Reporting -----------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(
  (select reason || ' | ' || details || ' | ' || (resolved_at is null)::text
   from public.report_problem(current_setting('test.sink')::uuid, 'work', '  Still leaking  ')),
  'work | Still leaking | true',
  'The customer reports a problem with a booking'
);
select pg_temp.logout();
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000901', 'Problem reported',
    'Ana (customer): Repair not done right. Plumbing: Sink', '/admin/bookings/' || current_setting('test.sink')),
  'and admins are told'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.report_problem(current_setting('test.sink')::uuid, 'price', 'And overcharged') $$,
  'P0001', 'You''ve already reported a problem with this booking. PatchUp will get back to you.',
  'One open report at a time'
);
select throws_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'bogus', 'x') $$,
  'P0001', 'Pick what went wrong', 'It needs a reason');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'review', '   ') $$,
  'P0001', 'Say what happened (up to 1,000 characters)', 'and what happened');
select lives_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'review', 'The review is abusive') $$,
  'The technician reports one too');
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select throws_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'other', 'Hmm') $$,
  '42501', 'Only the customer or technician of a booking can report a problem with it', 'Nobody else can');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select throws_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'other', 'Hmm') $$,
  '42501', null, 'not even another technician');
select pg_temp.login_as_visitor();
select throws_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'other', 'Hmm') $$,
  '42501', null, 'nor visitors');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is((select count(*)::int from public.reports), 1, 'People see only their own reports');
select throws_ok(
  $$ insert into public.reports (booking_id, reporter_id, reason, details)
     values (current_setting('test.sink')::uuid, '00000000-0000-0000-0000-000000000101', 'other', 'x') $$,
  '42501', null, 'and can''t add one directly'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is((select count(*)::int from public.reports), 0, 'Others see none');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select is((select count(*)::int from public.reports), 2, 'Admins see all');

-- Resolving ---------------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.resolve_report((select id from public.reports limit 1), 'Done') $$,
  '42501', 'Only admins can resolve reports', 'Only admins resolve reports'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select set_config('test.ana_report',
  (select id::text from public.reports where reporter_id = '00000000-0000-0000-0000-000000000101'), true);
select set_config('test.tess_report',
  (select id::text from public.reports where reporter_id = '00000000-0000-0000-0000-000000000201'), true);
select throws_ok($$ select public.resolve_report(current_setting('test.ana_report')::uuid, ' ') $$,
  'P0001', 'Say what PatchUp did about it, for the person who reported it', 'with a note');
select is(
  (select resolution || ' | ' || (resolved_by = '00000000-0000-0000-0000-000000000901')::text
   from public.resolve_report(current_setting('test.ana_report')::uuid, 'Tess will come back tomorrow to fix it, free.')),
  'Tess will come back tomorrow to fix it, free. | true',
  'An admin resolves a report'
);
select public.resolve_report(current_setting('test.tess_report')::uuid, 'We hid the review.');
select pg_temp.logout();
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000101', 'We''ve looked into your report',
    'Tess will come back tomorrow to fix it, free.', '/bookings/' || current_setting('test.sink')),
  'The customer is told, on their booking'
);
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000201', 'We''ve looked into your report', 'We hid the review.',
    '/jobs/' || current_setting('test.sink')),
  'the technician on their job'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select throws_ok($$ select public.resolve_report(current_setting('test.ana_report')::uuid, 'Again') $$,
  'P0001', 'This report is already resolved', 'A report is resolved once');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok($$ select public.report_problem(current_setting('test.sink')::uuid, 'work', 'Still leaking after the fix') $$,
  'Once resolved, they can report again');

-- Hiding a review ------------------------------------------------------------------------------------------
select throws_ok($$ select public.set_review_hidden(current_setting('test.sink')::uuid, true) $$,
  '42501', 'Only admins can hide reviews', 'Only admins hide reviews');
select pg_temp.logout();
select is(pg_temp.rating(), '3.00 2', 'Before: both reviews count');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok($$ select public.set_review_hidden(current_setting('test.sink')::uuid, true) $$, 'An admin hides a review');
select pg_temp.logout();
select is(pg_temp.rating(), '5.00 1', 'It stops counting in the rating');
select ok(
  pg_temp.told('00000000-0000-0000-0000-000000000101', 'PatchUp hid your review',
    'It broke our rules for reviews (see the Terms of Service), so others don''t see it.',
    '/bookings/' || current_setting('test.sink')),
  'and its writer is told'
);
select pg_temp.login_as_visitor();
select is((select string_agg(comment, ', ') from public.reviews), 'Great', 'Others don''t see it');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is((select count(*)::int from public.reviews where hidden_at is not null), 1, 'Its writer still does');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.set_review_hidden(current_setting('test.sink')::uuid, false);
select pg_temp.logout();
select is(pg_temp.rating(), '3.00 2', 'Shown again, it counts again');

-- Removing a message --------------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok($$ select public.set_message_removed(current_setting('test.message')::uuid, true) $$,
  '42501', 'Only admins can remove messages', 'Only admins remove messages');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.set_message_removed(current_setting('test.message')::uuid, true);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(
  (select body || ' | ' || (removed_at is not null)::text from public.messages),
  'Removed by PatchUp | true',
  'A removed message reads "Removed by PatchUp" for both sides'
);
select pg_temp.logout();
select is(
  (select string_agg(body, ' | ') from public.notifications where url = '/chat/' || current_setting('test.sink')),
  'Removed by PatchUp',
  'and in the notification that quoted it'
);
select is((select body from private.removed_messages), 'You are an idiot', 'What it said is kept, privately');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.set_message_removed(current_setting('test.message')::uuid, false);
select pg_temp.logout();
select is(
  (select body || ' | ' || (removed_at is null)::text from public.messages)
    || ' | ' || (select count(*) from private.removed_messages),
  'You are an idiot | true | 0',
  'Restoring puts it back'
);

-- Suspending a customer ----------------------------------------------------------------------------------
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select lives_ok(
  $$ select public.set_customer_suspended('00000000-0000-0000-0000-000000000101', true, 'Abusive messages to technicians.') $$,
  'An admin suspends a customer'
);
select throws_ok(
  $$ select public.set_customer_suspended('00000000-0000-0000-0000-000000000201', true) $$,
  'P0001', 'Only customer accounts are suspended here', 'Technicians are suspended from their own page'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select throws_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a101', 'Heater', 'Cold', now() + interval '2 days') $$,
  '42501', 'Your account is suspended, so you can''t book new repairs. Write to PatchUp to sort it out.',
  'A suspended customer can''t book'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is((select count(*)::int from public.account_suspensions), 0, 'Only they and admins see the suspension');
select pg_temp.login_as('00000000-0000-0000-0000-000000000901');
select public.set_customer_suspended('00000000-0000-0000-0000-000000000101', false);
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select lives_ok(
  $$ select public.create_booking((select id from public.service_categories where slug = 'plumbing'),
       '00000000-0000-0000-0000-00000000a101', 'Heater', 'Cold', now() + interval '2 days') $$,
  'Lifted, they can book again'
);

select * from finish();
rollback;
