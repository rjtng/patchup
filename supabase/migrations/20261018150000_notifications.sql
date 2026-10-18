-- Notifications: each step of a booking tells the right people, in the app
-- (Notifications, with an unread count on the bell) and, if they've turned
-- it on, on their phone even when PatchUp is closed (Web Push, sent by the
-- send-push Edge Function in supabase/functions).
--
--   Step                      Who hears
--   new open request          technicians who could take it
--   request for a technician  that technician
--   accepted / assigned       the customer (and an assigned technician)
--   given back                the customer, and the technicians who could take it now
--   on the way, arrived       the customer
--   quote sent                the customer
--   quote approved/declined   the technician
--   completed                 the customer
--   cancelled                 whoever didn't cancel it (customer, technician)

-- pg_net lets the database call the send-push function. Supabase has it,
-- locally too; a plain Postgres without it simply doesn't send phone
-- notifications.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 300),
  url text not null default '/notifications' check (url ~ '^/'), -- the screen it opens
  -- The moment it was written (not the transaction's start), so several from
  -- one step keep their order.
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  pushed_at timestamptz -- when the sender picked it up for the phone
);

create index notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index notifications_booking_id_idx on public.notifications (booking_id);

-- A browser that agreed to show PatchUp's notifications (one per device).
create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- The key pair push messages are signed with (VAPID). The send-push function
-- creates it on its first run, so the private key never leaves Supabase.
create table private.push_keys (
  id boolean primary key default true check (id), -- a single row
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

-- Per-project settings that aren't part of the schema. `push_function_url` is
-- set on the hosted project only (see supabase/README.md), so other databases
-- never call out.
create table private.settings (
  name text primary key,
  value text not null
);

revoke all on private.push_keys, private.settings from public, anon, authenticated;

-- People read their own notifications; everything else goes through the
-- functions below.
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.notifications, public.push_subscriptions from anon, authenticated;
grant all on public.notifications, public.push_subscriptions to service_role;
grant select on public.notifications to authenticated;

create policy "People see their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Writing notifications
-- ---------------------------------------------------------------------------

create function private.notify(p_user uuid, p_booking uuid, p_title text, p_body text, p_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, booking_id, title, body, url)
  values (p_user, p_booking, left(p_title, 120), left(coalesce(p_body, ''), 300), p_url);
$$;

/** 850 -> "₱850", 1250.5 -> "₱1,250.50" */
create function private.peso(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₱' || regexp_replace(to_char(p_amount, 'FM999,999,990.00'), '\.00$', '');
$$;

/** "Mon, Oct 19, 10:00 AM", in Manila time like the app. */
create function private.visit_time(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone 'Asia/Manila', 'Dy, Mon FMDD, FMHH12:MI AM');
$$;

-- Each step of a booking (booking_events) tells the people it concerns,
-- never the person who took the step.
create function private.notify_booking_event()
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
                           'Total: ' || private.peso(b.final_amount) || ', paid in cash. Thanks for using PatchUp!',
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

create trigger booking_events_notify
  after insert on public.booking_events
  for each row execute function private.notify_booking_event();

-- ---------------------------------------------------------------------------
-- Delivering them: live in the app, and to the phone
-- ---------------------------------------------------------------------------

create function private.deliver_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  -- The bell and Notifications update right away (see the live updates migration).
  begin
    perform realtime.send(jsonb_build_object('notification_id', new.id), 'notification', 'user:' || new.user_id, true);
  exception when others then
    raise warning 'Live update for notification % not sent: %', new.id, sqlerrm;
  end;

  -- Phones: the send-push function takes it from here (it only needs the id).
  begin
    select s.value into v_url from private.settings s where s.name = 'push_function_url';
    if v_url is not null and exists (select 1 from public.push_subscriptions p where p.user_id = new.user_id) then
      perform net.http_post(url := v_url, body := jsonb_build_object('notification_id', new.id));
    end if;
  exception when others then
    raise warning 'Phone notification % not requested: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger notifications_deliver
  after insert on public.notifications
  for each row execute function private.deliver_notification();

-- ---------------------------------------------------------------------------
-- For the app (signed-in people)
-- ---------------------------------------------------------------------------

-- Marks all of the signed-in person's notifications as read.
create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null;
$$;

-- Saves this browser's push subscription (PushSubscription.toJSON()) for the
-- signed-in person, taking it over from whoever used this device before.
create function public.save_push_subscription(subscription jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint text := subscription ->> 'endpoint';
  v_p256dh text := subscription -> 'keys' ->> 'p256dh';
  v_auth text := subscription -> 'keys' ->> 'auth';
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to turn on notifications' using errcode = '42501';
  end if;
  if v_endpoint is null or v_endpoint !~ '^https://' or char_length(v_endpoint) > 1000
     or coalesce(v_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}=*$'
     or coalesce(v_auth, '') !~ '^[A-Za-z0-9_-]{16,32}=*$' then
    raise exception 'That isn''t a valid push subscription';
  end if;

  delete from public.push_subscriptions p where p.endpoint = v_endpoint;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (v_endpoint, (select auth.uid()), v_p256dh, v_auth);
end;
$$;

create function public.remove_push_subscription(endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions p
  where p.endpoint = remove_push_subscription.endpoint and p.user_id = (select auth.uid());
$$;

-- The public half of the signing key, which browsers need to subscribe; null
-- until the send-push function has set itself up.
create function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select k.public_key from private.push_keys k;
$$;

-- "Send me a test notification" (at most one every 30 seconds).
create function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.notifications n
    where n.user_id = (select auth.uid()) and n.booking_id is null
      and n.title = 'Notifications are on' and n.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Wait a moment before sending another test';
  end if;
  perform private.notify((select auth.uid()), null, 'Notifications are on',
                         'You''ll hear from PatchUp here when something happens with your bookings.',
                         '/notifications');
end;
$$;

-- ---------------------------------------------------------------------------
-- For the send-push function (service role only)
-- ---------------------------------------------------------------------------

-- Stores the signing key pair unless one exists; returns the public key in use.
create function public.push_store_keys(public_key text, private_jwk jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.push_keys (public_key, private_jwk)
  values (push_store_keys.public_key, push_store_keys.private_jwk)
  on conflict (id) do nothing;
  return (select k.public_key from private.push_keys k);
end;
$$;

-- Hands over a notification for its phone delivery, once: what to show, the
-- person's devices, and the signing keys. Null if it was already taken.
create function public.push_take_delivery(notification_id uuid)
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
    'tag', coalesce(v_n.booking_id, v_n.id), -- a booking's newer update replaces its older one on the phone
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s where s.user_id = v_n.user_id
    ), '[]'::jsonb),
    'vapid', (select jsonb_build_object('public_key', k.public_key, 'private_jwk', k.private_jwk) from private.push_keys k)
  );
end;
$$;

-- Devices the push services say are gone (the app was uninstalled, say).
create function public.push_forget(endpoints text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions s where s.endpoint = any (push_forget.endpoints);
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke execute on function
  private.notify(uuid, uuid, text, text, text),
  private.peso(numeric),
  private.visit_time(timestamptz),
  private.notify_booking_event(),
  private.deliver_notification(),
  public.mark_notifications_read(),
  public.save_push_subscription(jsonb),
  public.remove_push_subscription(text),
  public.push_public_key(),
  public.send_test_notification(),
  public.push_store_keys(text, jsonb),
  public.push_take_delivery(uuid),
  public.push_forget(text[])
from public, anon, authenticated;

grant execute on function
  public.mark_notifications_read(),
  public.save_push_subscription(jsonb),
  public.remove_push_subscription(text),
  public.push_public_key(),
  public.send_test_notification()
to authenticated;

grant execute on function
  public.push_store_keys(text, jsonb),
  public.push_take_delivery(uuid),
  public.push_forget(text[])
to service_role;
