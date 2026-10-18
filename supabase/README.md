# PatchUp database (Supabase)

Everything the apps share lives here: the tables, who may read or change each one, and the steps a
booking goes through. The website and the future mobile app both talk to this one database.

```
supabase/
  migrations/                          changes to the database, applied in order
    20261018082037_core_schema.sql     tables
    20261018082113_access_rules.sql    who can read and change what
    20261018082239_booking_actions.sql the booking steps (accept, quote, complete, ...)
  tests/database/                      automated tests for the rules and the booking flow
  config.toml                          settings for the local database
```

## What's stored

| Table                 | What it holds                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| `profiles`            | Everyone with an account: name and role (customer, technician or admin)      |
| `technician_profiles` | Technician details: bio, city, availability, approval status, rating         |
| `technician_services` | Which service categories each technician works in                            |
| `service_categories`  | Plumbing, Electrical, … with each one's inspection fee                        |
| `addresses`           | Customers' saved places, with map pin and landmark                           |
| `bookings`            | Repair requests and their current status                                      |
| `booking_events`      | Each booking's timeline (created, accepted, on the way, …)                    |
| `quotes`              | The technician's price for the repair, sent after diagnosis                   |
| `messages`            | Chat between the customer and the technician                                 |
| `reviews`             | One star rating per completed booking                                         |

A profile is created automatically when someone signs up. The app sends `full_name` and `role`
(`customer` or `technician`) with the sign-up. Nobody can sign up as an admin: you promote people by
hand (see below).

## How a booking moves

```
requested → accepted → en_route → arrived → quoted → in_progress → completed
```

- A customer books a category at one of their saved addresses, optionally choosing a technician.
- Without a chosen technician, the request is open: every approved technician who is available and
  works in that category sees it, and the first to accept gets it. An admin can also assign one.
- The technician marks "on the way" and "arrived", diagnoses the problem, and sends a quote.
- The customer approves (the repair starts) or declines (back to "arrived"; the technician can send a
  new quote or finish with the inspection only).
- On completion, the amount due is the inspection fee plus the approved quote.
- Customers can cancel until the technician arrives; after that only an admin can.

Bookings can't be edited directly. Every step is a database function the app calls, for example
`supabase.rpc('accept_booking', { booking_id })`. Each function checks who is calling and whether
that step is allowed now, and records it on the timeline. The full list of steps, with who may
take each one, is at the top of `migrations/20261018082239_booking_actions.sql`.

The apps get live updates for `bookings`, `booking_events`, `quotes` and `messages` through Supabase
Realtime. People only receive the rows they are allowed to read.

## Set up the hosted project (once)

You need [Node.js](https://nodejs.org) on your computer; the Supabase CLI runs through `npx`.

1. **Create the project.** On [supabase.com](https://supabase.com), create a project named
   `patchup` in the **Southeast Asia (Singapore)** region, the closest to the Philippines. Save the
   database password in a password manager.
2. **Upload the database.** From the repository folder, run:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   The project ref is the code in your project's URL: `https://supabase.com/dashboard/project/<ref>`.
   `db push` applies every file in `migrations/` that hasn't been applied yet. Run it again whenever
   new migrations are added.
3. **Make yourself an admin.** After you've signed up through the app, open **SQL Editor** in the
   Supabase dashboard and run:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

The project's **URL** and **publishable key** (Project Settings → API Keys) are safe to put in the
website and app. The **secret key** (called `service_role` on older projects) bypasses every rule
above: never put it in the website, the app, or git.

## Test the rules

The tests in `tests/database/` sign in as different people (customers, technicians, an admin, a
signed-out visitor) and check what each can see and do, plus the whole booking flow. GitHub Actions
runs them on every pull request.

To run them on your computer you also need [Docker Desktop](https://www.docker.com/products/docker-desktop/)
running:

```bash
npx supabase db start   # local database with all migrations applied
npx supabase test db
```

## Changing the database

Never edit a migration that has already been pushed. Add a new one instead:

```bash
npx supabase migration new add_payments   # creates migrations/<timestamp>_add_payments.sql
```

Write the change there, add or update tests, check them with `npx supabase test db`, then
`npx supabase db push` once it's merged.

Supabase can give a new table full API access by default, even to signed-out visitors. In the same
migration, revoke that access, grant back only what the app needs, and turn on row level security,
the way `20261018082113_access_rules.sql` does for the existing tables.
