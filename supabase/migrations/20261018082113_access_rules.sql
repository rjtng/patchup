-- Who can read and change what.
--
-- Two layers, both required:
--   1. Grants: which tables and columns the API roles (`anon` = signed out,
--      `authenticated` = signed in) may touch at all. Everything is revoked
--      first, so nothing depends on Supabase's default grants.
--   2. Row level security: which rows each person sees or changes.
-- Bookings, quotes and reviews are only ever written through the functions in
-- the booking-actions migration, so the API roles get no write access to them.

-- ---------------------------------------------------------------------------
-- Helpers used by the policies. SECURITY DEFINER lets them read the tables
-- they check without going through RLS again (which would loop).
-- ---------------------------------------------------------------------------

create function private.current_user_role()
returns public.user_role
language sql
stable
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'admin', false);
$$;

create function private.is_approved_technician(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.technician_profiles
    where id = p_user_id and verification_status = 'approved'
  );
$$;

-- Approved, accepting bookings, and working in this category.
create function private.is_open_for_jobs(p_technician_id uuid, p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.technician_profiles t
    join public.technician_services s on s.technician_id = t.id
    where t.id = p_technician_id
      and t.verification_status = 'approved'
      and t.is_available
      and s.category_id = p_category_id
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(), private.is_open_for_jobs(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role; -- server-side code only; bypasses RLS

grant select on public.profiles, public.technician_profiles, public.technician_services,
  public.service_categories, public.reviews to anon, authenticated;

grant update (full_name, avatar_url) on public.profiles to authenticated;
grant update (bio, years_experience, city, is_available) on public.technician_profiles to authenticated;
grant insert, delete on public.technician_services to authenticated;
grant insert (slug, name, inspection_fee, sort_order, is_active),
  update (slug, name, inspection_fee, sort_order, is_active) on public.service_categories to authenticated;
grant select, insert, update, delete on public.addresses to authenticated;
grant select on public.bookings, public.booking_events, public.quotes, public.messages to authenticated;
grant insert (booking_id, body) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.technician_profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.technician_services enable row level security;
alter table public.addresses enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.quotes enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;

-- profiles --------------------------------------------------------------------

create policy "Anyone can see approved technicians"
  on public.profiles for select to anon, authenticated
  using (exists (
    select 1 from public.technician_profiles t
    where t.id = profiles.id and t.verification_status = 'approved'
  ));

create policy "People see themselves and the other side of their bookings"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or exists (
      select 1 from public.bookings b
      where (b.customer_id = profiles.id and b.technician_id = (select auth.uid()))
         or (b.technician_id = profiles.id and b.customer_id = (select auth.uid()))
    )
  );

create policy "People edit their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- technician_profiles ---------------------------------------------------------

create policy "Anyone can see approved technicians"
  on public.technician_profiles for select to anon, authenticated
  using (verification_status = 'approved');

create policy "Technicians see their own profile; admins see all"
  on public.technician_profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "Technicians edit their own profile"
  on public.technician_profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- service_categories ----------------------------------------------------------

create policy "Anyone can see active categories"
  on public.service_categories for select to anon, authenticated
  using (is_active);

create policy "Admins see all categories"
  on public.service_categories for select to authenticated
  using ((select private.is_admin()));

create policy "Admins add categories"
  on public.service_categories for insert to authenticated
  with check ((select private.is_admin()));

create policy "Admins edit categories"
  on public.service_categories for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- technician_services ---------------------------------------------------------

create policy "Anyone can see what approved technicians offer"
  on public.technician_services for select to anon, authenticated
  using (exists (
    select 1 from public.technician_profiles t
    where t.id = technician_id and t.verification_status = 'approved'
  ));

create policy "Technicians see their own services; admins see all"
  on public.technician_services for select to authenticated
  using (technician_id = (select auth.uid()) or (select private.is_admin()));

create policy "Technicians add their own services"
  on public.technician_services for insert to authenticated
  with check (technician_id = (select auth.uid()));

create policy "Technicians remove their own services"
  on public.technician_services for delete to authenticated
  using (technician_id = (select auth.uid()));

-- addresses -------------------------------------------------------------------

create policy "People manage their own addresses"
  on public.addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- bookings --------------------------------------------------------------------

create policy "Customers and technicians see their bookings; admins see all"
  on public.bookings for select to authenticated
  using (
    customer_id = (select auth.uid())
    or technician_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy "Available technicians see open requests in their categories"
  on public.bookings for select to authenticated
  using (
    status = 'requested'
    and technician_id is null
    and private.is_open_for_jobs((select auth.uid()), category_id)
  );

-- booking_events --------------------------------------------------------------

-- The subquery runs with the bookings policies above, so the timeline is
-- visible exactly when the booking is.
create policy "See the timeline of bookings you can see"
  on public.booking_events for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- quotes ----------------------------------------------------------------------

create policy "Customer and technician see the booking's quotes; admins all"
  on public.quotes for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = (select auth.uid()) or b.technician_id = (select auth.uid()))
    )
    or (select private.is_admin())
  );

-- messages --------------------------------------------------------------------

create policy "Customer and technician read the booking's chat; admins too"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = (select auth.uid()) or b.technician_id = (select auth.uid()))
    )
    or (select private.is_admin())
  );

create policy "The booking's customer and technician can message each other"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.technician_id is not null
        and b.status <> 'cancelled'
        and (b.customer_id = (select auth.uid()) or b.technician_id = (select auth.uid()))
    )
  );

-- reviews ---------------------------------------------------------------------

create policy "Anyone can read reviews"
  on public.reviews for select to anon, authenticated
  using (true);
