-- Deleting an account (the Data Privacy Act's right to erasure). People
-- delete their own account from Profile, in two steps:
--
--   start_account_deletion()   checks they can, and lists their files; for the
--                              next hour they may remove all of them (the app
--                              does, through Storage, which deletes the files
--                              themselves)
--   delete_my_account()        once the files are gone: removes or blanks
--                              everything else about them, and stops the
--                              account from signing in
--
-- What's kept: completed and cancelled bookings, quotes, reviews' ratings and
-- payouts, with nothing that identifies the person (for PatchUp's records and
-- the other side's history). Not while a booking or job is under way, and not
-- for admins (another admin removes their role first).

create table private.account_deletions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now()
);
revoke all on private.account_deletions from public, anon, authenticated;

-- Whether the signed-in person started deleting their account in the last hour.
create function private.deleting_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.account_deletions d
    where d.user_id = (select auth.uid()) and d.requested_at > now() - interval '1 hour'
  );
$$;

-- Why the signed-in person can't delete their account yet, or null if they can.
create function public.account_deletion_blocker()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then 'Log in to delete your account.'
    when private.is_admin() then
      'Admins can''t delete their account. Ask another admin to remove your admin role first.'
    when exists (select 1 from public.bookings b
                 where b.customer_id = (select auth.uid())
                   and b.status in ('requested', 'accepted', 'en_route', 'arrived', 'quoted', 'in_progress')) then
      'You have a booking that isn''t finished. Cancel it, or wait until the job is done.'
    when exists (select 1 from public.bookings b
                 where b.technician_id = (select auth.uid())
                   and b.status in ('requested', 'accepted', 'en_route', 'arrived', 'quoted', 'in_progress')) then
      'You have a job that isn''t finished. Give it back, or finish it first.'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Step 1: start, and list the files to remove
-- ---------------------------------------------------------------------------

create function public.start_account_deletion()
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_blocker text := public.account_deletion_blocker();
begin
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = case when v_user is null then '42501' else 'P0001' end;
  end if;

  insert into private.account_deletions (user_id) values (v_user)
  on conflict (user_id) do update set requested_at = now();

  return query
    select 'technician-documents'::text, o.name
    from storage.objects o
    where o.bucket_id = 'technician-documents' and (storage.foldername(o.name))[1] = v_user::text
    union all
    select 'booking-photos'::text, o.name
    from storage.objects o
    join public.bookings b on b.id::text = (storage.foldername(o.name))[1]
    where o.bucket_id = 'booking-photos' and b.customer_id = v_user;
end;
$$;

-- For the next hour they may remove all their own files: their documents
-- (also once approved) and their bookings' photos (also once done).
create policy "Technician documents: removed when deleting the account"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'technician-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.deleting_account())
  );

create policy "Booking photos: removed when deleting the account"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'booking-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1] and b.customer_id = (select auth.uid())
    )
    and (select private.deleting_account())
  );

-- ---------------------------------------------------------------------------
-- Step 2: delete the account
-- ---------------------------------------------------------------------------

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_blocker text := public.account_deletion_blocker();
  v_table text;
begin
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = case when v_user is null then '42501' else 'P0001' end;
  end if;
  if not private.deleting_account() then
    raise exception 'Start deleting your account again.';
  end if;
  if exists (
    select 1 from storage.objects o
    where (o.bucket_id = 'technician-documents' and (storage.foldername(o.name))[1] = v_user::text)
       or (o.bucket_id = 'booking-photos' and exists (
             select 1 from public.bookings b
             where b.id::text = (storage.foldername(o.name))[1] and b.customer_id = v_user))
  ) then
    raise exception 'Some of your files weren''t removed. Try again.';
  end if;

  -- What's only theirs goes.
  delete from public.addresses where user_id = v_user;
  delete from public.phone_numbers where user_id = v_user;
  delete from public.push_subscriptions where user_id = v_user;
  delete from public.notifications where user_id = v_user;
  delete from public.chat_reads where user_id = v_user;
  delete from public.messages where sender_id = v_user;
  delete from public.technician_documents where technician_id = v_user;
  delete from public.technician_services where technician_id = v_user;
  delete from public.technician_locations where technician_id = v_user;
  delete from public.booking_photos p
  using public.bookings b
  where b.id = p.booking_id and b.customer_id = v_user;
  delete from private.booking_reminders where user_id = v_user;

  -- What's kept no longer says who, or where they live.
  update public.bookings
  set street = 'Removed', landmark = '', latitude = null, longitude = null, brand = '',
      problem = 'Removed when the customer deleted their account'
  where customer_id = v_user;
  update public.reviews set customer_name = '' where customer_id = v_user;
  update public.technician_profiles
  set bio = '', city = '', years_experience = null, is_available = false, verification_status = 'suspended'
  where id = v_user;
  update public.profiles set full_name = '', avatar_url = null where id = v_user;

  -- The sign-in: no email, details or password, and no way back in.
  update auth.users
  set email = 'deleted-' || v_user || '@deleted.invalid',
      phone = null,
      raw_user_meta_data = '{}'::jsonb,
      encrypted_password = '',
      banned_until = now() + interval '100 years'
  where id = v_user;
  foreach v_table in array array['identities', 'sessions', 'refresh_tokens', 'mfa_factors', 'one_time_tokens'] loop
    if to_regclass('auth.' || v_table) is not null then
      -- (user_id is text in some of these tables)
      execute format('delete from auth.%I where user_id::text = $1', v_table) using v_user::text;
    end if;
  end loop;

  delete from private.account_deletions where user_id = v_user;
end;
$$;

revoke execute on function
  private.deleting_account(),
  public.account_deletion_blocker(),
  public.start_account_deletion(),
  public.delete_my_account()
from public, anon;
grant execute on function
  private.deleting_account(),
  public.account_deletion_blocker(),
  public.start_account_deletion(),
  public.delete_my_account()
to authenticated;
