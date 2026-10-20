-- Reporting a problem, and moderation. The customer or technician of a
-- booking can report a problem with it. Admins are told, look into it (they
-- can read the booking's chat), and resolve it with a note the reporter
-- gets. Admins can also hide a review (it stops counting in the rating),
-- remove a chat message (the original is kept, privately), and suspend a
-- customer (they can't book until it's lifted).
--
--   report_problem(booking_id, reason, details)              the customer or technician reports a problem
--   resolve_report(report_id, note)                          admins: close a report, telling the reporter
--   set_review_hidden(booking_id, hidden)                    admins: hide a review, or show it again
--   set_message_removed(message_id, removed)                 admins: remove a chat message, or restore it
--   set_customer_suspended(customer_id, suspended, reason)   admins: suspend a customer, or lift it

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete restrict,
  reporter_id uuid not null references public.profiles (id) on delete restrict,
  reason text not null check (reason in ('no_show', 'work', 'price', 'payment', 'damage', 'behaviour', 'review', 'other')),
  details text not null check (char_length(details) between 1 and 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution text check (char_length(resolution) <= 1000)
);
create index reports_booking_id_idx on public.reports (booking_id, created_at);
create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_resolved_by_idx on public.reports (resolved_by);

alter table public.reports enable row level security;

-- Read only: reports are made and resolved through the functions below.
revoke all on public.reports from anon, authenticated;
grant all on public.reports to service_role;
grant select on public.reports to authenticated;

create policy "People see their own reports; admins see all"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

-- What went wrong, as admins read it.
create function private.report_reason(p_reason text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'no_show' then 'Didn''t show up'
    when 'work' then 'Repair not done right'
    when 'price' then 'Charged more than agreed'
    when 'payment' then 'Didn''t pay'
    when 'damage' then 'Something was damaged'
    when 'behaviour' then 'Rude, unsafe or inappropriate'
    when 'review' then 'Unfair or abusive review'
    else 'Something else'
  end;
$$;

-- The customer or technician of a booking reports a problem with it (one
-- open report each at a time). Admins are told.
create function public.report_problem(booking_id uuid, reason text, details text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_report public.reports;
  v_details text := trim(coalesce(report_problem.details, ''));
  v_who text;
begin
  select * into v_booking from public.bookings b where b.id = report_problem.booking_id;
  if not found
     or auth.uid() is null
     or (auth.uid() is distinct from v_booking.customer_id and auth.uid() is distinct from v_booking.technician_id) then
    raise exception 'Only the customer or technician of a booking can report a problem with it' using errcode = '42501';
  end if;
  if report_problem.reason is null
     or report_problem.reason not in ('no_show', 'work', 'price', 'payment', 'damage', 'behaviour', 'review', 'other') then
    raise exception 'Pick what went wrong';
  end if;
  if char_length(v_details) not between 1 and 1000 then
    raise exception 'Say what happened (up to 1,000 characters)';
  end if;
  if exists (
    select 1 from public.reports r
    where r.booking_id = v_booking.id and r.reporter_id = auth.uid() and r.resolved_at is null
  ) then
    raise exception 'You''ve already reported a problem with this booking. PatchUp will get back to you.';
  end if;

  insert into public.reports (booking_id, reporter_id, reason, details)
  values (v_booking.id, auth.uid(), report_problem.reason, v_details)
  returning * into v_report;

  select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Someone')
         || case when p.id = v_booking.customer_id then ' (customer)' else ' (technician)' end
  into v_who
  from public.profiles p where p.id = auth.uid();
  perform private.notify(a.id, v_booking.id, 'Problem reported',
                         v_who || ': ' || private.report_reason(v_report.reason) || '. '
                           || (select c.name from public.service_categories c where c.id = v_booking.category_id)
                           || ': ' || v_booking.appliance,
                         '/admin/bookings/' || v_booking.id)
  from public.profiles a
  where a.role = 'admin';

  return v_report;
end;
$$;

-- Admins close a report with a note on what PatchUp did, which the reporter gets.
create function public.resolve_report(report_id uuid, note text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
  v_note text := trim(coalesce(resolve_report.note, ''));
  v_customer uuid;
begin
  if not private.is_admin() then
    raise exception 'Only admins can resolve reports' using errcode = '42501';
  end if;
  select * into v_report from public.reports r where r.id = resolve_report.report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if v_report.resolved_at is not null then
    raise exception 'This report is already resolved';
  end if;
  if char_length(v_note) not between 1 and 1000 then
    raise exception 'Say what PatchUp did about it, for the person who reported it';
  end if;

  update public.reports r
  set resolved_at = now(), resolved_by = auth.uid(), resolution = v_note
  where r.id = v_report.id
  returning * into v_report;

  select b.customer_id into v_customer from public.bookings b where b.id = v_report.booking_id;
  perform private.notify(v_report.reporter_id, v_report.booking_id, 'We''ve looked into your report', v_note,
                         case when v_report.reporter_id = v_customer then '/bookings/' else '/jobs/' end
                           || v_report.booking_id);
  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hiding a review
-- ---------------------------------------------------------------------------

alter table public.reviews add column hidden_at timestamptz;

-- A hidden review is seen only by the customer who wrote it, and admins.
drop policy "Anyone can read reviews" on public.reviews;
create policy "Visitors read the reviews PatchUp hasn't hidden"
  on public.reviews for select to anon
  using (hidden_at is null);
create policy "People read the reviews PatchUp hasn't hidden; their own and admins all"
  on public.reviews for select to authenticated
  using (hidden_at is null or customer_id = (select auth.uid()) or (select private.is_admin()));

-- A technician's rating counts only the reviews that are shown.
create or replace function private.refresh_technician_rating()
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
    where technician_id = v_technician_id and hidden_at is null
  ) s
  where t.id = v_technician_id;
  return null;
end;
$$;

-- Admins hide a review that breaks the rules (the customer is told), or show it again.
create function public.set_review_hidden(booking_id uuid, hidden boolean)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
begin
  if not private.is_admin() then
    raise exception 'Only admins can hide reviews' using errcode = '42501';
  end if;
  update public.reviews r
  set hidden_at = case when set_review_hidden.hidden then coalesce(r.hidden_at, now()) end
  where r.booking_id = set_review_hidden.booking_id
  returning * into v_review;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if set_review_hidden.hidden then
    perform private.notify(v_review.customer_id, v_review.booking_id, 'PatchUp hid your review',
                           'It broke our rules for reviews (see the Terms of Service), so others don''t see it.',
                           '/bookings/' || v_review.booking_id);
  end if;
  return v_review;
end;
$$;

-- ---------------------------------------------------------------------------
-- Removing a chat message
-- ---------------------------------------------------------------------------

alter table public.messages add column removed_at timestamptz;

-- What a removed message said, kept for PatchUp's records (and restoring it).
create table private.removed_messages (
  message_id uuid primary key references public.messages (id) on delete cascade,
  body text not null,
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz not null default now()
);
create index removed_messages_removed_by_idx on private.removed_messages (removed_by);
revoke all on private.removed_messages from public, anon, authenticated;

-- Admins remove a message that breaks the rules (both sides then see
-- "Removed by PatchUp", in the chat and in the notification that quoted it),
-- or put it back.
create function public.set_message_removed(message_id uuid, removed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages;
begin
  if not private.is_admin() then
    raise exception 'Only admins can remove messages' using errcode = '42501';
  end if;
  select * into v_message from public.messages m where m.id = set_message_removed.message_id for update;
  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;

  if set_message_removed.removed and v_message.removed_at is null then
    insert into private.removed_messages (message_id, body, removed_by) values (v_message.id, v_message.body, auth.uid());
    update public.messages m set body = 'Removed by PatchUp', removed_at = now() where m.id = v_message.id;
    update public.notifications n set body = 'Removed by PatchUp'
    where n.booking_id = v_message.booking_id and n.url = '/chat/' || v_message.booking_id
      and n.body = left(v_message.body, 300); -- as private.notify stored it
  elsif not set_message_removed.removed and v_message.removed_at is not null then
    update public.messages m
    set body = r.body, removed_at = null
    from private.removed_messages r
    where m.id = v_message.id and r.message_id = m.id;
    delete from private.removed_messages r where r.message_id = v_message.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suspending a customer
-- ---------------------------------------------------------------------------

-- Who's suspended: seen only by themselves (Home tells them) and admins.
create table public.account_suspensions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  suspended_at timestamptz not null default now(),
  suspended_by uuid references public.profiles (id) on delete set null
);
create index account_suspensions_suspended_by_idx on public.account_suspensions (suspended_by);

alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from anon, authenticated;
grant all on public.account_suspensions to service_role;
grant select on public.account_suspensions to authenticated;

create policy "People see their own suspension; admins see all"
  on public.account_suspensions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Admins suspend a customer (they can't book new repairs; their bookings go
-- on), or lift it; they're told either way. Returns whether they're now
-- suspended. (Technicians are suspended from their admin page, with their
-- approval.)
create function public.set_customer_suspended(customer_id uuid, suspended boolean, reason text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := trim(coalesce(set_customer_suspended.reason, ''));
begin
  if not private.is_admin() then
    raise exception 'Only admins can suspend accounts' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = set_customer_suspended.customer_id and p.role = 'customer') then
    raise exception 'Only customer accounts are suspended here';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters';
  end if;

  if set_customer_suspended.suspended then
    insert into public.account_suspensions (user_id, reason, suspended_by)
    values (set_customer_suspended.customer_id, v_reason, auth.uid())
    on conflict (user_id) do nothing;
    if found then
      perform private.notify(set_customer_suspended.customer_id, null, 'Your PatchUp account is suspended',
                             'You can''t book new repairs for now.' || case when v_reason <> '' then ' ' || v_reason else '' end,
                             '/home');
    end if;
  else
    delete from public.account_suspensions s where s.user_id = set_customer_suspended.customer_id;
    if found then
      perform private.notify(set_customer_suspended.customer_id, null, 'Your PatchUp account is active again',
                             'You can book repairs again.', '/home');
    end if;
  end if;
  return set_customer_suspended.suspended;
end;
$$;

-- As before (see 20261020110000_scheduling.sql), and a suspended customer can't book.
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

  if exists (select 1 from public.account_suspensions s where s.user_id = auth.uid()) then
    raise exception 'Your account is suspended, so you can''t book new repairs. Write to PatchUp to sort it out.'
      using errcode = '42501';
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

  if create_booking.technician_id is not null
     and private.claim_time(create_booking.technician_id, create_booking.scheduled_at) is not null then
    raise exception 'That technician already has a job then. Pick another time, or any available technician.';
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

revoke execute on function
  private.report_reason(text),
  public.report_problem(uuid, text, text),
  public.resolve_report(uuid, text),
  public.set_review_hidden(uuid, boolean),
  public.set_message_removed(uuid, boolean),
  public.set_customer_suspended(uuid, boolean, text)
from public, anon;
revoke execute on function private.report_reason(text) from authenticated;
grant execute on function
  public.report_problem(uuid, text, text),
  public.resolve_report(uuid, text),
  public.set_review_hidden(uuid, boolean),
  public.set_message_removed(uuid, boolean),
  public.set_customer_suspended(uuid, boolean, text)
to authenticated;
