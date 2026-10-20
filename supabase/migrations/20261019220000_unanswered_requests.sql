-- Requests nobody accepts. Every 5 minutes a job (pg_cron) follows up on the
-- requests still waiting for a technician:
--
--   Waiting too long     30 minutes without a technician, or sooner when the
--                        visit is less than 2 hours away (but after at least
--                        10 minutes): admins hear about it so they can assign
--                        someone, the customer hears that PatchUp is helping,
--                        and the technicians who could take it are reminded.
--                        A request for a chosen technician who hasn't
--                        answered opens to the others too.
--   Visit time reached   still nobody: the request is cancelled and the
--                        customer is told, so they can book another time. (A
--                        cancelled booking doesn't use up the first-booking
--                        offer.)
--
-- A request starts waiting when it's made, and again whenever a technician
-- gives it back.

alter table public.booking_events drop constraint booking_events_event_check;
alter table public.booking_events add constraint booking_events_event_check check (event in (
  'created', 'accepted', 'declined', 'assigned', 'en_route', 'arrived',
  'quote_sent', 'quote_approved', 'quote_declined', 'completed', 'cancelled',
  'overdue',  -- waited too long; admins were told
  'expired'   -- nobody took it before the visit time, so it was cancelled
));

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

-- When a request started waiting for a technician: when it was made, or when
-- a technician last gave it back.
create function private.waiting_since(p_booking public.bookings)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(max(e.created_at), p_booking.created_at)
  from public.booking_events e
  where e.booking_id = p_booking.id and e.event in ('created', 'declined');
$$;

-- When a waiting request needs following up: 30 minutes on, or once the visit
-- is less than 2 hours away (but not before 10 minutes have gone by).
create function private.follow_up_at(p_waiting_since timestamptz, p_scheduled_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select least(p_waiting_since + interval '30 minutes',
               greatest(p_waiting_since + interval '10 minutes', p_scheduled_at - interval '2 hours'));
$$;

-- ---------------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------------

-- Cancels the requests whose visit time has come, then flags the ones that
-- have waited too long (once each time they start waiting). The steps are
-- booking events, so the notifications below go out as for any other step.
-- Requests someone is accepting right now are left for the next run.
create function private.follow_up_requests()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  for b in
    select * from public.bookings
    where status = 'requested' and scheduled_at <= now()
    for update skip locked
  loop
    update public.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = null,
        cancel_reason = 'No technician was free for this time'
    where id = b.id
    returning * into b;
    perform private.log_event(b, 'expired');
  end loop;

  for b in
    select * from public.bookings r
    where r.status = 'requested'
      and now() >= private.follow_up_at(private.waiting_since(r), r.scheduled_at)
      and not exists (
        select 1 from public.booking_events e
        where e.booking_id = r.id and e.event = 'overdue' and e.created_at >= private.waiting_since(r)
      )
    for update skip locked
  loop
    if b.technician_id is not null then
      -- The chosen technician hasn't answered: the others can take it too.
      update public.bookings set technician_id = null where id = b.id returning * into b;
    end if;
    perform private.log_event(b, 'overdue');
  end loop;
end;
$$;

revoke execute on function
  private.waiting_since(public.bookings),
  private.follow_up_at(timestamptz, timestamptz),
  private.follow_up_requests()
from public, anon, authenticated;

-- Every 5 minutes. Supabase has pg_cron (locally too); a plain Postgres
-- without it doesn't follow up on its own.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    perform cron.schedule('follow-up-requests', '*/5 * * * *', 'select private.follow_up_requests()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who hears (as before, plus the two new steps)
-- ---------------------------------------------------------------------------

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

  when 'overdue' then
    perform private.notify(a.id, b.id, 'No technician yet',
                           v_what || ' in ' || v_area || ' · ' || v_when
                           || '. Assign someone, or it''s cancelled at the visit time.',
                           '/admin/bookings/' || b.id)
    from public.profiles a
    where a.role = 'admin';
    perform private.notify(t.id, b.id, 'Still open: ' || lower(v_category) || ' request',
                           b.appliance || ' in ' || v_area || ' · ' || v_when || '. Nobody has taken it yet.',
                           '/jobs/' || b.id)
    from public.technician_profiles t
    where private.is_open_for_jobs(t.id, b.category_id);
    perform private.notify(b.customer_id, b.id, 'Still finding you a technician',
                           'It''s taking longer than usual, so the PatchUp team is helping. ' || v_what || ' · ' || v_when,
                           '/bookings/' || b.id);

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
    if new.actor_id is distinct from b.customer_id then
      -- PatchUp (an admin) cancelled: both hear it, with the reason given.
      perform private.notify(b.customer_id, b.id, 'PatchUp cancelled your booking',
                             v_what || ' · ' || v_when || coalesce('. ' || nullif(new.note, ''), ''), '/bookings/' || b.id);
      if b.technician_id is not null then
        perform private.notify(b.technician_id, b.id, 'PatchUp cancelled this job',
                               b.appliance || ' · ' || v_when
                               || coalesce('. ' || nullif(new.note, ''), ''), '/jobs/' || b.id);
      end if;
    elsif b.technician_id is not null then
      perform private.notify(b.technician_id, b.id, 'Booking cancelled',
                             v_customer || ' cancelled: ' || b.appliance || ' · ' || v_when, '/jobs/' || b.id);
    end if;

  when 'expired' then
    perform private.notify(b.customer_id, b.id, 'No technician could make it',
                           'Sorry, nobody was free for ' || v_what || ' · ' || v_when
                           || ', so we cancelled it. Tap to book another time.',
                           '/bookings/' || b.id);
    if b.technician_id is not null then
      perform private.notify(b.technician_id, b.id, 'Request cancelled',
                             v_customer || '''s request wasn''t answered before the visit time: '
                             || b.appliance || ' · ' || v_when,
                             '/jobs/' || b.id);
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

-- ---------------------------------------------------------------------------
-- The admin dashboard counts the requests waiting too long by the same rule
-- (it used to be "over an hour")
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can see this' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'pending_technicians', (select count(*) from public.technician_profiles t where t.verification_status = 'pending'),
    'approved_technicians', (select count(*) from public.technician_profiles t where t.verification_status = 'approved'),
    'available_technicians', (select count(*) from public.technician_profiles t
                              where t.verification_status = 'approved' and t.is_available),
    'customers', (select count(*) from public.profiles p where p.role = 'customer'),
    -- Requests nobody has taken yet, and those waiting too long.
    'unassigned_requests', (select count(*) from public.bookings b where b.status = 'requested' and b.technician_id is null),
    'stale_requests', (select count(*) from public.bookings b
                       where b.status = 'requested'
                         and now() >= private.follow_up_at(private.waiting_since(b), b.scheduled_at)),
    -- Requests for a chosen technician who hasn't answered yet.
    'awaiting_technician', (select count(*) from public.bookings b where b.status = 'requested' and b.technician_id is not null),
    'active_bookings', (select count(*) from public.bookings b
                        where b.status in ('accepted', 'en_route', 'arrived', 'quoted', 'in_progress')),
    'booked_week', (select count(*) from public.bookings b where b.created_at > now() - interval '7 days'),
    'completed_week', (select count(*) from public.bookings b
                       where b.status = 'completed' and b.completed_at > now() - interval '7 days'),
    'completed_value_week', (select coalesce(sum(b.final_amount), 0) from public.bookings b
                             where b.status = 'completed' and b.completed_at > now() - interval '7 days'),
    'cancelled_week', (select count(*) from public.bookings b
                       where b.status = 'cancelled' and b.cancelled_at > now() - interval '7 days')
  );
end;
$$;
