-- Profile photos and Top technicians. Anyone can add a photo of themselves
-- (Profile). It's seen by whoever can see their profile: an approved
-- technician's by everyone, a customer's by themselves, the technicians of
-- their bookings and admins. Home lists the top technicians, those near the
-- customer first. Deleting an account removes the photo with the other files.
--
--   top_technicians(near_city, max_results)  approved technicians taking jobs, best first

-- ---------------------------------------------------------------------------
-- The photos: a private bucket, one folder per person
-- ---------------------------------------------------------------------------

-- The app makes each photo a small square JPEG before uploading it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- profiles.avatar_url holds the photo's path in the bucket ("<their id>/<file>"),
-- which can only be in their own folder.
alter table public.profiles
  add constraint profiles_avatar_url_own_folder
  check (avatar_url is null or (avatar_url like id::text || '/%' and char_length(avatar_url) <= 200));
create index profiles_avatar_url_idx on public.profiles (avatar_url) where avatar_url is not null;

create policy "Profile photos: people add their own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Profile photos: people remove their own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Someone's current photo is seen with their profile (the profiles access
-- rules decide who sees whom); their other files only by themselves.
create policy "Profile photos: seen with the profile"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.profiles p where p.avatar_url = name)
    )
  );

-- ---------------------------------------------------------------------------
-- Top technicians
-- ---------------------------------------------------------------------------

-- Approved technicians taking jobs in a shown service: those in near_city
-- first, then by rating, weighted so a few reviews count for less (as if each
-- had three more 4-star reviews), then by how many reviews.
create function public.top_technicians(near_city text default null, max_results integer default 10)
returns table (
  id uuid,
  full_name text,
  city text,
  rating_avg numeric,
  rating_count integer,
  services text[]
)
language sql
stable
set search_path = ''
as $$
  select t.id, p.full_name, t.city, t.rating_avg::numeric, t.rating_count,
         array_agg(c.name order by c.sort_order, c.name)
  from public.technician_profiles t
  join public.profiles p on p.id = t.id
  join public.technician_services s on s.technician_id = t.id
  join public.service_categories c on c.id = s.category_id and c.is_active
  where t.verification_status = 'approved' and t.is_available
  group by t.id, p.full_name
  order by
    coalesce(lower(trim(t.city)) = lower(trim(top_technicians.near_city)), false) desc,
    (t.rating_avg * t.rating_count + 4 * 3) / (t.rating_count + 3) desc,
    t.rating_count desc,
    p.full_name
  limit least(greatest(coalesce(top_technicians.max_results, 10), 1), 20);
$$;

revoke execute on function public.top_technicians(text, integer) from public;
grant execute on function public.top_technicians(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Deleting an account removes the photo too
-- ---------------------------------------------------------------------------

-- Everything in Storage that's someone's own: their documents, their
-- bookings' photos and their profile photos.
create function private.account_files(p_user uuid)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'technician-documents'::text, o.name
  from storage.objects o
  where o.bucket_id = 'technician-documents' and (storage.foldername(o.name))[1] = p_user::text
  union all
  select 'booking-photos'::text, o.name
  from storage.objects o
  join public.bookings b on b.id::text = (storage.foldername(o.name))[1]
  where o.bucket_id = 'booking-photos' and b.customer_id = p_user
  union all
  select 'avatars'::text, o.name
  from storage.objects o
  where o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = p_user::text;
$$;
revoke execute on function private.account_files(uuid) from public, anon, authenticated;

create or replace function public.start_account_deletion()
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

  return query select f.bucket, f.path from private.account_files(v_user) f;
end;
$$;

create or replace function public.delete_my_account()
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
  if exists (select 1 from private.account_files(v_user)) then
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
