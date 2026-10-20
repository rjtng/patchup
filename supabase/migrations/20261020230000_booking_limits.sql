-- Limits on moving and cancelling visits, so technicians can plan their day.
--
-- Last minute means a technician has the job, and it's less than 2 hours to
-- the visit or they're already on the way. Changing one's mind in the first
-- 10 minutes after a technician took it (or its time last changed) doesn't
-- count.
--
-- Customers:
--   * once a technician has the visit (or was asked for), change its time at
--     most twice, while it's at least 2 hours away, to a time at least 2 hours
--     away;
--   * can still cancel until the technician arrives, but a last-minute
--     cancellation is marked (unless the technician is running late: the
--     visit time has passed). After 3 in 30 days they can't book new repairs
--     until the first of those is 30 days old, and they're told.
-- Technicians: giving back a job at the last minute is marked, and admins are
-- told at once, so they can find someone else.
-- Admins aren't limited, and what they do never counts.
--
--   last_minute_record(person)   last-minute cancellations and give-backs in the last 30 days, and
--                                until when booking is paused; for the person themselves and admins

-- ---------------------------------------------------------------------------
-- Marking what happened at the last minute
-- ---------------------------------------------------------------------------

alter table public.booking_events add column last_minute boolean not null default false;
comment on column public.booking_events.last_minute is
  'Cancelled (by the customer) or given back (by the technician) at the last minute; see private.is_last_minute';

-- Counting someone's (and the actor foreign key, which had no index).
create index booking_events_actor_id_idx on public.booking_events (actor_id, created_at);

-- Whether cancelling or giving back a job now is last-minute.
create function private.is_last_minute(p_booking public.bookings)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_booking.technician_id is not null
     and (p_booking.status = 'en_route'
          or (p_booking.status = 'accepted'
              and p_booking.scheduled_at < now() + interval '2 hours'
              and private.taken_at(p_booking) < now() - interval '10 minutes'));
$$;

