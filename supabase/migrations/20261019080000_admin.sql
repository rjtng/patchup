-- The admin dashboard: what it needs beyond what admins can already read and
-- do through the access rules (see all bookings and people, approve,
-- reject or suspend technicians, assign a technician, cancel).
--
--   admin_overview()           counts for the dashboard
--   admin_technicians(...)     technicians with their sign-up email, services and jobs done
--   admin_emails(user_ids)     people's sign-up email, to contact them
--
-- Each checks that the caller is an admin. Technicians also hear when they're
-- approved, rejected or suspended.

-- ---------------------------------------------------------------------------
-- Counts
-- ---------------------------------------------------------------------------

create function public.admin_overview()
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
    -- Requests nobody has taken yet, and those waiting over an hour.
    'unassigned_requests', (select count(*) from public.bookings b where b.status = 'requested' and b.technician_id is null),
    'stale_requests', (select count(*) from public.bookings b
                       where b.status = 'requested' and b.technician_id is null and b.created_at < now() - interval '1 hour'),
    -- Requests for a chosen technician who hasn't answered yet.
    'awaiting_technician', (select count(*) from public.bookings b where b.status = 'requested' and b.technician_id is not null),
    'active_bookings', (select count(*) from public.bookings b
                        where b.status in ('accepted', 'en_route', 'arrived', 'quoted', 'in_progress')),
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

-- ---------------------------------------------------------------------------
-- Technicians, with what an admin needs to check and contact them
-- ---------------------------------------------------------------------------

