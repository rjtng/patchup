-- Live tracking: while a technician is on the way (en_route), their phone
-- shares where they are, and the customer follows them on a map.
--
-- Only the latest position is kept, one row per booking, and only while the
-- technician is on the way: it's deleted as soon as they arrive (or the trip
-- ends any other way). The customer and the technician can read it during
-- the trip; nobody else, and nobody afterwards.

create table public.technician_locations (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  technician_id uuid not null references public.profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy real check (accuracy >= 0), -- meters, as the phone reports it
  updated_at timestamptz not null default now()
);

create index technician_locations_technician_id_idx on public.technician_locations (technician_id);

alter table public.technician_locations enable row level security;
revoke all on public.technician_locations from anon, authenticated;
grant all on public.technician_locations to service_role;
grant select on public.technician_locations to authenticated;

create policy "The customer and technician see the technician on the way"
  on public.technician_locations for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = technician_locations.booking_id
        and b.status = 'en_route'
        and (select auth.uid()) in (b.customer_id, b.technician_id)
    )
    or (select private.is_admin())
  );

-- The technician's phone calls this every few seconds while they're on the way.
create function public.share_location(booking_id uuid, latitude double precision, longitude double precision, accuracy real default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  select * into b from public.bookings where id = share_location.booking_id;
  if not found or b.technician_id is distinct from (select auth.uid()) then
    raise exception 'Only the technician doing this job can share their location' using errcode = '42501';
  end if;
  if b.status <> 'en_route' then
    raise exception 'Your location is shared only while you''re on the way';
  end if;
  if share_location.latitude is null or share_location.latitude not between -90 and 90
     or share_location.longitude is null or share_location.longitude not between -180 and 180 then
    raise exception 'That isn''t a location';
  end if;

  insert into public.technician_locations (booking_id, technician_id, latitude, longitude, accuracy, updated_at)
  values (b.id, b.technician_id, share_location.latitude, share_location.longitude,
          case when share_location.accuracy >= 0 then share_location.accuracy end, now())
  on conflict on constraint technician_locations_pkey do update
    set latitude = excluded.latitude, longitude = excluded.longitude, accuracy = excluded.accuracy, updated_at = excluded.updated_at
    -- A phone that sends too often (more than once every 2 seconds) is ignored in between.
    where public.technician_locations.updated_at < now() - interval '2 seconds';
  if not found then
    return;
  end if;

  -- The customer's map moves right away. The message only says the location
  -- changed; the app reads it through the access rules above.
  begin
    perform realtime.send(jsonb_build_object('booking_id', b.id), 'location', 'booking:' || b.id, true);
  exception when others then
    raise warning 'Live update for the location on booking % not sent: %', b.id, sqlerrm;
  end;
end;
$$;

-- When the trip ends (arrived, given back, cancelled), the location goes.
create function private.forget_trip_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.technician_locations l where l.booking_id = new.id;
  return null;
end;
$$;

create trigger bookings_forget_trip_location
  after update of status on public.bookings
  for each row
  when (old.status = 'en_route' and new.status <> 'en_route')
  execute function private.forget_trip_location();

revoke execute on function
  public.share_location(uuid, double precision, double precision, real),
  private.forget_trip_location()
from public, anon, authenticated;

grant execute on function public.share_location(uuid, double precision, double precision, real) to authenticated;
