-- Double bookings and rescheduling. A technician's taken jobs (until they're
-- done or cancelled) hold their time: nobody can give them another job within
-- two hours of one, whether by accepting it, an admin assigning it, a
-- customer asking for them, or moving a visit. Customers (and admins) can
-- move a visit to another time until the technician sets off; the technician
-- is told, and the reminders go again for the new time.
--
--   busy_times(technician, except_booking)         when a technician is taken, for picking a time
--   reschedule_booking(booking_id, scheduled_at)   move a visit

alter table public.booking_events drop constraint booking_events_event_check;
alter table public.booking_events add constraint booking_events_event_check check (event in (
  'created', 'accepted', 'declined', 'assigned', 'en_route', 'arrived',
  'quote_sent', 'quote_approved', 'quote_declined', 'completed', 'cancelled',
  'overdue', 'expired', 'late', 'unassigned',
  'rescheduled' -- the visit moved to another time (the note says from when)
));

-- ---------------------------------------------------------------------------
-- A technician's time
-- ---------------------------------------------------------------------------

-- The jobs that hold their technician's time: taken, and not done or cancelled.
create function private.holds_time(p_status public.booking_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('accepted', 'en_route', 'arrived', 'quoted', 'in_progress');
$$;

-- Locks the technician (so two jobs can't be given the same time at once)
-- and returns the time of another of their jobs within two hours of p_at, or
-- null if they're free then.
create function private.claim_time(p_technician uuid, p_at timestamptz, p_except uuid default null)
returns timestamptz
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.technician_profiles t where t.id = p_technician for update;
  return (
    select b.scheduled_at
    from public.bookings b
    where b.technician_id = p_technician
      and b.id is distinct from p_except
      and private.holds_time(b.status)
      and b.scheduled_at > p_at - interval '2 hours'
      and b.scheduled_at < p_at + interval '2 hours'
    order by abs(extract(epoch from b.scheduled_at - p_at))
    limit 1
  );
end;
$$;

-- When an approved technician is taken (each job's visit time) from two hours
-- ago to 90 days ahead, leaving out one booking (the one being moved).
-- Nothing about the jobs themselves.
create function public.busy_times(technician uuid, except_booking uuid default null)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select b.scheduled_at
  from public.bookings b
  where b.technician_id = busy_times.technician
    and b.id is distinct from busy_times.except_booking
    and private.holds_time(b.status)
    and b.scheduled_at > now() - interval '2 hours'
    and b.scheduled_at < now() + interval '91 days'
    and private.is_approved_technician(busy_times.technician)
  order by 1;
$$;

-- A reschedule starts the visit's follow-up afresh (see follow_up_visits):
-- "late" counts from the new time.
create or replace function private.taken_at(p_booking public.bookings)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(max(e.created_at), p_booking.created_at)
  from public.booking_events e
  where e.booking_id = p_booking.id and e.event in ('accepted', 'assigned', 'rescheduled');
$$;

-- ---------------------------------------------------------------------------
-- Taking a job, giving one, asking for a technician: only when they're free
-- ---------------------------------------------------------------------------

create or replace function public.accept_booking(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(accept_booking.booking_id);
  v_clash timestamptz;
begin
  if not private.is_approved_technician(auth.uid()) then
    raise exception 'Only approved technicians can take jobs' using errcode = '42501';
  end if;

  if v_booking.status <> 'requested'
     or (v_booking.technician_id is not null and v_booking.technician_id <> auth.uid()) then
    raise exception 'This booking is no longer available';
  end if;

  if v_booking.technician_id is null and not private.is_open_for_jobs(auth.uid(), v_booking.category_id) then
    raise exception 'You can''t take this job: check your availability and services' using errcode = '42501';
  end if;

  v_clash := private.claim_time(auth.uid(), v_booking.scheduled_at, v_booking.id);
  if v_clash is not null then
    raise exception 'You already have a job then (%).', private.visit_time(v_clash);
  end if;

  update public.bookings
  set status = 'accepted', technician_id = auth.uid()
  where id = v_booking.id
  returning * into v_booking;

  perform private.log_event(v_booking, 'accepted');
  return v_booking;
end;
$$;

create or replace function public.assign_technician(booking_id uuid, technician_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_clash timestamptz;
begin
  if not private.is_admin() then
    raise exception 'Only admins can assign technicians' using errcode = '42501';
  end if;

  v_booking := private.lock_booking(assign_technician.booking_id);
  perform private.require_status(v_booking, 'requested', 'accepted');

  if not private.is_approved_technician(assign_technician.technician_id) then
    raise exception 'That technician isn''t approved';
  end if;

  if v_booking.status = 'accepted' and v_booking.technician_id = assign_technician.technician_id then
    raise exception 'That technician already has this job';
  end if;

  v_clash := private.claim_time(assign_technician.technician_id, v_booking.scheduled_at, v_booking.id);
  if v_clash is not null then
    raise exception '% already has a job then (%).',
      (select coalesce(nullif(trim(p.full_name), ''), 'That technician') from public.profiles p
       where p.id = assign_technician.technician_id),
      private.visit_time(v_clash);
  end if;

  if v_booking.status = 'accepted' then
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

-- As before (see 20261019200000_first_booking_offer.sql), and a technician
-- asked for must be free then.
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
begin
  if private.current_user_role() is distinct from 'customer' then
    raise exception 'Only customer accounts can book a repair' using errcode = '42501';
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
-- Moving a visit
-- ---------------------------------------------------------------------------

-- The customer (or an admin) moves a visit to another time, until the
-- technician sets off. A technician who has it, or was asked for, must be
-- free then, and is told; when an admin moves it, the customer is told.
create function public.reschedule_booking(booking_id uuid, scheduled_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(reschedule_booking.booking_id);
  v_was timestamptz := v_booking.scheduled_at;
  v_by_customer boolean := coalesce(v_booking.customer_id = auth.uid(), false);
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

revoke execute on function
  private.holds_time(public.booking_status),
  private.claim_time(uuid, timestamptz, uuid),
  public.busy_times(uuid, uuid),
  public.reschedule_booking(uuid, timestamptz)
from public, anon;
revoke execute on function
  private.holds_time(public.booking_status),
  private.claim_time(uuid, timestamptz, uuid)
from authenticated;
grant execute on function
  public.busy_times(uuid, uuid),
  public.reschedule_booking(uuid, timestamptz)
to authenticated;