create function public.admin_technicians(status public.verification_status default null, technician_id uuid default null)
returns table (
  id uuid,
  full_name text,
  email text,
  city text,
  years_experience integer,
  bio text,
  verification_status public.verification_status,
  verified_at timestamptz,
  is_available boolean,
  rating_avg numeric,
  rating_count integer,
  services text[],
  jobs_completed integer,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can see this' using errcode = '42501';
  end if;

  return query
  select
    t.id,
    p.full_name,
    u.email::text,
    t.city,
    t.years_experience::integer,
    t.bio,
    t.verification_status,
    t.verified_at,
    t.is_available,
    t.rating_avg::numeric,
    t.rating_count,
    coalesce((select array_agg(c.name order by c.sort_order)
              from public.technician_services s join public.service_categories c on c.id = s.category_id
              where s.technician_id = t.id), '{}'),
    (select count(*)::integer from public.bookings b where b.technician_id = t.id and b.status = 'completed'),
    t.created_at
  from public.technician_profiles t
  join public.profiles p on p.id = t.id
  left join auth.users u on u.id = t.id
  where (admin_technicians.status is null or t.verification_status = admin_technicians.status)
    and (admin_technicians.technician_id is null or t.id = admin_technicians.technician_id)
  order by t.created_at desc;
end;
$$;

-- People's sign-up email (customers and technicians), for an admin to contact them.
create function public.admin_emails(user_ids uuid[])
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only admins can see this' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text from auth.users u where u.id = any (admin_emails.user_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Telling technicians the outcome of their verification
-- ---------------------------------------------------------------------------

create function private.verification_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case new.verification_status
  when 'approved' then
    perform private.notify(new.id, null, 'You''re approved',
                           'Customers can now book you. Turn on Taking new jobs to get requests.', '/jobs');
  when 'rejected' then
    perform private.notify(new.id, null, 'Your application wasn''t approved',
                           'Contact PatchUp support to find out why.', '/profile');
  when 'suspended' then
    perform private.notify(new.id, null, 'Your account is suspended',
                           'You won''t get new jobs for now. Contact PatchUp support to find out why.', '/profile');
  else
    null;
  end case;
  return null;
exception when others then
  -- Like other notifications, this must never stop the change itself.
  raise warning 'Notification for technician % not written: %', new.id, sqlerrm;
  return null;
end;
$$;

create trigger technician_profiles_verification_notify
  after update of verification_status on public.technician_profiles
  for each row
  when (old.verification_status is distinct from new.verification_status)
  execute function private.verification_changed();

-- ---------------------------------------------------------------------------
-- When an admin cancels, say so (it read as if the customer had cancelled),
-- with their reason. Otherwise as in the reviews-and-chat migration.
-- ---------------------------------------------------------------------------

create or replace function private.notify_booking_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  v_category text;
  v_customer text;   -- first name
  v_technician text; -- full name
  v_what text;       -- "Plumbing: Kitchen faucet"
  v_when text;
  v_area text;
  v_amount numeric;
begin
  select * into b from public.bookings where id = new.booking_id;
  select c.name into v_category from public.service_categories c where c.id = b.category_id;
  select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'The customer') into v_customer
  from public.profiles p where p.id = b.customer_id;
  select coalesce(nullif(trim(p.full_name), ''), 'Your technician') into v_technician
  from public.profiles p where p.id = b.technician_id;
  v_what := v_category || ': ' || b.appliance;
  v_when := private.visit_time(b.scheduled_at);
  v_area := b.barangay || ', ' || b.city;

  case new.event
  when 'created', 'declined' then
    if b.technician_id is null then
      -- An open request: every technician who could take it (not one who just gave it back).
      perform private.notify(t.id, b.id, 'New ' || lower(v_category) || ' request',
                             b.appliance || ' in ' || v_area || ' · ' || v_when, '/jobs/' || b.id)
      from public.technician_profiles t
      where t.id is distinct from new.actor_id and private.is_open_for_jobs(t.id, b.category_id);
    else
      perform private.notify(b.technician_id, b.id, 'Request for you',
                             v_customer || ' asked you: ' || b.appliance || ' in ' || v_area || ' · ' || v_when,
                             '/jobs/' || b.id);
    end if;
    if new.event = 'declined' then
      perform private.notify(b.customer_id, b.id, 'Finding you another technician',
                             'Your technician can''t make it, so your request went to other '
                             || lower(v_category) || ' technicians. ' || v_what,
                             '/bookings/' || b.id);
    end if;

  when 'accepted' then
    perform private.notify(b.customer_id, b.id, v_technician || ' accepted your booking',
                           v_what || ' · ' || v_when, '/bookings/' || b.id);

  when 'assigned' then
    perform private.notify(b.customer_id, b.id, v_technician || ' will do your repair',
                           v_what || ' · ' || v_when, '/bookings/' || b.id);
    perform private.notify(b.technician_id, b.id, 'New job for you',
                           b.appliance || ' in ' || v_area || ' · ' || v_when, '/jobs/' || b.id);

  when 'en_route' then
    perform private.notify(b.customer_id, b.id, v_technician || ' is on the way', v_what, '/bookings/' || b.id);

  when 'arrived' then
    perform private.notify(b.customer_id, b.id, v_technician || ' has arrived', v_what, '/bookings/' || b.id);

  when 'quote_sent' then
    select q.total into v_amount from public.quotes q where q.booking_id = b.id and q.status = 'pending';
    perform private.notify(b.customer_id, b.id, 'Quote ready: ' || private.peso(v_amount),
                           'Approve it to start the repair. ' || v_what, '/bookings/' || b.id);

  when 'quote_approved' then
    select q.total into v_amount from public.quotes q
    where q.booking_id = b.id and q.status = 'approved' order by q.responded_at desc limit 1;
    perform private.notify(b.technician_id, b.id, 'Quote approved',
                           v_customer || ' approved ' || private.peso(v_amount) || '. You can start the repair.',
                           '/jobs/' || b.id);

  when 'quote_declined' then
    perform private.notify(b.technician_id, b.id, 'Quote declined',
                           v_customer || ' declined the quote. Send a new one, or finish with the inspection only.',
                           '/jobs/' || b.id);

  when 'completed' then
    perform private.notify(b.customer_id, b.id, 'Job done',
                           'Total: ' || private.peso(b.final_amount) || ', paid in cash. How did it go? Tap to rate '
                           || v_technician || '.',
                           '/bookings/' || b.id);

  when 'cancelled' then
    if new.actor_id is distinct from b.customer_id then
      -- PatchUp (an admin) cancelled: both hear it, with the reason given.
      perform private.notify(b.customer_id, b.id, 'PatchUp cancelled your booking',
                             v_what || ' · ' || v_when || coalesce('. ' || nullif(new.note, ''), ''), '/bookings/' || b.id);
      if b.technician_id is not null then
        perform private.notify(b.technician_id, b.id, 'PatchUp cancelled this job',
                               b.appliance || ' · ' || v_when
                               || coalesce('. ' || nullif(new.note, ''), ''), '/jobs/' || b.id);
      end if;
    elsif b.technician_id is not null then
      perform private.notify(b.technician_id, b.id, 'Booking cancelled',
                             v_customer || ' cancelled: ' || b.appliance || ' · ' || v_when, '/jobs/' || b.id);
    end if;

  else
    null;
  end case;
  return null;
exception when others then
  -- Notifications must never stop the booking step itself.
  raise warning 'Notifications for booking event % not written: %', new.id, sqlerrm;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what (the admin_ functions check for admins themselves)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.admin_overview(),
  public.admin_technicians(public.verification_status, uuid),
  public.admin_emails(uuid[]),
  private.verification_changed()
from public, anon, authenticated;

grant execute on function
  public.admin_overview(),
  public.admin_technicians(public.verification_status, uuid),
  public.admin_emails(uuid[])
to authenticated;
