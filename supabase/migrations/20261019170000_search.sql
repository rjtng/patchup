-- Search: approved technicians matching what someone typed. The app reads the
-- search into services ("aircon" -> repairing) and the other words ("pasig",
-- "ben"); a technician matches if they offer one of the services (when there
-- are any) and every other word is in their name, city, description or
-- services. Someone searched for by name comes first; then those taking jobs,
-- then the best rated.
--
-- Runs as the person searching (security invoker): it only reads what anyone
-- may see about approved technicians.

create function public.search_technicians(
  terms text[] default '{}',
  service_slugs text[] default '{}',
  max_results integer default 30
)
returns table (
  id uuid,
  full_name text,
  city text,
  years_experience integer,
  bio text,
  rating_avg numeric,
  rating_count integer,
  is_available boolean,
  services text[]
)
language sql
stable
set search_path = ''
as $$
  with word as (
    -- Each word, lower-case and taken literally in patterns (% and _ are just characters).
    select lower(replace(replace(replace(left(w.term, 50), '\', '\\'), '%', '\%'), '_', '\_')) as pattern
    from unnest(search_technicians.terms[1:8]) as w(term)
    where w.term <> ''
  ),
  technician as (
    select
      t.id,
      p.full_name,
      t.city,
      t.years_experience::integer as years_experience,
      t.bio,
      t.rating_avg::numeric as rating_avg,
      t.rating_count,
      t.is_available,
      coalesce(array_agg(c.name order by c.sort_order) filter (where c.id is not null), '{}') as service_names,
      coalesce(array_agg(c.slug) filter (where c.id is not null), '{}') as slugs
    from public.technician_profiles t
    join public.profiles p on p.id = t.id
    left join public.technician_services s on s.technician_id = t.id
    left join public.service_categories c on c.id = s.category_id and c.is_active
    -- Admins (and technicians themselves) can read more than approved
    -- profiles; search lists only what customers can book.
    where t.verification_status = 'approved'
    group by t.id, p.full_name
  ),
  searchable as (
    -- Accents dropped, as the app drops them from the search ("Parañaque" ~ "paranaque").
    select m.*,
      lower(translate(concat_ws(' ', m.full_name, m.city, m.bio, array_to_string(m.service_names, ' ')),
                      'ÁÉÍÓÚÑÜáéíóúñü', 'AEIOUNUaeiounu')) as details,
      ' ' || lower(translate(m.full_name, 'ÁÉÍÓÚÑÜáéíóúñü', 'AEIOUNUaeiounu')) || ' ' as name
    from technician m
  )
  select m.id, m.full_name, m.city, m.years_experience, m.bio, m.rating_avg, m.rating_count, m.is_available, m.service_names
  from searchable m
  where (cardinality(search_technicians.service_slugs) = 0 or m.slugs && search_technicians.service_slugs)
    -- Every word is somewhere in their details.
    and not exists (select 1 from word w where m.details not like '%' || w.pattern || '%')
  order by
    -- Someone looked for by name first: a whole word of their name ("rey" -> Rey Tan),
    -- then the start of one (Lito Reyes).
    (select coalesce(sum(case when m.name like '% ' || w.pattern || ' %' then 2
                              when m.name like '% ' || w.pattern || '%' then 1
                              else 0 end), 0)
     from word w) desc,
    m.is_available desc, m.rating_avg desc, m.rating_count desc, m.full_name
  limit least(greatest(search_technicians.max_results, 1), 50);
$$;

revoke execute on function public.search_technicians(text[], text[], integer) from public;
grant execute on function public.search_technicians(text[], text[], integer) to anon, authenticated;
