-- Visit reminders, and following up when a technician doesn't set off.
-- Every 5 minutes a job (pg_cron) looks at the jobs a technician has taken
-- but not yet set off for:
--
--   The evening before   6 PM (Manila) the day before the visit: the customer
--                        is reminded who's coming and when (unless they booked
--                        after that).
--   1 hour before        the technician is reminded, with the address (unless
--                        they took the job within that hour).
--   Visit time           not on the way yet: the technician is nudged to tap
--                        "I'm on my way", or give the job back.
--   30 minutes late      still not on the way: admins hear about it so they
--                        can call the technician or give the job to someone
--                        else, and the customer hears PatchUp is checking.
--                        (Counted from the visit time, or from when the
--                        technician took the job if that was later.)
--
-- Admins can now give a job that hasn't set off yet to another technician:
-- assign_technician works on accepted jobs too, and the technician who had it
-- is told.

alter table public.booking_events drop constraint booking_events_event_check;
alter table public.booking_events add constraint booking_events_event_check check (event in (
  'created', 'accepted', 'declined', 'assigned', 'en_route', 'arrived',
  'quote_sent', 'quote_approved', 'quote_declined', 'completed', 'cancelled',
  'overdue', 'expired',
  'late',       -- the technician hadn't set off 30 minutes after the visit time; admins were told
  'unassigned'  -- an admin took the job from its technician, to give it to another
));

-- ---------------------------------------------------------------------------
-- The rules
-- ---------------------------------------------------------------------------

-- When the technician who has the job took it (accepted it, or was assigned it).
create function private.taken_at(p_booking public.bookings)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(max(e.created_at), p_booking.created_at)
  from public.booking_events e
  where e.booking_id = p_booking.id and e.event in ('accepted', 'assigned');
$$;

