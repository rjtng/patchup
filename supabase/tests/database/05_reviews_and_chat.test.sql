-- Chat and reviews: who can read which messages, unread counts, the
-- notifications a message or a review sends, and the chat list.
-- Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

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
create function pg_temp.say(p_booking text, p_body text) returns void language sql as $$
  insert into public.messages (booking_id, body) values (pg_temp.booking(p_booking), p_body);
$$;
-- Someone's chat notifications for a booking, oldest first, as "title | body" (* when unread).
create function pg_temp.chat_notes(p_user uuid, p_booking text) returns text[] language sql stable as $$
  select coalesce(array_agg(n.title || ' | ' || n.body || case when n.read_at is null then ' *' else '' end
                            order by n.created_at, n.id), '{}')
  from public.notifications n where n.user_id = p_user and n.url = '/chat/' || pg_temp.booking(p_booking);
$$;
-- The signed-in person's chats, as "other person | last message | unread".
create function pg_temp.chats() returns text[] language sql stable as $$
  select coalesce(array_agg(c.other_name || ' | ' || coalesce(c.last_body, '-') || ' | ' || c.unread), '{}')
  from public.chat_conversations() c;
$$;

-- People:  ...101 Ana, ...102 Ben (customers)
--          ...201 Tess, ...202 Rey (approved plumbers, taking jobs)
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
-- (Approving the technicians told them so; these tests start from no notifications.)
delete from public.notifications;
insert into public.addresses (id, user_id, street, barangay, city, province) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-000000000101', '12 Mabini St', 'San Antonio', 'Pasig', 'Metro Manila');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'leak', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Kitchen faucet', problem => 'Leaking', scheduled_at => pg_temp.visit());
select is(pg_temp.chats(), '{}', 'An open request has no chat yet (nobody to talk to)');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.accept_booking(pg_temp.booking('leak'));
select is(pg_temp.chats(), array['Ana Santos | - | 0'], 'Once accepted, the technician has a chat with the customer');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.chats(), array['Tess Cruz | - | 0'], 'and the customer with the technician');

-- Messages and their notifications ---------------------------------------------------

select pg_temp.say('leak', 'Hi! The gate is green.');
select pg_temp.logout();
select is(
  (select technician_id from public.messages where body = 'Hi! The gate is green.'),
  '00000000-0000-0000-0000-000000000201'::uuid,
  'A message remembers whose chat it was in'
);
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array['Message from Ana | Hi! The gate is green. *'],
  'The technician hears about it: who (the customer''s first name) and what'
);
select is(
  (select booking_id from public.notifications where user_id = '00000000-0000-0000-0000-000000000201' and url like '/chat/%'),
  pg_temp.booking('leak'),
  'about that booking'
);
select is(pg_temp.chat_notes('00000000-0000-0000-0000-000000000101', 'leak'), '{}', 'The sender doesn''t');

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select pg_temp.say('leak', 'Please ring twice.');
select pg_temp.logout();
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array['2 new messages from Ana | Please ring twice. *'],
  'A second message replaces the unread notification: how many, and the newest'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select is(pg_temp.chats(), array['Ana Santos | Please ring twice. | 2'], 'The technician''s chat list shows the newest message and 2 unread');
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-000000000201' and read_at is null),
  2,
  'Unread on the bell: the new request and the chat'
);
select lives_ok($$ select public.mark_chat_read(pg_temp.booking('leak')) $$, 'The technician opens the chat');
select is(pg_temp.chats(), array['Ana Santos | Please ring twice. | 0'], 'and nothing is unread in it now');
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array['2 new messages from Ana | Please ring twice.'],
  'and its notification is read too'
);
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-000000000201' and read_at is null),
  1,
  'but not the technician''s other notifications'
);

select pg_temp.say('leak', 'Noted po. See you at 10!');
select is(pg_temp.chats(), array['Ana Santos | Noted po. See you at 10! | 0'], 'Their own reply isn''t unread for them');
select pg_temp.logout();
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000101', 'leak'),
  array['Message from Tess Cruz | Noted po. See you at 10! *'],
  'The customer hears about the reply, with the technician''s full name'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select pg_temp.say('leak', 'Thank you!');
select pg_temp.logout();
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array['2 new messages from Ana | Please ring twice.', 'Message from Ana | Thank you! *'],
  'After reading, a new message starts a new notification (counting only what''s new)'
);

select case when (select relkind from pg_class where oid = to_regclass('realtime.messages')) = 'r'
  then collect_tap(
    is(
      (select payload ->> 'booking_id' from realtime.messages
       where event = 'message' and topic = 'booking:' || pg_temp.booking('leak') order by inserted_at desc limit 1),
      pg_temp.booking('leak')::text,
      'A message is announced live on the booking''s topic'
    ),
    ok(
      (select payload ? 'message_id' and not payload ? 'body' from realtime.messages
       where event = 'message' order by inserted_at desc limit 1),
      'with its id but not what it says (the app reads it through the access rules)'
    ))
  else skip('Realtime''s messages table is managed by Realtime here', 2)
  end;