-- Until when a customer can't book: with 3 last-minute cancellations in the
-- last 30 days, until the first of them is 30 days old. Null when they can.
create function private.booking_paused_until(p_customer uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select e.created_at + interval '30 days'
  from public.booking_events e
  where e.actor_id = p_customer and e.event = 'cancelled' and e.last_minute
    and e.created_at > now() - interval '30 days'
  order by e.created_at desc
  offset 2 limit 1;
$$;

create function public.last_minute_record(person uuid default null)
returns table (cancellations integer, give_backs integer, booking_paused_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person uuid := coalesce(last_minute_record.person, auth.uid());
begin
  if auth.uid() is null or (v_person <> auth.uid() and not private.is_admin()) then
    raise exception 'Only admins can see someone else''s record' using errcode = '42501';
  end if;
  return query
  select (count(*) filter (where e.event = 'cancelled'))::integer,
         (count(*) filter (where e.event = 'declined'))::integer,
         private.booking_paused_until(v_person)
  from public.booking_events e
  where e.actor_id = v_person and e.last_minute and e.created_at > now() - interval '30 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelling and giving back
-- ---------------------------------------------------------------------------

-- Customers can cancel until the technician arrives; after that (when the
-- inspection fee is due) only an admin can. A customer's last-minute
-- cancellation is marked.
create or replace function public.cancel_booking(booking_id uuid, reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(cancel_booking.booking_id);
  v_last_minute boolean := false;
begin
  if private.is_admin() then
    perform private.require_status(v_booking, 'requested', 'accepted', 'en_route', 'arrived', 'quoted', 'in_progress');
  elsif v_booking.customer_id = auth.uid() then
    perform private.require_status(v_booking, 'requested', 'accepted', 'en_route');
    -- Once the visit time has passed, the technician is the one running late.
    v_last_minute := private.is_last_minute(v_booking) and now() < v_booking.scheduled_at;
  else
    raise exception 'Only the customer who booked or an admin can cancel' using errcode = '42501';
  end if;

  update public.quotes q
  set status = 'declined', responded_at = now()
  where q.booking_id = v_booking.id and q.status = 'pending';

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = nullif(trim(cancel_booking.reason), '')
  where id = v_booking.id
  returning * into v_booking;

  insert into public.booking_events (booking_id, actor_id, event, status, note, last_minute)
  values (v_booking.id, auth.uid(), 'cancelled', v_booking.status, v_booking.cancel_reason, v_last_minute);
  return v_booking;
end;
$$;

-- Turns down a job the technician was asked for, or gives back one they took
-- before arriving. The booking goes back to the open pool. Giving one back at
-- the last minute is marked.
create or replace function public.decline_booking(booking_id uuid, reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(decline_booking.booking_id);
  v_last_minute boolean;
begin
  perform private.require_assigned_technician(v_booking);
  perform private.require_status(v_booking, 'requested', 'accepted', 'en_route');
  v_last_minute := private.is_last_minute(v_booking);

  update public.bookings
  set status = 'requested', technician_id = null
  where id = v_booking.id
  returning * into v_booking;

  insert into public.booking_events (booking_id, actor_id, event, status, note, last_minute)
  values (v_booking.id, auth.uid(), 'declined', v_booking.status, nullif(trim(decline_booking.reason), ''), v_last_minute);
  return v_booking;
end;
$$;

-- What happened at the last minute, told to whoever needs to act: admins
-- when a technician gives a job back (the usual notifications go too, see
-- notify_booking_event), and the customer whose booking that pauses.
create function private.notify_last_minute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_until timestamptz;
begin
  select * into b from public.bookings where id = new.booking_id;
  if new.event = 'declined' then
    perform private.notify(
      a.id, b.id, 'Job given back at the last minute',
      coalesce((select nullif(trim(p.full_name), '') from public.profiles p where p.id = new.actor_id), 'A technician')
        || ' gave back ' || (select c.name from public.service_categories c where c.id = b.category_id) || ': '
        || b.appliance || ' in ' || b.barangay || ', ' || b.city || ' · ' || private.visit_time(b.scheduled_at)
        || '. Find someone else soon.',
      '/admin/bookings/' || b.id
    )
    from public.profiles a
    where a.role = 'admin';
  elsif new.event = 'cancelled' then
    v_until := private.booking_paused_until(new.actor_id);
    if v_until is not null then
      perform private.notify(
        new.actor_id, b.id, 'Booking is paused',
        'You cancelled 3 visits at the last minute in 30 days, so you can book again from '
          || private.visit_time(v_until) || '.',
        '/home'
      );
    end if;
  end if;
  return null;
exception when others then
  -- Like other notifications, these must never stop the step itself.
  raise warning 'Last-minute notification for booking event % not written: %', new.id, sqlerrm;
  return null;
end;
$$;

create trigger booking_events_notify_last_minute
  after insert on public.booking_events
  for each row when (new.last_minute) execute function private.notify_last_minute();

-- ---------------------------------------------------------------------------
-- Moving a visit
-- ---------------------------------------------------------------------------

-- The customer (or an admin) moves a visit to another time, until the
-- technician sets off. A technician who has it, or was asked for, must be
-- free then, and is told; when an admin moves it, the customer is told.
-- Once a technician has it (or was asked for), a customer can move it at
-- most twice, while it's at least 2 hours away, to a time at least 2 hours
-- away.
create or replace function public.reschedule_booking(booking_id uuid, scheduled_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(reschedule_booking.booking_id);
  v_was timestamptz := v_booking.scheduled_at;
  v_by_customer boolean := coalesce(v_booking.customer_id = auth.uid(), false);
  v_technician text;
  v_who text;
  v_when text;
begin
  if not v_by_customer and not private.is_admin() then
    raise exception 'Only the customer can change the visit time' using errcode = '42501';
  end if;
  if v_booking.status not in ('requested', 'accepted') then
    raise exception 'The visit time can''t change once the technician is on the way';
  end if;
  if reschedule_booking.scheduled_at is null
     or reschedule_booking.scheduled_at <= now()
     or reschedule_booking.scheduled_at > now() + interval '90 days' then
    raise exception 'Pick a time within the next 90 days';
  end if;
  if reschedule_booking.scheduled_at = v_was then
    raise exception 'That''s already the visit time';
  end if;

  if v_by_customer and not private.is_admin() and v_booking.technician_id is not null then
    select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'your technician') into v_technician
    from public.profiles p where p.id = v_booking.technician_id;
    if v_was < now() + interval '2 hours' then
      raise exception 'The visit is less than 2 hours away, so its time can''t change now. Message % if something''s come up.',
        v_technician;
    end if;
    if (select count(*) from public.booking_events e
        where e.booking_id = v_booking.id and e.event = 'rescheduled' and e.actor_id = auth.uid()) >= 2 then
      raise exception 'You''ve already changed the time twice. If this time doesn''t work, cancel and book again.';
    end if;
    if reschedule_booking.scheduled_at < now() + interval '2 hours' then
      raise exception 'Pick a time at least 2 hours from now, so % can plan for it.', v_technician;
    end if;
  end if;

  if v_booking.technician_id is not null
     and private.claim_time(v_booking.technician_id, reschedule_booking.scheduled_at, v_booking.id) is not null then
    raise exception '% already has a job then. Pick another time.',
      (select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Your technician') from public.profiles p
       where p.id = v_booking.technician_id);
  end if;

  update public.bookings b
  set scheduled_at = reschedule_booking.scheduled_at
  where b.id = v_booking.id
  returning * into v_booking;

  -- The reminders go again, for the new time.
  delete from private.booking_reminders r where r.booking_id = v_booking.id;
  perform private.log_event(v_booking, 'rescheduled', 'Was ' || private.visit_time(v_was));

  v_when := private.visit_time(v_booking.scheduled_at);
  if v_booking.technician_id is not null then
    select case when v_by_customer then coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'The customer')
                else 'PatchUp' end
    into v_who
    from public.profiles p where p.id = v_booking.customer_id;
    perform private.notify(
      v_booking.technician_id, v_booking.id, 'Visit time changed',
      v_who || ' moved ' || v_booking.appliance || ' in ' || v_booking.barangay || ', ' || v_booking.city
        || ' to ' || v_when || ' (was ' || private.visit_time(v_was) || '). If you can''t make it, '
        || case when v_booking.status = 'requested' then 'turn it down.' else 'give the job back.' end,
      '/jobs/' || v_booking.id
    );
  end if;
  if not v_by_customer then
    perform private.notify(
      v_booking.customer_id, v_booking.id, 'PatchUp changed your visit time',
      (select c.name from public.service_categories c where c.id = v_booking.category_id) || ': '
        || v_booking.appliance || ' · now ' || v_when,
      '/bookings/' || v_booking.id
    );
  end if;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking: not while paused
-- ---------------------------------------------------------------------------

-- As in the reports migration, plus the pause after 3 last-minute cancellations.
create or replace function public.create_booking(
  category_id uuid,
  address_id uuid,
  appliance text,
  problem text,
  scheduled_at timestamptz,
  brand text default '',
  technician_id uuid default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.service_categories;
  v_address public.addresses;
  v_booking public.bookings;
  v_paused_until timestamptz;
begin
  if private.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts can book a repair' using errcode = '42501';
  end if;

  if exists (select 1 from public.account_suspensions s where s.user_id = auth.uid()) then
    raise exception 'Your account is suspended, so you can''t book new repairs. Write to PatchUp to sort it out.'
      using errcode = '42501';
  end if;

  v_paused_until := private.booking_paused_until(auth.uid());
  if v_paused_until is not null then
    raise exception 'You cancelled 3 visits at the last minute in the past 30 days, so you can book again from %.',
      private.visit_time(v_paused_until)
      using errcode = '42501';
  end if;

  select * into v_category from public.service_categories c
  where c.id = create_booking.category_id and c.is_active;
  if not found then
    raise exception 'Unknown service category';
  end if;

  select * into v_address from public.addresses a
  where a.id = create_booking.address_id and a.user_id = auth.uid();
  if not found then
    raise exception 'Unknown address';
  end if;

  if create_booking.scheduled_at is null
     or create_booking.scheduled_at <= now()
     or create_booking.scheduled_at > now() + interval '90 days' then
    raise exception 'Pick a time within the next 90 days';
  end if;

  if create_booking.technician_id is not null
     and not private.is_open_for_jobs(create_booking.technician_id, v_category.id) then
    raise exception 'That technician isn''t taking % bookings right now', lower(v_category.name);
  end if;

  if create_booking.technician_id is not null
     and private.claim_time(create_booking.technician_id, create_booking.scheduled_at) is not null then
    raise exception 'That technician already has a job then. Pick another time, or any available technician.';
  end if;

  -- One booking at a time per customer, so two made at once can't both be "first".
  perform 1 from public.profiles p where p.id = auth.uid() for update;

  insert into public.bookings (
    customer_id, technician_id, category_id, appliance, brand, problem, scheduled_at,
    street, barangay, city, province, landmark, latitude, longitude, inspection_fee, discount
  )
  values (
    auth.uid(), create_booking.technician_id, v_category.id,
    trim(create_booking.appliance), trim(coalesce(create_booking.brand, '')),
    trim(create_booking.problem), create_booking.scheduled_at,
    v_address.street, v_address.barangay, v_address.city, v_address.province,
    v_address.landmark, v_address.latitude, v_address.longitude, v_category.inspection_fee,
    public.first_booking_discount()
  )
  returning * into v_booking;

  perform private.log_event(v_booking, 'created');
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- A policy name Postgres cut at 63 characters in the reports migration
-- ---------------------------------------------------------------------------

alter policy "People read the reviews PatchUp hasn't hidden; their own and ad" on public.reviews
  rename to "Signed-in people read shown reviews; their own and admins all";

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  private.is_last_minute(public.bookings),
  private.booking_paused_until(uuid),
  private.notify_last_minute(),
  public.last_minute_record(uuid)
from public, anon;
revoke execute on function
  private.is_last_minute(public.bookings),
  private.booking_paused_until(uuid),
  private.notify_last_minute()
from authenticated;
grant execute on function public.last_minute_record(uuid) to authenticated;
