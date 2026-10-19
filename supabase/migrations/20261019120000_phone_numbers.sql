-- Mobile numbers, so a technician can call the customer (can't find the
-- place, running late) and the customer can call them back. Optional, kept
-- apart from profiles because profiles are seen more widely: a number is
-- seen only by its owner, admins, and the other side of a job that's under
-- way (from accepted until it's done or cancelled).

create table public.phone_numbers (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  -- A Philippine mobile number, stored as +639XXXXXXXXX (the app accepts 0917…, +63 917…).
  phone text not null check (phone ~ '^\+639[0-9]{9}$'),
  updated_at timestamptz not null default now()
);

create trigger phone_numbers_set_updated_at
  before update on public.phone_numbers
  for each row execute function private.set_updated_at();

alter table public.phone_numbers enable row level security;

revoke all on public.phone_numbers from anon, authenticated;
grant all on public.phone_numbers to service_role;
grant select, insert, update (phone), delete on public.phone_numbers to authenticated;

create policy "People manage their own number"
  on public.phone_numbers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "The other side of a job under way, and admins, see a number"
  on public.phone_numbers for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.bookings b
      where b.status in ('accepted', 'en_route', 'arrived', 'quoted', 'in_progress')
        and ((b.customer_id = phone_numbers.user_id and b.technician_id = (select auth.uid()))
          or (b.technician_id = phone_numbers.user_id and b.customer_id = (select auth.uid())))
    )
  );
