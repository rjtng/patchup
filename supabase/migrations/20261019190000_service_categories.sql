-- Services from the database: the app lists the active service categories
-- (Home, All services, Search) in their sort order, each with an icon, so a
-- service can be renamed, reordered, hidden or added without changing the app.
--
-- Icons are named from the set the app has (ICONS in src/lib/services.ts,
-- like "shower-head" or "air-vent"); a name it doesn't have shows a wrench.

alter table public.service_categories
  add column icon text not null default 'wrench' check (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

update public.service_categories c set icon = v.icon
from (values
  ('plumbing', 'shower-head'),
  ('repairing', 'drill'),
  ('electrical', 'plug-zap'),
  ('carpentry', 'hammer'),
  ('cleaning', 'spray-can'),
  ('painting', 'paint-roller'),
  ('handyman', 'toolbox')
) as v (slug, icon)
where c.slug = v.slug;

grant insert (icon), update (icon) on public.service_categories to authenticated;

-- Everyone can read every category, hidden ones included, so bookings made
-- before a service was hidden still show its name. The app lists only the
-- active ones, and create_booking still refuses a hidden one.
drop policy "Anyone can see active categories" on public.service_categories;
drop policy "Admins see all categories" on public.service_categories;

create policy "Anyone can see the categories"
  on public.service_categories for select to anon, authenticated
  using (true);
