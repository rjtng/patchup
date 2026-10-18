-- Live updates: when a booking changes, Supabase Realtime tells the people
-- who can see it, so their screens update without a refresh.
--
-- Uses Broadcast from the database on private channels (Supabase's
-- recommended way). A message only says which booking changed and its new
-- status; the app then reloads what it shows through the API, where the
-- usual access rules apply. So nobody learns anything from a message that
-- they couldn't already read.
--
-- Channel topics:
--   booking:<booking id>     the booking's own page (customer, technician, admins,
--                            and technicians who could take it while it's open)
--   user:<user id>           someone's lists: a customer's bookings, a technician's jobs
--   requests:<category id>   open requests in a category, for the technicians who
--                            take that kind of job

-- Which topics hear about a change to a booking (p_old is null for a new one).
create function private.booking_topics(p_new public.bookings, p_old public.bookings)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    'booking:' || p_new.id,
    'user:' || p_new.customer_id,
    case when p_new.technician_id is not null then 'user:' || p_new.technician_id end,
    -- A technician who gave the job back (or was replaced) drops it from their list.
    case when p_old.technician_id is not null and p_old.technician_id is distinct from p_new.technician_id
      then 'user:' || p_old.technician_id end,
    -- Open requests coming, going (taken, cancelled), or coming back.
    case when (p_new.status = 'requested' and p_new.technician_id is null)
           or (p_old.status = 'requested' and p_old.technician_id is null)
      then 'requests:' || p_new.category_id end
  ], null);
$$;

create function private.broadcast_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
begin
  foreach v_topic in array private.booking_topics(new, old) loop
    perform realtime.send(
      jsonb_build_object('booking_id', new.id, 'status', new.status),
      'booking_changed',
      v_topic,
      true -- private: only people allowed on the topic (below) receive it
    );
  end loop;
  return null;
exception when others then
  -- A missed live update only means a screen catches up later; it must never
  -- stop the booking change itself.
  raise warning 'Live update for booking % not sent: %', new.id, sqlerrm;
  return null;
end;
$$;

create trigger bookings_broadcast_changes
  after insert or update on public.bookings
  for each row execute function private.broadcast_booking_change();

-- Who may listen to a topic. Runs as the person joining, so "can see the
-- booking" is decided by the bookings access rules themselves.
create function private.can_listen(p_topic text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_kind text := split_part(p_topic, ':', 1);
  v_id uuid;
begin
  if p_topic is null or p_topic !~ '^(booking|user|requests):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := split_part(p_topic, ':', 2)::uuid;

  return case v_kind
    when 'booking' then exists (select 1 from public.bookings b where b.id = v_id)
    when 'user' then v_id = auth.uid()
    when 'requests' then private.is_open_for_jobs(auth.uid(), v_id)
    else false
  end;
end;
$$;

revoke execute on function
  private.booking_topics(public.bookings, public.bookings),
  private.broadcast_booking_change(),
  private.can_listen(text)
from public, anon, authenticated;
grant execute on function private.can_listen(text) to authenticated;

-- Realtime checks this policy when someone joins a private channel. The
-- realtime schema belongs to the Realtime service; a database without it
-- (such as the bare Postgres CI tests run on) skips the policy.
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not found (Realtime isn''t set up here): skipping its policy';
    return;
  end if;
  create policy "Listen to live updates about what you can see"
    on realtime.messages for select to authenticated
    using (
      realtime.messages.extension = 'broadcast'
      and (select private.can_listen((select realtime.topic())))
    );
end;
$$;
