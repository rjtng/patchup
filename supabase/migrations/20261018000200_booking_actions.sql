-- Everything that changes a booking. The apps call these as RPCs, e.g.
--   supabase.rpc('accept_booking', { booking_id })
-- Each one locks the booking row first, so two people can't change the same
-- booking at once (for example, two technicians accepting the same job), then
-- checks who is calling and that the step is allowed from the current status.
--
--   Step                    Who                       From status
--   create_booking          customer                  -
--   accept_booking          technician                requested
--   decline_booking         assigned technician       requested, accepted, en_route   (back to requested, open to others)
--   assign_technician       admin                     requested
--   mark_en_route           assigned technician       accepted
--   mark_arrived            assigned technician       accepted, en_route
--   send_quote              assigned technician       arrived
--   respond_to_quote        customer                  quoted   (approve -> in_progress, decline -> arrived)
--   complete_booking        assigned technician       arrived (inspection only), in_progress
--   cancel_booking          customer                  requested, accepted, en_route
--                           admin                     any status before completed
--   submit_review           customer                  completed

-- ---------------------------------------------------------------------------
-- Private helpers (not callable through the API)
-- ---------------------------------------------------------------------------

-- Locks the booking for the rest of the transaction and returns it.
create function private.lock_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  return v_booking;
end;
$$;

