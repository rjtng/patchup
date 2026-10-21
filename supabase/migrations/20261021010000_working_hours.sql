-- Technicians' working hours: the days they work, and their first and last
-- visit time on each. Customers asking for a technician can only pick a time
-- within their hours (and move a visit only to one), and requests for any
-- technician go only to those working then. Technicians can still take any
-- open request themselves, and admins aren't limited. A technician who hasn't
-- set hours works any time.
--
--   set_working_hours(days)   a technician sets their week: [{"weekday": 1, "first_visit": "08:00", "last_visit": "17:00"}, ...]

-- ---------------------------------------------------------------------------
-- Working hours
-- ---------------------------------------------------------------------------

create table public.technician_hours (
  technician_id uuid not null references public.technician_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 Monday … 7 Sunday
  first_visit time not null,
  last_visit time not null,
  primary key (technician_id, weekday),
  check (first_visit <= last_visit)
);

alter table public.technician_hours enable row level security;

-- Read only: technicians set theirs through set_working_hours.
revoke all on public.technician_hours from anon, authenticated;
grant all on public.technician_hours to service_role;
grant select on public.technician_hours to anon, authenticated;

-- Shown with an approved technician's profile, like their services.
create policy "Visitors see approved technicians' hours"
  on public.technician_hours for select to anon
  using (exists (
    select 1 from public.technician_profiles t
    where t.id = technician_id and t.verification_status = 'approved'
  ));
create policy "People see approved technicians' hours; own and admins all"
  on public.technician_hours for select to authenticated
  using (
    exists (
      select 1 from public.technician_profiles t
      where t.id = technician_id and t.verification_status = 'approved'
    )
    or technician_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Whether a technician works at a time (Manila): on that weekday, between
-- their first and last visit. Any time, until they set their hours.
create function private.works_at(p_technician uuid, p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (select 1 from public.technician_hours h where h.technician_id = p_technician)
      or exists (
        select 1 from public.technician_hours h
        where h.technician_id = p_technician
          and h.weekday = extract(isodow from p_at at time zone 'Asia/Manila')
          and (p_at at time zone 'Asia/Manila')::time between h.first_visit and h.last_visit
      );
$$;

-- A technician sets their week: one entry per day they work. It replaces
-- what they had. To stop new jobs for a while, they turn off "Taking new jobs".
create function public.set_working_hours(days jsonb)
returns setof public.technician_hours
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.technician_profiles t where t.id = auth.uid()) then
    raise exception 'Only technicians set working hours' using errcode = '42501';
  end if;
  if jsonb_typeof(set_working_hours.days) is distinct from 'array' or jsonb_array_length(set_working_hours.days) = 0 then
    raise exception 'Pick at least one day. To stop new jobs for a while, turn off Taking new jobs.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(set_working_hours.days) d
    where (d->>'weekday')::smallint is null or (d->>'weekday')::smallint not between 1 and 7
       or (d->>'first_visit')::time is null or (d->>'last_visit')::time is null
  ) then
    raise exception 'Each day needs a weekday and its first and last visit times';
  end if;
  if exists (
    select 1 from jsonb_array_elements(set_working_hours.days) d
    where (d->>'first_visit')::time > (d->>'last_visit')::time
  ) then
    raise exception 'A day''s last visit can''t be before its first';
  end if;
  if (select count(distinct d->>'weekday') from jsonb_array_elements(set_working_hours.days) d)
     <> jsonb_array_length(set_working_hours.days) then
    raise exception 'Give each day once';
  end if;

  delete from public.technician_hours h where h.technician_id = auth.uid();
  insert into public.technician_hours (technician_id, weekday, first_visit, last_visit)
  select auth.uid(), (d->>'weekday')::smallint, (d->>'first_visit')::time, (d->>'last_visit')::time
  from jsonb_array_elements(set_working_hours.days) d;

  return query
  select * from public.technician_hours h where h.technician_id = auth.uid() order by h.weekday;
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests go to the technicians working then
-- ---------------------------------------------------------------------------

-- As in the visit reminders migration, but a request for any technician (new,
-- given back or overdue) goes only to those working at its visit time.
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
      where t.id is distinct from new.actor_id and private.is_open_for_jobs(t.id, b.category_id)
        and private.works_at(t.id, b.scheduled_at);
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
    where private.is_open_for_jobs(t.id, b.category_id) and private.works_at(t.id, b.scheduled_at);
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
-- Booking and moving a visit: within the technician's hours
-- ---------------------------------------------------------------------------

-- As in the booking limits migration, plus: asking for a technician, at a time they work.
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
     and not private.works_at(create_booking.technician_id, create_booking.scheduled_at) then
    raise exception 'That''s outside the technician''s working hours. Pick another time, or any available technician.';
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

-- As in the booking limits migration, plus: a customer moves a visit a
-- technician has (or was asked for) only to a time they work.
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
    if not private.works_at(v_booking.technician_id, reschedule_booking.scheduled_at) then
      raise exception 'That''s outside %''s working hours. Pick another time.', v_technician;
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
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  private.works_at(uuid, timestamptz),
  public.set_working_hours(jsonb)
from public, anon;
revoke execute on function private.works_at(uuid, timestamptz) from authenticated;
grant execute on function public.set_working_hours(jsonb) to authenticated;