-- 6 PM in Manila the day before a visit: when the customer is reminded.
create function private.evening_before(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (((p_at at time zone 'Asia/Manila')::date - 1) + time '18:00') at time zone 'Asia/Manila';
$$;

-- When a technician who hasn't set off is late enough to tell admins: 30
-- minutes after the visit time, or after they took the job if that was later.
create function private.late_at(p_scheduled_at timestamptz, p_taken_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select greatest(p_scheduled_at, p_taken_at) + interval '30 minutes';
$$;

-- The reminders sent, so each goes once (to each technician, for theirs).
create table private.booking_reminders (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind text not null check (kind in ('customer_evening_before', 'technician_hour_before', 'technician_due')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (booking_id, kind, user_id)
);
create index booking_reminders_user_id_idx on private.booking_reminders (user_id);
revoke all on private.booking_reminders from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------------

create function private.follow_up_visits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_technician text;
  v_what text;
  v_time text;
  v_day text;
begin
  -- The customer, the evening before.
  for b in
    select * from public.bookings r
    where r.status = 'accepted'
      and r.scheduled_at > now()
      and now() >= private.evening_before(r.scheduled_at)
      and r.created_at < private.evening_before(r.scheduled_at)
      and not exists (select 1 from private.booking_reminders m
                      where m.booking_id = r.id and m.kind = 'customer_evening_before')
  loop
    insert into private.booking_reminders (booking_id, kind, user_id) values (b.id, 'customer_evening_before', b.customer_id);
    select coalesce(nullif(trim(p.full_name), ''), 'Your technician') into v_technician
    from public.profiles p where p.id = b.technician_id;
    select c.name || ': ' || b.appliance into v_what from public.service_categories c where c.id = b.category_id;
    v_time := to_char(b.scheduled_at at time zone 'Asia/Manila', 'FMHH12:MI AM');
    v_day := case (b.scheduled_at at time zone 'Asia/Manila')::date - (now() at time zone 'Asia/Manila')::date
               when 0 then 'today' when 1 then 'tomorrow' end;
    perform private.notify(b.customer_id, b.id, 'Your repair is ' || coalesce(v_day, 'coming up'),
                           v_technician || ' is coming at ' || v_time || ' for ' || v_what || ', at ' || b.street || ', '
                           || b.barangay || '. If plans change, you can cancel in the app.',
                           '/bookings/' || b.id);
  end loop;

  -- The technician, an hour before (unless they took it within that hour).
  for b in
    select * from public.bookings r
    where r.status = 'accepted'
      and r.scheduled_at > now()
      and now() >= r.scheduled_at - interval '1 hour'
      and private.taken_at(r) < r.scheduled_at - interval '1 hour'
      and not exists (select 1 from private.booking_reminders m
                      where m.booking_id = r.id and m.kind = 'technician_hour_before' and m.user_id = r.technician_id)
  loop
    insert into private.booking_reminders (booking_id, kind, user_id) values (b.id, 'technician_hour_before', b.technician_id);
    perform private.notify(b.technician_id, b.id,
                           'Coming up at ' || to_char(b.scheduled_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || ': '
                           || b.appliance,
                           b.street || ', ' || b.barangay || ', ' || b.city
                           || '. Tap "I''m on my way" when you leave, so the customer can follow you.',
                           '/jobs/' || b.id);
  end loop;

  -- The technician, at the visit time, if they haven't set off (and took it before then).
  for b in
    select * from public.bookings r
    where r.status = 'accepted'
      and now() >= r.scheduled_at
      and private.taken_at(r) < r.scheduled_at
      and not exists (select 1 from private.booking_reminders m
                      where m.booking_id = r.id and m.kind = 'technician_due' and m.user_id = r.technician_id)
  loop
    insert into private.booking_reminders (booking_id, kind, user_id) values (b.id, 'technician_due', b.technician_id);
    perform private.notify(b.technician_id, b.id, 'You''re due now: ' || b.appliance,
                           b.street || ', ' || b.barangay || '. Tap "I''m on my way", or give the job back if you can''t make it.',
                           '/jobs/' || b.id);
  end loop;

  -- 30 minutes late and still not on the way: admins and the customer (once
  -- for each technician who takes it). Jobs someone is changing right now
  -- are left for the next run.
  for b in
    select * from public.bookings r
    where r.status = 'accepted'
      and now() >= private.late_at(r.scheduled_at, private.taken_at(r))
      and not exists (
        select 1 from public.booking_events e
        where e.booking_id = r.id and e.event = 'late' and e.created_at >= private.taken_at(r)
      )
    for update skip locked
  loop
    perform private.log_event(b, 'late');
  end loop;
end;
$$;

revoke execute on function
  private.taken_at(public.bookings),
  private.evening_before(timestamptz),
  private.late_at(timestamptz, timestamptz),
  private.follow_up_visits()
from public, anon, authenticated;

-- Every 5 minutes, where pg_cron is available (it is on Supabase, and the
-- unanswered requests migration turned it on).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('follow-up-visits', '*/5 * * * *', 'select private.follow_up_visits()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admins give a job that hasn't set off to another technician
-- ---------------------------------------------------------------------------

create or replace function public.assign_technician(booking_id uuid, technician_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if not private.is_admin() then
    raise exception 'Only admins can assign technicians' using errcode = '42501';
  end if;

  v_booking := private.lock_booking(assign_technician.booking_id);
  perform private.require_status(v_booking, 'requested', 'accepted');

  if not private.is_approved_technician(assign_technician.technician_id) then
    raise exception 'That technician isn''t approved';
  end if;

  if v_booking.status = 'accepted' then
    if v_booking.technician_id = assign_technician.technician_id then
      raise exception 'That technician already has this job';
    end if;
    -- The technician who had it hears it's been given to someone else.
    perform private.log_event(v_booking, 'unassigned');
  end if;

  update public.bookings
  set status = 'accepted', technician_id = assign_technician.technician_id
  where id = v_booking.id
  returning * into v_booking;

  perform private.log_event(v_booking, 'assigned');
  return v_booking;
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

  when 'unassigned' then
    -- Logged just before the job goes to someone else: b is still the technician who had it.
    -- (They can't open the job any more, so this opens Jobs.)
    perform private.notify(b.technician_id, b.id, 'PatchUp gave this job to someone else',
                           b.appliance || ' in ' || v_area || ' · ' || v_when || '. You don''t need to go.', '/jobs');

  when 'late' then
    perform private.notify(a.id, b.id, 'Technician hasn''t set off',
                           v_technician || ' hasn''t tapped "I''m on my way" for ' || v_what || ' in ' || v_area
                           || ' · ' || v_when || '. Call them, or give the job to someone else.',
                           '/admin/bookings/' || b.id)
    from public.profiles a
    where a.role = 'admin';
    perform private.notify(b.customer_id, b.id, 'Your technician is running late',
                           'The PatchUp team is checking with ' || v_technician || '. ' || v_what || ' · ' || v_when,
                           '/bookings/' || b.id);

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
-- The admin dashboard also counts the jobs running late
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
    -- Jobs whose technician hasn't set off 30 minutes after the visit time.
    'late_jobs', (select count(*) from public.bookings b
                  where b.status = 'accepted' and now() >= private.late_at(b.scheduled_at, private.taken_at(b))),
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
