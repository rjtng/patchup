-- Reviews and chat.
--
-- Chat: the customer and the booking's technician message each other
-- (public.messages, from the core schema). Where each person has read up to
-- is kept in chat_reads, so the app can show what's new. A new message tells
-- the other person right away: live on the chat (topic booking:<id>, event
-- "message") and with one notification per chat while it's unread, which
-- also goes to their phone.
--
-- If a technician gives a job back, the next one doesn't see the earlier
-- conversation: each message remembers whose chat it was (technician_id).
--
-- Reviews: the technician hears about a new review, and the "job done"
-- notification asks the customer for one.

-- ---------------------------------------------------------------------------
-- Whose chat a message belongs to
-- ---------------------------------------------------------------------------

-- The booking's technician when the message was sent (set by the trigger below).
alter table public.messages add column technician_id uuid references public.profiles (id) on delete restrict;
update public.messages m set technician_id = b.technician_id from public.bookings b where b.id = m.booking_id;
create index messages_technician_id_idx on public.messages (technician_id);

-- The moment each message was written (not its transaction's start), so the
-- newest is always last and "read up to" is exact.
alter table public.messages alter column created_at set default clock_timestamp();

create function private.set_message_technician()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select b.technician_id into new.technician_id from public.bookings b where b.id = new.booking_id;
  return new;
end;
$$;

create trigger messages_set_technician
  before insert on public.messages
  for each row execute function private.set_message_technician();

-- A technician reads only their own conversation with the customer; the
-- customer reads the whole chat.
drop policy "Customer and technician read the booking's chat; admins too" on public.messages;
create policy "Customer and technician read the booking's chat; admins too"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = messages.booking_id
        and (b.customer_id = (select auth.uid())
             or (b.technician_id = (select auth.uid()) and messages.technician_id = (select auth.uid())))
    )
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- What's been read
-- ---------------------------------------------------------------------------

create table public.chat_reads (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key (booking_id, user_id)
);

create index chat_reads_user_id_idx on public.chat_reads (user_id);

alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon, authenticated;
grant all on public.chat_reads to service_role;
grant select on public.chat_reads to authenticated;

create policy "People see how far they've read their chats"
  on public.chat_reads for select to authenticated
  using (user_id = (select auth.uid()));

-- The signed-in person has read this chat (and its notification) up to now.
create function public.mark_chat_read(booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bookings b
    where b.id = mark_chat_read.booking_id and (select auth.uid()) in (b.customer_id, b.technician_id)
  ) then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  insert into public.chat_reads (booking_id, user_id, read_at)
  values (mark_chat_read.booking_id, (select auth.uid()), clock_timestamp())
  on conflict on constraint chat_reads_pkey do update set read_at = excluded.read_at;

  update public.notifications n set read_at = now()
  where n.user_id = (select auth.uid()) and n.url = '/chat/' || mark_chat_read.booking_id and n.read_at is null;
end;
$$;