create function private.require_status(p_booking public.bookings, variadic p_allowed public.booking_status[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not (p_booking.status = any (p_allowed)) then
    raise exception 'That step isn''t possible: the booking is %', replace(p_booking.status::text, '_', ' ');
  end if;
end;
$$;

create function private.require_assigned_technician(p_booking public.bookings)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_booking.technician_id is distinct from auth.uid() then
    raise exception 'Only the assigned technician can do that' using errcode = '42501';
  end if;
end;
$$;

create function private.require_customer(p_booking public.bookings)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_booking.customer_id is distinct from auth.uid() then
    raise exception 'Only the customer who booked can do that' using errcode = '42501';
  end if;
end;
$$;

-- Adds a step to the booking's timeline.
create function private.log_event(p_booking public.bookings, p_event text, p_note text default null)
returns void
language sql
set search_path = ''
as $$
  insert into public.booking_events (booking_id, actor_id, event, status, note)
  values (p_booking.id, auth.uid(), p_event, p_booking.status, p_note);
$$;

revoke execute on function
  private.lock_booking(uuid),
  private.require_status(public.bookings, public.booking_status[]),
  private.require_assigned_technician(public.bookings),
  private.require_customer(public.bookings),
  private.log_event(public.bookings, text, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer: book
-- ---------------------------------------------------------------------------

-- Books a repair at one of the customer's saved addresses. Pass technician_id
-- to request a specific technician; leave it out to let any available
-- technician in the category take the job (or an admin assign one).
create function public.create_booking(
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

  insert into public.bookings (
    customer_id, technician_id, category_id, appliance, brand, problem, scheduled_at,
    street, barangay, city, province, landmark, latitude, longitude, inspection_fee
  )
  values (
    auth.uid(), create_booking.technician_id, v_category.id,
    trim(create_booking.appliance), trim(coalesce(create_booking.brand, '')),
    trim(create_booking.problem), create_booking.scheduled_at,
    v_address.street, v_address.barangay, v_address.city, v_address.province,
    v_address.landmark, v_address.latitude, v_address.longitude, v_category.inspection_fee
  )
  returning * into v_booking;

  perform private.log_event(v_booking, 'created');
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Technician: take or give back a job
-- ---------------------------------------------------------------------------

create function public.accept_booking(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(accept_booking.booking_id);
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

  update public.bookings
  set status = 'accepted', technician_id = auth.uid()
  where id = v_booking.id
  returning * into v_booking;

  perform private.log_event(v_booking, 'accepted');
  return v_booking;
end;
$$;

-- Turns down a job the technician was asked for, or gives back one they took
-- before arriving. The booking goes back to the open pool.
create function public.decline_booking(booking_id uuid, reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(decline_booking.booking_id);
begin
  perform private.require_assigned_technician(v_booking);
  perform private.require_status(v_booking, 'requested', 'accepted', 'en_route');

  update public.bookings
  set status = 'requested', technician_id = null
  where id = v_booking.id
  returning * into v_booking;

  perform private.log_event(v_booking, 'declined', nullif(trim(decline_booking.reason), ''));
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: assign a technician by hand
-- ---------------------------------------------------------------------------

create function public.assign_technician(booking_id uuid, technician_id uuid)
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
  perform private.require_status(v_booking, 'requested');

  if not private.is_approved_technician(assign_technician.technician_id) then
    raise exception 'That technician isn''t approved';
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
-- Technician: on the way, arrived
-- ---------------------------------------------------------------------------

create function public.mark_en_route(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(mark_en_route.booking_id);
begin
  perform private.require_assigned_technician(v_booking);
  perform private.require_status(v_booking, 'accepted');

  update public.bookings set status = 'en_route' where id = v_booking.id returning * into v_booking;

  perform private.log_event(v_booking, 'en_route');
  return v_booking;
end;
$$;

create function public.mark_arrived(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(mark_arrived.booking_id);
begin
  perform private.require_assigned_technician(v_booking);
  perform private.require_status(v_booking, 'accepted', 'en_route');

  update public.bookings set status = 'arrived' where id = v_booking.id returning * into v_booking;

  perform private.log_event(v_booking, 'arrived');
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------

-- items: [{"description": "Replace compressor capacitor", "amount": 850}, ...]
create function public.send_quote(booking_id uuid, items jsonb, note text default '')
returns public.quotes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(send_quote.booking_id);
  v_item jsonb;
  v_amount numeric;
  v_items jsonb := '[]';
  v_total numeric := 0;
  v_quote public.quotes;
begin
  perform private.require_assigned_technician(v_booking);
  perform private.require_status(v_booking, 'arrived');

  if jsonb_typeof(send_quote.items) is distinct from 'array'
     or jsonb_array_length(send_quote.items) not between 1 and 30 then
    raise exception 'A quote needs between 1 and 30 items';
  end if;

  for v_item in select value from jsonb_array_elements(send_quote.items) loop
    if jsonb_typeof(v_item -> 'description') is distinct from 'string'
       or char_length(trim(v_item ->> 'description')) not between 1 and 200
       or jsonb_typeof(v_item -> 'amount') is distinct from 'number' then
      raise exception 'Each quote item needs a description and an amount';
    end if;
    v_amount := round((v_item ->> 'amount')::numeric, 2);
    if v_amount not between 0 and 1000000 then
      raise exception 'Each amount must be between 0 and 1,000,000';
    end if;
    v_items := v_items || jsonb_build_object('description', trim(v_item ->> 'description'), 'amount', v_amount);
    v_total := v_total + v_amount;
  end loop;

  insert into public.quotes (booking_id, technician_id, items, total, note)
  values (v_booking.id, auth.uid(), v_items, v_total, trim(coalesce(send_quote.note, '')))
  returning * into v_quote;

  update public.bookings set status = 'quoted' where id = v_booking.id returning * into v_booking;

  perform private.log_event(v_booking, 'quote_sent', 'Quote total: ' || to_char(v_total, 'FM999,999,990.00'));
  return v_quote;
end;
$$;

-- Approving starts the repair; declining sends the booking back to "arrived",
-- where the technician can send a new quote or finish with the inspection only.
create function public.respond_to_quote(quote_id uuid, approve boolean)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_booking public.bookings;
begin
  select * into v_quote from public.quotes q where q.id = respond_to_quote.quote_id;
  if not found then
    raise exception 'Quote not found' using errcode = 'P0002';
  end if;

  v_booking := private.lock_booking(v_quote.booking_id);
  perform private.require_customer(v_booking);

  -- Read again now that the booking is locked: it may have changed meanwhile.
  select * into v_quote from public.quotes q where q.id = respond_to_quote.quote_id;
  if v_quote.status <> 'pending' or v_booking.status <> 'quoted' then
    raise exception 'This quote has already been answered';
  end if;

  update public.quotes
  set status = case when respond_to_quote.approve then 'approved'::public.quote_status else 'declined' end,
      responded_at = now()
  where id = v_quote.id;

  update public.bookings
  set status = case when respond_to_quote.approve then 'in_progress'::public.booking_status else 'arrived' end
  where id = v_booking.id
  returning * into v_booking;

  perform private.log_event(
    v_booking,
    case when respond_to_quote.approve then 'quote_approved' else 'quote_declined' end
  );
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finish
-- ---------------------------------------------------------------------------

-- The amount due is the inspection fee plus the approved quote (if any).
create function public.complete_booking(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(complete_booking.booking_id);
begin
  perform private.require_assigned_technician(v_booking);
  perform private.require_status(v_booking, 'arrived', 'in_progress');

  update public.bookings b
  set status = 'completed',
      completed_at = now(),
      final_amount = b.inspection_fee + coalesce((
        select sum(q.total) from public.quotes q
        where q.booking_id = b.id and q.status = 'approved'
      ), 0)
  where b.id = v_booking.id
  returning * into v_booking;

  perform private.log_event(v_booking, 'completed');
  return v_booking;
end;
$$;

-- Customers can cancel until the technician arrives; after that (when the
-- inspection fee is due) only an admin can.
create function public.cancel_booking(booking_id uuid, reason text default null)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(cancel_booking.booking_id);
begin
  if private.is_admin() then
    perform private.require_status(v_booking, 'requested', 'accepted', 'en_route', 'arrived', 'quoted', 'in_progress');
  elsif v_booking.customer_id = auth.uid() then
    perform private.require_status(v_booking, 'requested', 'accepted', 'en_route');
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

  perform private.log_event(v_booking, 'cancelled', v_booking.cancel_reason);
  return v_booking;
end;
$$;

create function public.submit_review(booking_id uuid, rating integer, comment text default '')
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings := private.lock_booking(submit_review.booking_id);
  v_review public.reviews;
begin
  perform private.require_customer(v_booking);
  perform private.require_status(v_booking, 'completed');

  if submit_review.rating is null or submit_review.rating not between 1 and 5 then
    raise exception 'Rating must be from 1 to 5';
  end if;
  if exists (select 1 from public.reviews r where r.booking_id = v_booking.id) then
    raise exception 'You already reviewed this booking';
  end if;

  insert into public.reviews (booking_id, customer_id, technician_id, customer_name, rating, comment)
  select v_booking.id, v_booking.customer_id, v_booking.technician_id,
         split_part(trim(p.full_name), ' ', 1), submit_review.rating, trim(coalesce(submit_review.comment, ''))
  from public.profiles p
  where p.id = v_booking.customer_id
  returning * into v_review;

  return v_review;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: technician verification
-- ---------------------------------------------------------------------------

-- Approve a technician after checking their ID, NBI clearance and
-- certificates, or reject/suspend them (which also takes them offline).
create function public.set_technician_verification(technician_id uuid, status public.verification_status)
returns public.technician_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.technician_profiles;
begin
  if not private.is_admin() then
    raise exception 'Only admins can verify technicians' using errcode = '42501';
  end if;

  update public.technician_profiles t
  set verification_status = set_technician_verification.status,
      verified_at = case when set_technician_verification.status = 'approved' then now() else t.verified_at end,
      is_available = t.is_available and set_technician_verification.status = 'approved'
  where t.id = set_technician_verification.technician_id
  returning * into v_profile;

  if not found then
    raise exception 'Technician not found' using errcode = 'P0002';
  end if;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Only signed-in users may call these (each checks the caller's role itself).
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_booking(uuid, uuid, text, text, timestamptz, text, uuid),
  public.accept_booking(uuid),
  public.decline_booking(uuid, text),
  public.assign_technician(uuid, uuid),
  public.mark_en_route(uuid),
  public.mark_arrived(uuid),
  public.send_quote(uuid, jsonb, text),
  public.respond_to_quote(uuid, boolean),
  public.complete_booking(uuid),
  public.cancel_booking(uuid, text),
  public.submit_review(uuid, integer, text),
  public.set_technician_verification(uuid, public.verification_status)
from public, anon;

grant execute on function
  public.create_booking(uuid, uuid, text, text, timestamptz, text, uuid),
  public.accept_booking(uuid),
  public.decline_booking(uuid, text),
  public.assign_technician(uuid, uuid),
  public.mark_en_route(uuid),
  public.mark_arrived(uuid),
  public.send_quote(uuid, jsonb, text),
  public.respond_to_quote(uuid, boolean),
  public.complete_booking(uuid),
  public.cancel_booking(uuid, text),
  public.submit_review(uuid, integer, text),
  public.set_technician_verification(uuid, public.verification_status)
to authenticated;
