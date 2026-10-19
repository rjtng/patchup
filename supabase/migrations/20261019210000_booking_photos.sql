-- Photos of the problem: customers add up to three to a booking (when they
-- book, or later until the job is done), so technicians can see what it is
-- before they accept it and quote it. The files are in a private Storage
-- bucket, in a folder per booking; `booking_photos` lists each booking's.
-- Whoever can see a booking (its customer and technician, technicians who
-- could take the open request, admins) can see its photos.

-- ---------------------------------------------------------------------------
-- The bucket: private; photos up to 5 MB (the app shrinks them before upload)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-photos', 'booking-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Files go in "<booking id>/<anything>". The booking's customer adds and
-- removes them until the job is done or cancelled; the bookings' own rules
-- decide who else can see them.
create policy "Booking photos: customers add them to their bookings"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'booking-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = (select auth.uid())
        and b.status not in ('completed', 'cancelled')
    )
  );

create policy "Booking photos: whoever can see the booking"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'booking-photos'
    and exists (select 1 from public.bookings b where b.id::text = (storage.foldername(name))[1])
  );

create policy "Booking photos: customers remove theirs until the job is done"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'booking-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = (select auth.uid())
        and b.status not in ('completed', 'cancelled')
    )
  );

-- ---------------------------------------------------------------------------
-- Each booking's photos
-- ---------------------------------------------------------------------------

create table public.booking_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- Where the file is in the bucket: always in the booking's own folder.
  storage_path text not null unique check (char_length(storage_path) <= 300),
  created_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = booking_id::text)
);

create index booking_photos_booking_id_idx on public.booking_photos (booking_id, created_at);

alter table public.booking_photos enable row level security;

revoke all on public.booking_photos from anon, authenticated;
grant all on public.booking_photos to service_role;
grant select, delete on public.booking_photos to authenticated;
grant insert (booking_id, storage_path) on public.booking_photos to authenticated;

-- The subqueries run with the bookings' rules, so this is "anyone who can see the booking".
create policy "See the photos of bookings you can see"
  on public.booking_photos for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

create policy "Customers add photos until the job is done"
  on public.booking_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = (select auth.uid())
        and b.status not in ('completed', 'cancelled')
    )
  );

create policy "Customers remove photos until the job is done"
  on public.booking_photos for delete to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = (select auth.uid())
        and b.status not in ('completed', 'cancelled')
    )
  );

-- Up to three a booking. (A trigger rather than the policy, which can't count
-- its own table; it locks the booking so two added at once can't make four.)
create function private.limit_booking_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.bookings b where b.id = new.booking_id for update;
  if (select count(*) from public.booking_photos p where p.booking_id = new.booking_id) >= 3 then
    raise exception 'A booking can have up to 3 photos';
  end if;
  return new;
end;
$$;

create trigger booking_photos_limit
  before insert on public.booking_photos
  for each row execute function private.limit_booking_photos();
