-- The first-booking offer: a customer's first booking (not counting ones they
-- cancelled) has an amount taken off what they pay after the visit, ₱100 to
-- start. Home shows the offer to customers who haven't booked yet.
--
-- The amount is in first_booking_offer: change it there, or set it to 0 to end
-- the offer. Bookings already made keep the discount they were made with.

create table public.first_booking_offer (
  id boolean primary key default true check (id), -- just the one row
  amount numeric(10, 2) not null default 100 check (amount >= 0 and amount <= 100000),
  updated_at timestamptz not null default now()
);
insert into public.first_booking_offer default values;

create trigger first_booking_offer_updated_at
  before update on public.first_booking_offer
  for each row execute function private.set_updated_at();

revoke all on public.first_booking_offer from anon, authenticated;
grant select on public.first_booking_offer to anon, authenticated;
grant update (amount) on public.first_booking_offer to authenticated;
alter table public.first_booking_offer enable row level security;

create policy "Anyone can see the offer"
  on public.first_booking_offer for select to anon, authenticated
  using (true);

create policy "Admins change the offer"
  on public.first_booking_offer for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- What's taken off a booking's total (its first-booking offer, if it had one).
alter table public.bookings
  add column discount numeric(10, 2) not null default 0 check (discount >= 0);

-- The discount the signed-in person's next booking gets: the offer, for a
-- customer with no bookings (other than cancelled ones); otherwise nothing.
create function public.first_booking_discount()
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer')
     and not exists (select 1 from public.bookings b where b.customer_id = auth.uid() and b.status <> 'cancelled')
    then coalesce((select o.amount from public.first_booking_offer o), 0)
    else 0
  end;
$$;

revoke execute on function public.first_booking_discount() from public;
grant execute on function public.first_booking_discount() to authenticated;

-- Booking now records the discount (see 20261018082239_booking_actions.sql).
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

-- The amount due is the inspection fee plus the approved quote (if any), less
-- the booking's discount (never below zero).
create or replace function public.complete_booking(booking_id uuid)
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
      final_amount = greatest(b.inspection_fee + coalesce((
        select sum(q.total) from public.quotes q
        where q.booking_id = b.id and q.status = 'approved'
      ), 0) - b.discount, 0)
  where b.id = v_booking.id
  returning * into v_booking;

  perform private.log_event(v_booking, 'completed');
  return v_booking;
end;
$$;
