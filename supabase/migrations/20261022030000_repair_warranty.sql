-- Repair warranty. A repair (a job done after the customer approved a quote)
-- has a 30-day warranty: if the problem comes back within 30 days of the job
-- being done, the customer asks for a return visit from the booking. That's a
-- new booking for the same item at the same address, with no inspection fee,
-- for the technician who did the repair. They fix the same problem at no
-- charge for the work; new parts, if it needs them, are quoted as usual and
-- the customer decides.
--
-- A return visit never goes to other technicians by itself: if the technician
-- who did the repair turns it down, doesn't answer in time, or can't take jobs
-- any more, admins are told and give it to someone. A repair gets one return
-- visit (another can be asked for only if it was cancelled), and a return
-- visit doesn't come with a warranty of its own. A suspended account can't
-- ask for one; a booking pause (after last-minute cancellations) doesn't stop
-- it, as it's part of a repair already paid for.
--
--   request_return_visit(booking_id, problem, scheduled_at)   the customer asks for a return visit
--   return_visit_counts(technician)                           repairs, and how many had a return visit

-- ---------------------------------------------------------------------------
-- Return visits
-- ---------------------------------------------------------------------------

-- The repair a booking is a return visit for.
alter table public.bookings
  add column return_of uuid references public.bookings (id) on delete restrict,
  add constraint bookings_return_of_check check (return_of is distinct from id);

-- One return visit per repair, unless it was cancelled. (It covers the foreign key too.)
create unique index bookings_one_return_visit on public.bookings (return_of) where status <> 'cancelled';

-- Until when a booking's warranty runs: 30 days after a repair is done. Null
-- for anything else (not done, inspection only, or a return visit itself).
create function private.warranty_until(p_booking public.bookings)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_booking.completed_at + interval '30 days'
  where p_booking.status = 'completed'
    and p_booking.completed_at is not null
    and p_booking.return_of is null
    and exists (select 1 from public.quotes q where q.booking_id = p_booking.id and q.status = 'approved');
$$;

