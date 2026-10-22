-- Technicians' time off: whole days (Manila dates) they don't work, on top of
-- their weekly hours, such as a holiday or a sick day. It counts wherever
-- working hours do (see private.works_at): customers asking for them can't
-- pick those days, nor move a visit onto one, and requests for any technician
-- don't reach them then. Technicians can't take time off over a job they
-- have; they give it back first.
--
--   add_time_off(starts_on, ends_on)   a technician takes days off (first and last, inclusive)
--   remove_time_off(time_off_id)       and takes them back

-- ---------------------------------------------------------------------------
-- Time off
-- ---------------------------------------------------------------------------

create table public.technician_time_off (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technician_profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (ends_on - starts_on < 60)
);
create index technician_time_off_technician_id_idx on public.technician_time_off (technician_id, ends_on);

alter table public.technician_time_off enable row level security;

-- Read only: technicians add and remove theirs through the functions below.
-- Not for visitors: it says when someone is away.
revoke all on public.technician_time_off from anon, authenticated;
grant all on public.technician_time_off to service_role;
grant select on public.technician_time_off to authenticated;

-- Signed-in people see an approved technician's coming days off (booking
-- them can't pick those days); technicians all of theirs, admins everyone's.
create policy "Approved technicians' coming time off; their own; admins all"
  on public.technician_time_off for select to authenticated
  using (
    (ends_on >= (now() at time zone 'Asia/Manila')::date
     and exists (
       select 1 from public.technician_profiles t
       where t.id = technician_id and t.verification_status = 'approved'
     ))
    or technician_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Whether a technician works at a time (Manila): on that weekday, between
-- their first and last visit (any time, until they set their hours), and not
-- on a day off.
create or replace function private.works_at(p_technician uuid, p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (
      not exists (select 1 from public.technician_hours h where h.technician_id = p_technician)
      or exists (
        select 1 from public.technician_hours h
        where h.technician_id = p_technician
          and h.weekday = extract(isodow from p_at at time zone 'Asia/Manila')
          and (p_at at time zone 'Asia/Manila')::time between h.first_visit and h.last_visit
      )
    )
    and not exists (
      select 1 from public.technician_time_off o
      where o.technician_id = p_technician
        and (p_at at time zone 'Asia/Manila')::date between o.starts_on and o.ends_on
    );
$$;

-- A technician takes days off: from today on, within the next year, up to 60
-- days at a time, not overlapping time off they already have, and not over a
-- job they have (they give it back first).
create function public.add_time_off(starts_on date, ends_on date)
returns public.technician_time_off
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_job record;
  v_time_off public.technician_time_off;
begin
  -- One at a time per technician, and not while they're taking a job (see private.claim_time).
  perform 1 from public.technician_profiles t where t.id = auth.uid() for update;
  if not found then
    raise exception 'Only technicians take time off' using errcode = '42501';
  end if;
  if add_time_off.starts_on is null or add_time_off.ends_on is null or add_time_off.starts_on > add_time_off.ends_on then
    raise exception 'Pick your first and last day off, in that order';
  end if;
  if add_time_off.starts_on < v_today then
    raise exception 'Time off can''t start in the past';
  end if;
  if add_time_off.ends_on > v_today + 365 then
    raise exception 'Pick days within the next year';
  end if;
  if add_time_off.ends_on - add_time_off.starts_on >= 60 then
    raise exception 'Take up to 60 days at a time. To stop new jobs for longer, turn off Taking new jobs.';
  end if;
  if exists (
    select 1 from public.technician_time_off o
    where o.technician_id = auth.uid()
      and o.starts_on <= add_time_off.ends_on and o.ends_on >= add_time_off.starts_on
  ) then
    raise exception 'You''re already off on some of those days';
  end if;

  select b.appliance, b.scheduled_at into v_job
  from public.bookings b
  where b.technician_id = auth.uid() and private.holds_time(b.status)
    and (b.scheduled_at at time zone 'Asia/Manila')::date between add_time_off.starts_on and add_time_off.ends_on
  order by b.scheduled_at
  limit 1;
  if found then
    raise exception 'You have a job then: %, %. Give it back first, or pick other days.',
      v_job.appliance, private.visit_time(v_job.scheduled_at);
  end if;

  insert into public.technician_time_off (technician_id, starts_on, ends_on)
  values (auth.uid(), add_time_off.starts_on, add_time_off.ends_on)
  returning * into v_time_off;
  return v_time_off;
end;
$$;

-- A technician takes back time off they added.
create function public.remove_time_off(time_off_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.technician_time_off o
  where o.id = remove_time_off.time_off_id and o.technician_id = auth.uid();
  if not found then
    raise exception 'Time off not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.add_time_off(date, date),
  public.remove_time_off(uuid)
from public, anon;
grant execute on function
  public.add_time_off(date, date),
  public.remove_time_off(uuid)
to authenticated;