-- Who can see the chat ----------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000102');
select is(pg_temp.chats(), '{}', 'Another customer has no chats');
select throws_ok(
  $$ select public.mark_chat_read(pg_temp.booking('leak')) $$,
  'P0002', 'Chat not found',
  'and can''t mark this one read'
);
select pg_temp.login_as_visitor();
select throws_ok(
  $$ select public.chat_conversations() $$,
  '42501', null,
  'Signed-out visitors have no chats'
);
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select throws_ok(
  $$ insert into public.messages (booking_id, body, technician_id) values (pg_temp.booking('leak'), 'Hi', '00000000-0000-0000-0000-000000000202') $$,
  '42501', null,
  'Nobody can file a message under another technician''s chat'
);
select throws_ok(
  $$ update public.chat_reads set read_at = now() - interval '1 day' $$,
  '42501', null,
  'Read markers change only through mark_chat_read'
);

-- A technician gives the job back -------------------------------------------------------

select public.decline_booking(pg_temp.booking('leak'), 'Sick today');
select is_empty($$ select id from public.messages $$, 'The technician who gave the job back no longer sees the chat');
select is(pg_temp.chats(), '{}', 'or has it in their list');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select public.accept_booking(pg_temp.booking('leak'));
select is_empty($$ select id from public.messages $$, 'The next technician doesn''t see the earlier conversation');
select is(pg_temp.chats(), array['Ana Santos | - | 0'], 'and starts with an empty chat');
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is((select count(*)::int from public.messages), 4, 'The customer still sees the whole chat');
select public.mark_chat_read(pg_temp.booking('leak'));
select pg_temp.say('leak', 'Hello Rey!');
select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select is(
  (select array_agg(body) from public.messages),
  array['Hello Rey!'],
  'The new technician sees messages from their own time on the job'
);
select is(pg_temp.chats(), array['Ana Santos | Hello Rey! | 1'], 'and counts only those as unread');
select pg_temp.logout();
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000202', 'leak'),
  array['Message from Ana | Hello Rey! *'],
  'and hears about them'
);
select is(
  pg_temp.chat_notes('00000000-0000-0000-0000-000000000201', 'leak'),
  array['2 new messages from Ana | Please ring twice.', 'Message from Ana | Thank you! *'],
  'but the previous technician doesn''t'
);

-- Reviews ------------------------------------------------------------------------------

select pg_temp.login_as('00000000-0000-0000-0000-000000000202');
select public.mark_en_route(pg_temp.booking('leak'));
select public.mark_arrived(pg_temp.booking('leak'));
select public.complete_booking(pg_temp.booking('leak'));
select pg_temp.logout();
select is(
  (select body from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000101' and title = 'Job done'),
  'Total: ₱300, paid in cash. How did it go? Tap to rate Rey Tan.',
  '"Job done" asks the customer to rate the technician'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.chats(), array['Rey Tan | Hello Rey! | 0'], 'A finished booking with messages stays in the chat list');
select public.submit_review(pg_temp.booking('leak'), 5, 'Fast and tidy');
select pg_temp.logout();
select is(
  (select title || ' | ' || body || ' | ' || url from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000202' and title like '%gave you%'),
  'Ana gave you 5 stars | “Fast and tidy” | /jobs/' || pg_temp.booking('leak'),
  'The technician hears about the review'
);

select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
insert into booking_ids select 'drain', id from public.create_booking(
  category_id => pg_temp.category('plumbing'), address_id => '00000000-0000-0000-0000-00000000a101',
  appliance => 'Drain', problem => 'Slow', scheduled_at => pg_temp.visit(),
  technician_id => '00000000-0000-0000-0000-000000000201');
select pg_temp.login_as('00000000-0000-0000-0000-000000000201');
select public.accept_booking(pg_temp.booking('drain'));
select public.mark_arrived(pg_temp.booking('drain'));
select public.complete_booking(pg_temp.booking('drain'));
select pg_temp.login_as('00000000-0000-0000-0000-000000000101');
select is(pg_temp.chats(), array['Rey Tan | Hello Rey! | 0'], 'A finished booking without messages leaves the chat list');
select public.submit_review(pg_temp.booking('drain'), 1);
select pg_temp.logout();
select is(
  (select title || ' | ' || body from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000201' and title like '%gave you%'),
  'Ana gave you 1 star | Drain',
  'One star, and without a comment, the job instead'
);
select is(
  (select rating_avg from public.technician_profiles where id = '00000000-0000-0000-0000-000000000201'),
  1.00::numeric,
  'and it counts in their rating'
);

-- On the phone ---------------------------------------------------------------------------

set local role service_role;
select is(
  (select public.push_take_delivery(n.id) ->> 'tag' from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000202' and n.url like '/chat/%' limit 1),
  '/chat/' || pg_temp.booking('leak'),
  'A chat''s messages share a tag on the phone'
);
select is(
  (select public.push_take_delivery(n.id) ->> 'tag' from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-000000000202' and n.url like '/jobs/%' limit 1),
  '/jobs/' || pg_temp.booking('leak'),
  'apart from the booking''s own updates'
);
reset role;

select * from finish();
rollback;