-- The customer asks for a return visit for a repair, saying what's wrong now
-- and when to come. It goes to the technician who did the repair (who must
-- be working and free then), or, if they can't take jobs any more, to admins.
create function public.request_return_visit(booking_id uuid, problem text, scheduled_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Locked, so the same repair can't get two return visits at once.
  v_repair public.bookings := private.lock_booking(request_return_visit.booking_id);
  v_until timestamptz := private.warranty_until(v_repair);
  v_problem text := trim(coalesce(request_return_visit.problem, ''));
  v_technician uuid;
  v_name text;
  v_booking public.bookings;
begin
  perform private.require_customer(v_repair);

  if exists (select 1 from public.account_suspensions s where s.user_id = auth.uid()) then
    raise exception 'Your account is suspended, so you can''t book new repairs. Write to PatchUp to sort it out.'
      using errcode = '42501';
  end if;

  if v_repair.return_of is not null then
    raise exception 'This was a return visit already. If the problem is still there, report a problem and PatchUp will help.';
  end if;
  if v_repair.status <> 'completed' then
    raise exception 'You can ask for a return visit once the repair is done';
  end if;
  if v_until is null then
    raise exception 'The warranty covers repairs, and this visit was an inspection only';
  end if;
  if now() >= v_until then
    raise exception 'The 30-day warranty on this repair ended on %',
      to_char(v_until at time zone 'Asia/Manila', 'Mon FMDD, YYYY');
  end if;
  if exists (select 1 from public.bookings r where r.return_of = v_repair.id and r.status <> 'cancelled') then
    raise exception 'You''ve already asked for a return visit for this repair';
  end if;

  if char_length(v_problem) not between 1 and 2000 then
    raise exception 'Say what''s wrong now, in up to 2,000 characters';
  end if;
  if request_return_visit.scheduled_at is null
     or request_return_visit.scheduled_at <= now()
     or request_return_visit.scheduled_at > now() + interval '90 days' then
    raise exception 'Pick a time within the next 90 days';
  end if;

  if private.is_approved_technician(v_repair.technician_id) then
    v_technician := v_repair.technician_id;
    select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Your technician') into v_name
    from public.profiles p where p.id = v_technician;
    if not private.works_at(v_technician, request_return_visit.scheduled_at) then
      raise exception 'That''s outside %''s working hours. Pick another time.', v_name;
    end if;
    if private.claim_time(v_technician, request_return_visit.scheduled_at) is not null then
      raise exception '% already has a job then. Pick another time.', v_name;
    end if;
  end if;

  insert into public.bookings (
    customer_id, technician_id, category_id, appliance, brand, problem, scheduled_at,
    street, barangay, city, province, landmark, latitude, longitude, inspection_fee, discount, return_of
  )
  values (
    v_repair.customer_id, v_technician, v_repair.category_id, v_repair.appliance, v_repair.brand, v_problem,
    request_return_visit.scheduled_at, v_repair.street, v_repair.barangay, v_repair.city, v_repair.province,
    v_repair.landmark, v_repair.latitude, v_repair.longitude, 0, 0, v_repair.id
  )
  returning * into v_booking;

  perform private.log_event(v_booking, 'created');
  return v_booking;
end;
$$;

-- For admins, how a technician's repairs hold up: their repairs (jobs done
-- with an approved quote, not counting return visits), and how many had a
-- return visit asked for (not counting cancelled ones). Admins see anyone's,
-- or one technician's; anyone else sees only their own.
create function public.return_visit_counts(technician uuid default null)
returns table (technician_id uuid, repairs integer, return_visits integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.technician_id, count(*)::integer, count(r.id)::integer
  from public.bookings b
  -- At most one return visit that wasn't cancelled for each repair.
  left join public.bookings r on r.return_of = b.id and r.status <> 'cancelled'
  where b.status = 'completed'
    and b.return_of is null
    and exists (select 1 from public.quotes q where q.booking_id = b.id and q.status = 'approved')
    and b.technician_id = case
      when (select private.is_admin()) then coalesce(return_visit_counts.technician, b.technician_id)
      else (select auth.uid())
    end
  group by b.technician_id;
$$;

-- ---------------------------------------------------------------------------
-- Return visits aren't open requests
-- ---------------------------------------------------------------------------

-- As in the access rules migration, leaving out return visits: only the
-- technician one is for (and admins) see it.
drop policy "Available technicians see open requests in their categories" on public.bookings;
create policy "Available technicians see open requests in their categories"
  on public.bookings for select to authenticated
  using (
    status = 'requested'
    and technician_id is null
    and return_of is null
    and private.is_open_for_jobs((select auth.uid()), category_id)
  );

-- As in the scheduling migration, but a return visit nobody has is for admins
-- to give to someone, not for technicians to take.
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
     or (v_booking.technician_id is not null and v_booking.technician_id <> auth.uid())
     or (v_booking.technician_id is null and v_booking.return_of is not null) then
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

-- As in the live updates migration, but return visits aren't open requests,
-- so the technicians in the category don't hear about them.
create or replace function private.booking_topics(p_new public.bookings, p_old public.bookings)
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
    case when (p_new.status = 'requested' and p_new.technician_id is null and p_new.return_of is null)
           or (p_old.status = 'requested' and p_old.technician_id is null and p_old.return_of is null)
      then 'requests:' || p_new.category_id end
  ], null);
$$;

-- ---------------------------------------------------------------------------
-- Who hears
-- ---------------------------------------------------------------------------

