-- Paying technicians back for the first-booking offer. A customer's first
-- booking has the offer taken off what they pay, so the technician collects
-- that much less in cash; PatchUp pays it back. What's owed comes from the
-- completed jobs themselves (what the job came to, less what the customer
-- paid). Admins pay technicians outside the app (GCash, bank) and record it
-- here, and the technician is told.
--
--   paybacks(technician)                    each completed job's payback, paid or not
--                                           (admins: anyone's; technicians: their own)
--   record_payout(technician, amount, ...)  admins: mark what's owed to a technician as paid

-- ---------------------------------------------------------------------------
-- What a job's payback is
-- ---------------------------------------------------------------------------

-- What PatchUp owes the technician for a completed job: the first-booking
-- offer as it was taken off (never more than the job came to). Nothing for a
-- job without the offer, or not completed.
create function private.payback(p_booking public.bookings)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_booking.status = 'completed' and p_booking.final_amount is not null and p_booking.discount > 0 then
      greatest(least(
        p_booking.discount,
        p_booking.inspection_fee
          + coalesce((select sum(q.total) from public.quotes q where q.booking_id = p_booking.id and q.status = 'approved'), 0)
          - p_booking.final_amount
      ), 0)
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Payouts: what PatchUp paid a technician, and the jobs it covered
-- ---------------------------------------------------------------------------

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  -- The GCash or bank reference, if the admin gave one.
  reference text not null default '' check (char_length(reference) <= 100),
  paid_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz not null default now()
);
create index payouts_technician_id_idx on public.payouts (technician_id, paid_at desc);
create index payouts_paid_by_idx on public.payouts (paid_by);

-- Each job is paid back once.
create table public.payout_bookings (
  booking_id uuid primary key references public.bookings (id) on delete restrict,
  payout_id uuid not null references public.payouts (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0)
);
create index payout_bookings_payout_id_idx on public.payout_bookings (payout_id);

alter table public.payouts enable row level security;
alter table public.payout_bookings enable row level security;

-- Read only: payouts are recorded through record_payout.
revoke all on public.payouts, public.payout_bookings from anon, authenticated;
grant all on public.payouts, public.payout_bookings to service_role;
grant select on public.payouts, public.payout_bookings to authenticated;

create policy "Technicians see their payouts; admins see all"
  on public.payouts for select to authenticated
  using (technician_id = (select auth.uid()) or (select private.is_admin()));

create policy "Technicians see the jobs their payouts covered; admins see all"
  on public.payout_bookings for select to authenticated
  using (
    (select private.is_admin())
    or exists (select 1 from public.payouts p where p.id = payout_id and p.technician_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- For the app
-- ---------------------------------------------------------------------------

-- Each completed job with a payback, oldest first, with the payout that paid
-- it back (if any). Admins see everyone's, or one technician's; anyone else
-- sees only their own.
create function public.paybacks(technician uuid default null)
returns table (
  booking_id uuid,
  technician_id uuid,
  technician_name text,
  completed_at timestamptz,
  category text,
  appliance text,
  amount numeric,
  payout_id uuid,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.technician_id, coalesce(nullif(trim(p.full_name), ''), 'No name yet'), b.completed_at, c.name,
         b.appliance, private.payback(b), pb.payout_id, po.paid_at
  from public.bookings b
  join public.service_categories c on c.id = b.category_id
  left join public.profiles p on p.id = b.technician_id
  left join public.payout_bookings pb on pb.booking_id = b.id
  left join public.payouts po on po.id = pb.payout_id
  where b.status = 'completed'
    and private.payback(b) > 0
    and b.technician_id = case
      when (select private.is_admin()) then coalesce(paybacks.technician, b.technician_id)
      else (select auth.uid())
    end
  order by b.completed_at, b.id;
$$;

-- Records that an admin paid a technician everything owed to them (`amount`,
-- as the admin saw it: if more jobs were done since, they're told to check
-- again). The technician is told.
create function public.record_payout(technician uuid, amount numeric, reference text default '')
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owed numeric;
  v_jobs integer;
  v_reference text := left(trim(coalesce(record_payout.reference, '')), 100);
  v_payout public.payouts;
begin
  if not private.is_admin() then
    raise exception 'Only admins can record payouts' using errcode = '42501';
  end if;

  -- One payout at a time for each technician, so no job is paid twice.
  perform 1 from public.profiles p where p.id = record_payout.technician for update;
  if not found then
    raise exception 'Technician not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(private.payback(b)), 0), count(*) into v_owed, v_jobs
  from public.bookings b
  where b.technician_id = record_payout.technician
    and b.status = 'completed'
    and private.payback(b) > 0
    and not exists (select 1 from public.payout_bookings pb where pb.booking_id = b.id);

  if v_jobs = 0 then
    raise exception 'Nothing is owed to this technician';
  end if;
  if v_owed <> record_payout.amount then
    raise exception 'They''re now owed %. Check it and try again.', private.peso(v_owed);
  end if;

  insert into public.payouts (technician_id, amount, reference, paid_by)
  values (record_payout.technician, v_owed, v_reference, auth.uid())
  returning * into v_payout;

  insert into public.payout_bookings (booking_id, payout_id, amount)
  select b.id, v_payout.id, private.payback(b)
  from public.bookings b
  where b.technician_id = record_payout.technician
    and b.status = 'completed'
    and private.payback(b) > 0
    and not exists (select 1 from public.payout_bookings pb where pb.booking_id = b.id);

  perform private.notify(record_payout.technician, null, 'PatchUp paid you ' || private.peso(v_owed),
                         'For the first-booking offer on ' || case v_jobs when 1 then '1 job' else v_jobs || ' jobs' end
                         || coalesce('. Reference: ' || nullif(v_reference, ''), '') || '.',
                         '/profile/earnings');
  return v_payout;
end;
$$;

revoke execute on function private.payback(public.bookings) from public, anon, authenticated;
revoke execute on function
  public.paybacks(uuid),
  public.record_payout(uuid, numeric, text)
from public, anon;
grant execute on function
  public.paybacks(uuid),
  public.record_payout(uuid, numeric, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- The admin dashboard also counts what's owed
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
    -- First-booking offers not yet paid back, and to how many technicians.
    'payback_owed', (select coalesce(sum(private.payback(b)), 0) from public.bookings b
                     where b.status = 'completed'
                       and not exists (select 1 from public.payout_bookings pb where pb.booking_id = b.id)),
    'payback_technicians', (select count(distinct b.technician_id) from public.bookings b
                            where b.status = 'completed' and private.payback(b) > 0
                              and not exists (select 1 from public.payout_bookings pb where pb.booking_id = b.id)),
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
