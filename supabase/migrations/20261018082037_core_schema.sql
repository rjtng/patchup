-- PatchUp core schema: people, services, addresses, bookings and everything
-- that hangs off a booking (timeline, quotes, chat, reviews).
-- Access rules are in the next migration; booking actions in the one after.

-- Helpers that the API must not expose live in this schema (only `public` is
-- served by the Supabase Data API).
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('customer', 'technician', 'admin');

create type public.verification_status as enum ('pending', 'approved', 'rejected', 'suspended');

-- Which step can follow which, and who may take it, is listed at the top of
-- the booking-actions migration.
create type public.booking_status as enum (
  'requested',   -- waiting for a technician (a chosen one, or any eligible one)
  'accepted',    -- a technician has taken the job
  'en_route',    -- technician is on the way
  'arrived',     -- technician is at the address and diagnosing
  'quoted',      -- technician sent a repair quote; waiting for the customer
  'in_progress', -- customer approved the quote; repair underway
  'completed',
  'cancelled'
);

create type public.quote_status as enum ('pending', 'approved', 'declined');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- One row per account, created automatically on sign-up (see handle_new_user).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text not null default '' check (char_length(full_name) <= 100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Extra details for technicians. Only approved technicians are shown to
-- customers or can take jobs; admins approve them after checking documents.
create table public.technician_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  bio text not null default '' check (char_length(bio) <= 1000),
  years_experience smallint check (years_experience between 0 and 60),
  city text not null default '' check (char_length(city) <= 100),
  is_available boolean not null default false, -- accepting new bookings
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger technician_profiles_set_updated_at
  before update on public.technician_profiles
  for each row execute function private.set_updated_at();

-- Creates the profile when someone signs up. The app passes `full_name` and
-- `role` as sign-up metadata; only "technician" is honoured, so nobody can
-- make themselves an admin (admins are promoted by hand in the dashboard).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role :=
    case when new.raw_user_meta_data ->> 'role' = 'technician' then 'technician' else 'customer' end;
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, v_role, left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100));

  if v_role = 'technician' then
    insert into public.technician_profiles (id) values (new.id);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  -- Charged for the visit and diagnosis, whether or not the repair goes ahead.
  inspection_fee numeric(10, 2) not null default 0 check (inspection_fee >= 0),
  sort_order smallint not null default 0,
  is_active boolean not null default true
);

-- The categories on the Home screen. Inspection fees are placeholders: set
-- the real ones before launch.
insert into public.service_categories (slug, name, inspection_fee, sort_order) values
  ('plumbing',   'Plumbing',   300, 1),
  ('repairing',  'Repairing',  300, 2),
  ('electrical', 'Electrical', 300, 3),
  ('carpentry',  'Carpentry',  300, 4),
  ('cleaning',   'Cleaning',   300, 5),
  ('painting',   'Painting',   300, 6),
  ('handyman',   'Handyman',   300, 7);

-- Which categories each technician works in.
create table public.technician_services (
  technician_id uuid not null references public.technician_profiles (id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete cascade,
  primary key (technician_id, category_id)
);

create index technician_services_category_id_idx on public.technician_services (category_id);

-- ---------------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------------

-- A customer's saved places. Addresses in the Philippines are often informal,
-- so the map pin (latitude/longitude) and landmark matter as much as the text.
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label text not null default 'Home' check (char_length(label) between 1 and 40),
  street text not null check (char_length(street) between 1 and 200), -- house no., street, building
  barangay text not null check (char_length(barangay) between 1 and 100),
  city text not null check (char_length(city) between 1 and 100),
  province text not null check (char_length(province) between 1 and 100),
  landmark text not null default '' check (char_length(landmark) <= 200),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index addresses_user_id_idx on public.addresses (user_id);

create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

-- Bookings only change through the functions in the booking-actions
-- migration, which check who is acting and which step comes next.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  -- Set when the customer picks a technician, or when one accepts/is assigned.
  technician_id uuid references public.profiles (id) on delete restrict,
  category_id uuid not null references public.service_categories (id),
  status public.booking_status not null default 'requested',

  appliance text not null check (char_length(appliance) between 1 and 100),
  brand text not null default '' check (char_length(brand) <= 100),
  problem text not null check (char_length(problem) between 1 and 2000),
  scheduled_at timestamptz not null,

  -- Copied from the customer's address, so later edits don't change history.
  street text not null,
  barangay text not null,
  city text not null,
  province text not null,
  landmark text not null default '',
  latitude double precision,
  longitude double precision,

  inspection_fee numeric(10, 2) not null check (inspection_fee >= 0), -- copied from the category
  final_amount numeric(10, 2) check (final_amount >= 0),             -- set on completion

  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text check (char_length(cancel_reason) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,

  check (technician_id is distinct from customer_id)
);

create index bookings_customer_id_idx on public.bookings (customer_id, created_at desc);
create index bookings_technician_id_idx on public.bookings (technician_id, scheduled_at);
-- Open requests that any eligible technician may take.
create index bookings_open_idx on public.bookings (category_id, scheduled_at)
  where status = 'requested' and technician_id is null;

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function private.set_updated_at();

-- The booking timeline the customer sees ("Technician on the way", ...).
-- Written only by the booking functions.
create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null check (event in (
    'created', 'accepted', 'declined', 'assigned', 'en_route', 'arrived',
    'quote_sent', 'quote_approved', 'quote_declined', 'completed', 'cancelled'
  )),
  status public.booking_status not null, -- the booking's status after this event
  note text,
  created_at timestamptz not null default now()
);

create index booking_events_booking_id_idx on public.booking_events (booking_id, id);

-- A technician's price for the repair, sent after diagnosis.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  technician_id uuid not null references public.profiles (id) on delete restrict,
  -- [{"description": "Replace compressor capacitor", "amount": 850}, ...]
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  total numeric(10, 2) not null check (total >= 0),
  note text not null default '' check (char_length(note) <= 1000),
  status public.quote_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index quotes_booking_id_idx on public.quotes (booking_id);
create unique index quotes_one_pending_per_booking on public.quotes (booking_id) where status = 'pending';

-- Chat between the customer and the assigned technician.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_booking_id_idx on public.messages (booking_id, created_at);

-- One review per completed booking, shown publicly on the technician's profile.
create table public.reviews (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  technician_id uuid not null references public.profiles (id) on delete restrict,
  customer_name text not null default '', -- reviewer's first name, for display
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

create index reviews_technician_id_idx on public.reviews (technician_id, created_at desc);

-- Keeps the technician's average rating in step with their reviews.
create function private.refresh_technician_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_technician_id uuid := case when tg_op = 'DELETE' then old.technician_id else new.technician_id end;
begin
  update public.technician_profiles t
  set rating_avg = coalesce(s.rating_avg, 0),
      rating_count = s.rating_count
  from (
    select round(avg(rating), 2) as rating_avg, count(*) as rating_count
    from public.reviews
    where technician_id = v_technician_id
  ) s
  where t.id = v_technician_id;
  return null;
end;
$$;

create trigger reviews_refresh_technician_rating
  after insert or update or delete on public.reviews
  for each row execute function private.refresh_technician_rating();

-- ---------------------------------------------------------------------------
-- Live updates: the apps subscribe to these tables (Supabase Realtime only
-- sends each person the rows they are allowed to read).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.bookings, public.booking_events, public.quotes, public.messages;