-- As in the working hours migration, plus: a return visit goes to the
-- technician who did the repair, or else to admins (never to the others), and
-- says it's under warranty; and a job that comes to nothing says so.
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
  v_return boolean;  -- a return visit under warranty
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
  v_return := b.return_of is not null;

  case new.event
  when 'created', 'declined' then
    if v_return and b.technician_id is not null then
      -- Asked of the technician who did the repair.
      perform private.notify(b.technician_id, b.id, 'Return visit for you',
                             v_customer || ' says your repair needs another look: ' || b.appliance || ' in ' || v_area
                             || ' · ' || v_when || '. It''s under warranty: no inspection fee.',
                             '/jobs/' || b.id);
    elsif v_return then
      -- Turned down, or its technician can't take jobs any more: admins give it to someone.
      perform private.notify(a.id, b.id, 'Return visit needs a technician',
                             v_what || ' in ' || v_area || ' · ' || v_when || '. '
                             || case when new.event = 'declined'
                                  then coalesce((select nullif(trim(p.full_name), '') from public.profiles p
                                                 where p.id = new.actor_id), 'The technician') || ' turned it down'
                                  else 'The technician who did the repair can''t take jobs now' end
                             || '. Give it to someone, or it''s cancelled at the visit time.',
                             '/admin/bookings/' || b.id)
      from public.profiles a
      where a.role = 'admin';
    elsif b.technician_id is null then
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
                             case when v_return
                               then 'Your technician can''t make it, so the PatchUp team is finding someone for your return visit. '
                               else 'Your technician can''t make it, so your request went to other '
                                    || lower(v_category) || ' technicians. '
                             end || v_what,
                             '/bookings/' || b.id);
    end if;

  when 'overdue' then
    perform private.notify(a.id, b.id, 'No technician yet',
                           v_what || ' in ' || v_area || ' · ' || v_when
                           || '. Assign someone, or it''s cancelled at the visit time.',
                           '/admin/bookings/' || b.id)
    from public.profiles a
    where a.role = 'admin';
    if not v_return then
      perform private.notify(t.id, b.id, 'Still open: ' || lower(v_category) || ' request',
                             b.appliance || ' in ' || v_area || ' · ' || v_when || '. Nobody has taken it yet.',
                             '/jobs/' || b.id)
      from public.technician_profiles t
      where private.is_open_for_jobs(t.id, b.category_id) and private.works_at(t.id, b.scheduled_at);
    end if;
    perform private.notify(b.customer_id, b.id, 'Still finding you a technician',
                           'It''s taking longer than usual, so the PatchUp team is helping. ' || v_what || ' · ' || v_when,
                           '/bookings/' || b.id);

  when 'accepted' then
    perform private.notify(b.customer_id, b.id,
                           v_technician || case when v_return then ' accepted your return visit' else ' accepted your booking' end,
                           v_what || ' · ' || v_when, '/bookings/' || b.id);

  when 'assigned' then
    perform private.notify(b.customer_id, b.id,
                           v_technician || case when v_return then ' will do your return visit' else ' will do your repair' end,
                           v_what || ' · ' || v_when, '/bookings/' || b.id);
    perform private.notify(b.technician_id, b.id, case when v_return then 'Return visit for you' else 'New job for you' end,
                           b.appliance || ' in ' || v_area || ' · ' || v_when
                           || case when v_return then '. It''s under warranty: no inspection fee.' else '' end,
                           '/jobs/' || b.id);

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
                           case when b.final_amount = 0 then 'Nothing to pay. '
                                else 'Total: ' || private.peso(b.final_amount) || ', paid in cash. ' end
                           || 'How did it go? Tap to rate ' || v_technician || '.',
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
                           || ', so we cancelled it. Tap to '
                           || case when v_return then 'ask for another time.' else 'book another time.' end,
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
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function private.warranty_until(public.bookings) from public, anon, authenticated;
revoke execute on function
  public.request_return_visit(uuid, text, timestamptz),
  public.return_visit_counts(uuid)
from public, anon;
grant execute on function
  public.request_return_visit(uuid, text, timestamptz),
  public.return_visit_counts(uuid)
to authenticated;