-- The signed-in person's chats, newest first: every booking with a technician
-- that's still going, and finished ones that have messages. Runs with the
-- caller's access rules, so it only counts messages they can read.
create function public.chat_conversations()
returns table (
  booking_id uuid,
  appliance text,
  category text,
  status public.booking_status,
  other_name text,
  is_customer boolean,
  last_body text,
  last_at timestamptz,
  last_from_me boolean,
  unread integer
)
language sql
stable
set search_path = ''
as $$
  select
    b.id,
    b.appliance,
    c.name,
    b.status,
    coalesce(nullif(trim(p.full_name), ''),
             case when b.customer_id = (select auth.uid()) then 'Your technician' else 'PatchUp customer' end),
    b.customer_id = (select auth.uid()),
    last.body,
    last.created_at,
    last.sender_id = (select auth.uid()),
    (select count(*)::integer from public.messages m
     where m.booking_id = b.id and m.sender_id <> (select auth.uid())
       and m.created_at > coalesce(r.read_at, '-infinity'))
  from public.bookings b
  join public.service_categories c on c.id = b.category_id
  left join public.profiles p
    on p.id = case when b.customer_id = (select auth.uid()) then b.technician_id else b.customer_id end
  left join public.chat_reads r on r.booking_id = b.id and r.user_id = (select auth.uid())
  left join lateral (
    select m.body, m.created_at, m.sender_id from public.messages m
    where m.booking_id = b.id
    order by m.created_at desc, m.id desc
    limit 1
  ) last on true
  where b.technician_id is not null
    and (select auth.uid()) in (b.customer_id, b.technician_id)
    and (last.created_at is not null or b.status not in ('completed', 'cancelled'))
  order by coalesce(last.created_at, b.created_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- Telling the other person
-- ---------------------------------------------------------------------------

create function private.message_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_to uuid;
  v_from text;
  v_unread integer;
begin
  -- The chat (and the booking's page) shows it right away.
  begin
    perform realtime.send(jsonb_build_object('booking_id', new.booking_id, 'message_id', new.id),
                          'message', 'booking:' || new.booking_id, true);
  exception when others then
    raise warning 'Live update for message % not sent: %', new.id, sqlerrm;
  end;

  -- One notification per chat while it's unread: the newest message, and how many.
  begin
    select * into b from public.bookings where id = new.booking_id;
    v_to := case when new.sender_id = b.customer_id then b.technician_id else b.customer_id end;
    if v_to is null or v_to = new.sender_id then
      return null;
    end if;
    select case when new.sender_id = b.customer_id
             then nullif(split_part(trim(p.full_name), ' ', 1), '') -- customers by first name, as elsewhere
             else nullif(trim(p.full_name), '') end
    into v_from
    from public.profiles p where p.id = new.sender_id;
    v_from := coalesce(v_from, case when new.sender_id = b.customer_id then 'the customer' else 'your technician' end);

    select count(*) into v_unread from public.messages m
    where m.booking_id = new.booking_id and m.sender_id = new.sender_id
      and (v_to = b.customer_id or m.technician_id = v_to)
      and m.created_at > coalesce((select r.read_at from public.chat_reads r
                                   where r.booking_id = new.booking_id and r.user_id = v_to), '-infinity');

    delete from public.notifications n
    where n.user_id = v_to and n.url = '/chat/' || new.booking_id and n.read_at is null;
    perform private.notify(v_to, new.booking_id,
                           case when v_unread > 1 then v_unread || ' new messages from ' || v_from
                                else 'Message from ' || v_from end,
                           new.body, '/chat/' || new.booking_id);
  exception when others then
    -- Like other notifications, this must never stop the message itself.
    raise warning 'Notification for message % not written: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function private.message_sent();

create function private.review_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appliance text;
begin
  select b.appliance into v_appliance from public.bookings b where b.id = new.booking_id;
  perform private.notify(new.technician_id, new.booking_id,
                         coalesce(nullif(new.customer_name, ''), 'Your customer') || ' gave you ' || new.rating
                         || case when new.rating = 1 then ' star' else ' stars' end,
                         case when new.comment <> '' then '“' || new.comment || '”' else v_appliance end,
                         '/jobs/' || new.booking_id);
  -- The job's page shows the review right away.
  begin
    perform realtime.send(jsonb_build_object('booking_id', new.booking_id), 'booking_changed', 'booking:' || new.booking_id, true);
  exception when others then
    raise warning 'Live update for the review of booking % not sent: %', new.booking_id, sqlerrm;
  end;
  return null;
exception when others then
  raise warning 'Notification for the review of booking % not written: %', new.booking_id, sqlerrm;
  return null;
end;
$$;

create trigger reviews_notify
  after insert on public.reviews
  for each row execute function private.review_left();

-- "Job done" now asks for a review (otherwise as in the notifications migration).
create or replace function private.notify_booking_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_category text;
  v_customer text;   -- first name
  v_technician text; -- full name
  v_what text;       -- "Plumbing: Kitchen faucet"
  v_when text;
  v_area text;
  v_amount numeric;
begin
  select * into b from public.bookings where id = new.booking_id;
  select c.name into v_category from public.service_categories c where c.id = b.category_id;
  select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'The customer') into v_customer
  from public.profiles p where p.id = b.customer_id;
  select coalesce(nullif(trim(p.full_name), ''), 'Your technician') into v_technician
  from public.profiles p where p.id = b.technician_id;
  v_what := v_category || ': ' || b.appliance;
  v_when := private.visit_time(b.scheduled_at);
  v_area := b.barangay || ', ' || b.city;

  case new.event
  when 'created', 'declined' then
    if b.technician_id is null then
      -- An open request: every technician who could take it (not one who just gave it back).
      perform private.notify(t.id, b.id, 'New ' || lower(v_category) || ' request',
                             b.appliance || ' in ' || v_area || ' · ' || v_when, '/jobs/' || b.id)
      from public.technician_profiles t
      where t.id is distinct from new.actor_id and private.is_open_for_jobs(t.id, b.category_id);
    else
      perform private.notify(b.technician_id, b.id, 'Request for you',
                             v_customer || ' asked you: ' || b.appliance || ' in ' || v_area || ' · ' || v_when,
                             '/jobs/' || b.id);
    end if;
    if new.event = 'declined' then
      perform private.notify(b.customer_id, b.id, 'Finding you another technician',
                             'Your technician can''t make it, so your request went to other '
                             || lower(v_category) || ' technicians. ' || v_what,
                             '/bookings/' || b.id);
    end if;

  when 'accepted' then
    perform private.notify(b.customer_id, b.id, v_technician || ' accepted your booking',
                           v_what || ' · ' || v_when, '/bookings/' || b.id);

  when 'assigned' then
    perform private.notify(b.customer_id, b.id, v_technician || ' will do your repair',
                           v_what || ' · ' || v_when, '/bookings/' || b.id);
    perform private.notify(b.technician_id, b.id, 'New job for you',
                           b.appliance || ' in ' || v_area || ' · ' || v_when, '/jobs/' || b.id);

  when 'en_route' then
    perform private.notify(b.customer_id, b.id, v_technician || ' is on the way', v_what, '/bookings/' || b.id);

  when 'arrived' then
    perform private.notify(b.customer_id, b.id, v_technician || ' has arrived', v_what, '/bookings/' || b.id);

  when 'quote_sent' then
    select q.total into v_amount from public.quotes q where q.booking_id = b.id and q.status = 'pending';
    perform private.notify(b.customer_id, b.id, 'Quote ready: ' || private.peso(v_amount),
                           'Approve it to start the repair. ' || v_what, '/bookings/' || b.id);

  when 'quote_approved' then
    select q.total into v_amount from public.quotes q
    where q.booking_id = b.id and q.status = 'approved' order by q.responded_at desc limit 1;
    perform private.notify(b.technician_id, b.id, 'Quote approved',
                           v_customer || ' approved ' || private.peso(v_amount) || '. You can start the repair.',
                           '/jobs/' || b.id);

  when 'quote_declined' then
    perform private.notify(b.technician_id, b.id, 'Quote declined',
                           v_customer || ' declined the quote. Send a new one, or finish with the inspection only.',
                           '/jobs/' || b.id);

  when 'completed' then
    perform private.notify(b.customer_id, b.id, 'Job done',
                           'Total: ' || private.peso(b.final_amount) || ', paid in cash. How did it go? Tap to rate '
                           || v_technician || '.',
                           '/bookings/' || b.id);

  when 'cancelled' then
    if b.customer_id is distinct from new.actor_id then
      perform private.notify(b.customer_id, b.id, 'Booking cancelled', v_what || ' · ' || v_when, '/bookings/' || b.id);
    end if;
    if b.technician_id is not null and b.technician_id is distinct from new.actor_id then
      perform private.notify(b.technician_id, b.id, 'Booking cancelled',
                             v_customer || ' cancelled: ' || b.appliance || ' · ' || v_when, '/jobs/' || b.id);
    end if;

  else
    null;
  end case;
  return null;
exception when others then
  -- Notifications must never stop the booking step itself.
  raise warning 'Notifications for booking event % not written: %', new.id, sqlerrm;
  return null;
end;
$$;

-- On the phone, a newer notification replaces the last one for the same
-- screen: a booking's updates replace each other, and so do a chat's
-- messages, but a message doesn't replace "Quote ready".
create or replace function public.push_take_delivery(notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n public.notifications;
begin
  update public.notifications n set pushed_at = now()
  where n.id = push_take_delivery.notification_id and n.pushed_at is null
  returning * into v_n;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'title', v_n.title,
    'body', v_n.body,
    'url', v_n.url,
    'tag', v_n.url,
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s where s.user_id = v_n.user_id
    ), '[]'::jsonb),
    'vapid', (select jsonb_build_object('public_key', k.public_key, 'private_jwk', k.private_jwk) from private.push_keys k)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke execute on function
  private.set_message_technician(),
  private.message_sent(),
  private.review_left(),
  public.mark_chat_read(uuid),
  public.chat_conversations()
from public, anon, authenticated;

grant execute on function
  public.mark_chat_read(uuid),
  public.chat_conversations()
to authenticated;
