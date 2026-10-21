# PatchUp database (Supabase)

Everything the apps share lives here: the tables, who may read or change each one, and the steps a
booking goes through. The website and the future mobile app both talk to this one database.

```
supabase/
  migrations/                          changes to the database, applied in order
    20261018082037_core_schema.sql     tables
    20261018082113_access_rules.sql    who can read and change what
    20261018082239_booking_actions.sql the booking steps (accept, quote, complete, ...)
    20261018140443_live_updates.sql    tells open screens when a booking changes
    20261018150000_notifications.sql   notifications, and handing them to send-push
    20261018230000_reviews_and_chat.sql unread chats, message and review notifications
    20261019010000_live_tracking.sql   the technician's location while on the way
  functions/send-push/                 sends phone notifications (Edge Function)
  tests/database/                      automated tests for the rules and the booking flow
  config.toml                          settings for the local database
```

## What's stored

| Table                 | What it holds                                                                 |
| --------------------- | ----------------------------------------------------------------------------- |
| `profiles`            | Everyone with an account: name, role (customer, technician or admin) and profile photo |
| `technician_profiles` | Technician details: bio, city, availability, approval status, rating         |
| `technician_services` | Which service categories each technician works in                            |
| `technician_hours`    | The days each technician works, with their first and last visit time (Manila) |
| `service_categories`  | The services (Plumbing, Electrical, …): name, icon, order, inspection fee, shown or hidden |
| `addresses`           | Customers' saved places, with map pin and landmark                           |
| `technician_documents` | Technicians' ID, NBI clearance and certificates (the files are in Storage) |
| `phone_numbers`       | People's mobile numbers, seen by the other side of a job only while it's under way |
| `bookings`            | Repair requests and their current status                                      |
| `booking_photos`      | Customers' photos of the problem on a booking, up to 3 (the files are in Storage) |
| `first_booking_offer` | The amount taken off a customer's first booking (0 for none)               |
| `booking_events`      | Each booking's timeline (created, accepted, on the way, …)                    |
| `quotes`              | The technician's price for the repair, sent after diagnosis                   |
| `messages`            | Chat between the customer and the technician                                 |
| `chat_reads`          | How far each person has read each chat                                       |
| `technician_locations` | Where a technician on the way is now (only during the trip)                 |
| `receipts`            | One per completed booking: its receipt number (in order) and when it was issued |
| `payouts`, `payout_bookings` | What PatchUp paid each technician back, and for which jobs           |
| `reviews`             | One star rating per completed booking (admins can hide one)                  |
| `reports`             | Problems a customer or technician reported with a booking, and how PatchUp resolved them |
| `account_suspensions` | Customers PatchUp suspended (they can't book new repairs), and why            |
| `notifications`       | What each person has been told (the bell and Notifications), read or not      |
| `push_subscriptions`  | Devices that agreed to show phone notifications, and whose they are           |

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
- A request nobody takes is followed up, and cancelled at the visit time if still nobody has it
  (see "Requests nobody takes" below).

Bookings can't be edited directly. Every step is a database function the app calls, for example
`supabase.rpc('accept_booking', { booking_id })`. Each function checks who is calling and whether
that step is allowed now, and records it on the timeline. The full list of steps, with who may
take each one, is at the top of `migrations/20261018082239_booking_actions.sql`.

## Live updates

When a booking changes, the database tells the people looking at it, so their screens update without
a refresh (`migrations/*_live_updates.sql`). It uses Realtime's Broadcast from the database on
private channels:

| Topic                    | Who can listen                                         | Used by            |
| ------------------------ | ------------------------------------------------------ | ------------------ |
| `booking:<booking id>`   | anyone who can see the booking                         | a booking's page   |
| `user:<user id>`         | that person                                            | Bookings, Jobs     |
| `requests:<category id>` | approved technicians taking jobs in that category      | Jobs (new requests) |

A message only says which booking changed and its new status; the app then reloads the screen
through the API, so the usual access rules decide what it shows. Who may listen is decided by
`private.can_listen()`, which Realtime checks through a policy on `realtime.messages` when someone
joins a channel. The tables are also in the `supabase_realtime` publication, for Postgres Changes if
another app needs them.

## Notifications

Each step of a booking writes notifications for the people it concerns, never the person who took
the step (`migrations/*_notifications.sql` lists who hears what). A notification shows up on the bell
right away (it's also announced on the person's `user:` topic) and, if they've turned on phone
notifications on a device, is sent there by the **send-push** Edge Function
(`functions/send-push`):

```
booking step → notification → pg_net → send-push → the browser's push service → the phone
```

- The database only sends send-push the notification's id. The function picks the notification up
  once (`push_take_delivery`), encrypts it for each of the person's devices and sends it, signed with
  PatchUp's key (Web Push, VAPID). It only ever contacts the known push services (Google, Mozilla,
  Apple, Microsoft), and forgets devices they say are gone.
- The signing key pair is created by send-push on its first run and kept in `private.push_keys`, so
  the private key never leaves Supabase. Browsers get the public half from `push_public_key()`.
- Phone notifications only go out where `private.settings` has `push_function_url` (the hosted
  project). Set up once:

  ```sql
  insert into private.settings (name, value)
  values ('push_function_url', 'https://<project-ref>.supabase.co/functions/v1/send-push');
  ```

  then deploy the function and call it once with an empty body to create the keys:

  ```bash
  npx supabase functions deploy send-push --no-verify-jwt
  curl -X POST https://<project-ref>.supabase.co/functions/v1/send-push -d '{}'
  ```

  The function checks nothing about its caller: all it can be made to do is deliver a notification
  that exists and hasn't been delivered yet, to its owner.

## Chat and reviews

Each booking with a technician has a chat between the customer and that technician (`messages`).
The app sends messages by inserting them, which the access rules allow while the booking has a
technician and isn't cancelled. A technician reads only their own conversation: each message keeps
the technician whose chat it was in, so if one gives the job back, the next starts with an empty
chat (the customer still sees everything).

- `chat_conversations()` lists the signed-in person's chats with the last message and how many are
  unread; `mark_chat_read(booking_id)` marks one read (and its notification).
- A new message is announced live on `booking:<id>` (event `message`, with only its id), and the
  other person gets one notification per chat while it's unread ("2 new messages from Ana", with
  the newest), which also goes to their phone.
- Customers rate a completed booking once with `submit_review` (1 to 5 stars, optional comment).
  The technician is notified, and `technician_profiles.rating_avg` / `rating_count` update by
  themselves. Reviews are public and show only the reviewer's first name.

## Reports and moderation

- `report_problem(booking_id, reason, details)`: the booking's customer or technician reports a
  problem (one open report each per booking); admins are notified. Only the reporter and admins
  read reports.
- `resolve_report(report_id, note)`: admins close it; the reporter gets the note.
- `set_review_hidden(booking_id, hidden)`: admins hide a review (only its customer and admins still
  see it, and it stops counting in the rating; the customer is told), or show it again.
- `set_message_removed(message_id, removed)`: admins replace a message with "Removed by PatchUp"
  for both sides (in the notification that quoted it too), keeping what it said in
  `private.removed_messages` (nobody reads that through the API), or put it back.
- `set_customer_suspended(customer_id, suspended, reason)`: admins suspend a customer
  (`create_booking` refuses them; bookings they have go on) or lift it; they're told either way.
  Technicians are still suspended through their approval status.

## Live tracking

While a technician is on the way (`en_route`), their phone calls `share_location(booking_id,
latitude, longitude, accuracy)` every 10 to 30 seconds. Only the latest position is kept, one row
per booking in `technician_locations`, and only the booking's customer and technician can read it,
only during the trip. Updates more often than every 2 seconds are ignored. Each one is announced
live on `booking:<id>` (event `location`, without the position), and the customer's map reads the
new position through the access rules. When the booking leaves `en_route` (arrived, given back,
cancelled), a trigger deletes the row.

The arrival estimate uses the booking's map pin (`latitude`/`longitude`, copied from the address),
which customers can set from their phone's location when they book.

## Admin

Admins (`profiles.role = 'admin'`) can already read every booking, profile and message, and act
through `set_technician_verification`, `assign_technician` and `cancel_booking`. The admin screens
add three functions, each of which refuses anyone who isn't an admin:

- `admin_overview()`: the dashboard's counts, as JSON (technicians waiting for approval, requests
  nobody has taken and those waiting too long, jobs in progress and those running late, the last 7
  days).
- `admin_technicians(status, technician_id)`: technicians with their sign-up email, services and
  jobs done (both arguments optional).
- `admin_emails(user_ids)`: people's sign-up email, to contact them.

Technicians are told when they're approved, turned down or suspended (a trigger on
`verification_status`, so this also happens when it's changed by hand). When an admin cancels a
booking, the customer and the technician hear that PatchUp cancelled it, with the reason given.
`assign_technician` also gives a job to another technician until its technician sets off; the one
who had it hears that PatchUp gave it to someone else.

## Requests nobody takes

Every 5 minutes a pg_cron job, `follow-up-requests`, runs `private.follow_up_requests()`:

- **Waiting too long:** a request without a technician for 30 minutes, or sooner once the visit is
  less than 2 hours away (but after at least 10 minutes). Admins are notified so they can assign
  someone, the customer hears that the PatchUp team is helping, and the technicians who could take
  it are reminded. A request for a chosen technician who hasn't answered opens to the others. This
  happens once each time a request starts waiting: when it's made, and again if a technician gives
  it back.
- **Visit time reached:** a request still without a technician is cancelled ("No technician was
  free for this time") and the customer is told, with a "Book again" button on the booking that
  fills in the form from it. A cancelled booking doesn't use up the first-booking offer.

Both are booking steps (`overdue` and `expired`) on the timeline. The admin dashboard counts the
requests waiting too long by the same rule (`private.follow_up_at`). To change the timings, change
`private.follow_up_at` in a new migration (and `followUpAt` in `src/lib/admin.ts`). The job's runs
are in `cron.job_run_details`; `select cron.unschedule('follow-up-requests')` stops it. A database
without pg_cron (like the plain Postgres the tests can run on) doesn't follow up on its own.

## Visit reminders and late technicians

Every 5 minutes a second pg_cron job, `follow-up-visits`, runs `private.follow_up_visits()` for jobs
a technician has taken but not set off for:

- **The evening before:** at 6 PM (Manila) the day before the visit, the customer is reminded who's
  coming, when and where (unless they booked after that).
- **An hour before:** the technician is reminded, with the address (unless they took the job within
  that hour).
- **The visit time:** a technician who hasn't tapped "I'm on my way" is nudged to, or to give the job
  back.
- **30 minutes late:** still not on the way (counting from the visit time, or from when the
  technician took the job if that was later): admins are notified so they can call them or give the
  job to someone else, and the customer hears that the PatchUp team is checking. This is a booking
  step (`late`) on the timeline, once for each technician who takes the job; the admin dashboard
  counts these jobs by the same rule (`private.late_at`, and `lateAt` in `src/lib/admin.ts`).

The reminders aren't booking steps; `private.booking_reminders` records the ones sent, so each goes
once (to each technician, for theirs). `select cron.unschedule('follow-up-visits')` stops the job.

## Deleting an account

People delete their own account from Profile, in two steps. `start_account_deletion()` checks they
can (`account_deletion_blocker()`: not while a booking or job of theirs is under way, and not for
admins) and lists their files; for the next hour, storage rules let them remove all of them (their
documents, their bookings' photos), which the app does through Storage so the files themselves go
(deleting `storage.objects` rows with SQL would leave the files behind). `delete_my_account()` then
checks the files are gone and deletes or blanks everything else: addresses, mobile number, phones,
notifications, messages they sent, documents, services, photos, their name, their bookings'
street, pin and description, their name on reviews, and their work profile (suspended, so it's off
the list). Their sign-in gets a placeholder email, no details or password, and a ban, and its
sessions are deleted. Bookings, quotes, ratings and payouts stay, without the person, for
PatchUp's records and the other side's history.

## Search

`search_technicians(terms, service_slugs)` finds approved technicians for the app's Search: those
offering one of the services (when given) whose name, city, description or services contain every
other word (case and accents don't matter; % and _ are just characters). Someone searched for by
name comes first, then those taking jobs, then the best rated. It runs with the searcher's own
access, which already lets anyone see approved technicians, and lists only approved ones even for
admins. The app turns a search into services and words (`src/lib/search.ts`).

## Scheduling

A technician's jobs under way (accepted until done or cancelled) hold their time: none of
`accept_booking`, `assign_technician`, `create_booking` (asking for a technician) or
`reschedule_booking` gives them a job within two hours of another (`private.claim_time`, which also
locks the technician so two can't take the same time at once). `busy_times(technician,
except_booking)` lists when an approved technician is taken, for the app to grey those times out.
`reschedule_booking(booking_id, scheduled_at)` moves a visit, for its customer or an admin, until the
technician sets off: the timeline notes the old time, the technician (if any) is told, the customer is
told when an admin moved it, the reminders go again for the new time, and "running late" counts from
the move.

Working hours (`technician_hours`, set with `set_working_hours(days)`, which replaces the week):
`private.works_at(technician, at)` says whether they work at a time, in Manila, and is true for
anyone who hasn't set hours. `create_booking` refuses a time outside the hours of the technician
asked for, a customer's `reschedule_booking` keeps a visit within them, and new or overdue requests
for any technician notify only those working then. Technicians can still accept any open request,
and admins can assign and move visits regardless. Approved technicians' hours are public, like the
rest of their profile.

Last minute (`private.is_last_minute`): a technician has the job, and it's less than 2 hours to the
visit or they're on the way; not in the first 10 minutes after they took it or its time last changed.

- Once a technician has a visit (or was asked for), its customer moves it at most twice, while it's
  at least 2 hours away, to a time at least 2 hours away. Admins aren't limited.
- `cancel_booking` marks a customer's last-minute cancellation (`booking_events.last_minute`), unless the
  visit time has passed. With 3 in 30 days, `create_booking` refuses them until the first of those
  is 30 days old (`private.booking_paused_until`), and they're told when it pauses.
- `decline_booking` marks a technician's last-minute give-back, and admins are told at once.
- `last_minute_record(person)` gives someone's last-minute cancellations and give-backs in the last
  30 days, and until when booking is paused, to themselves and admins.

## Profile photos and Top technicians

Anyone can add a profile photo: the app uploads a small square JPEG to the private Storage bucket
`avatars` (JPEG, PNG or WebP up to 2 MB), in a folder named after them, and puts its path in
`profiles.avatar_url` (which can only point into their own folder). Someone's current photo is seen
by whoever can see their profile (the profiles access rules: an approved technician's by everyone, a
customer's by themselves, the technicians of their bookings and admins); their other files only by
themselves. People add and remove files in their own folder only, and deleting an account removes
them with their other files (`private.account_files`).

`top_technicians(near_city, max_results)` lists approved technicians taking jobs in a shown service
for Home: those in `near_city` first (case and spaces don't matter), then by rating weighted so a few
reviews count for less (as if each had three more 4-star reviews), then by how many reviews. Like
search, it runs with the caller's own access.

## Booking photos

Customers add up to three photos of the problem to a booking, when they book or later until the job
is done or cancelled, and can remove them until then. The files go to the private Storage bucket
`booking-photos` (JPEG, PNG or WebP up to 5 MB; the app shrinks photos to a JPEG at most 1600 px
across first), each in a folder named after the booking; `booking_photos` lists each booking's.
Whoever can see a booking can see its photos: its customer, its technician, technicians who could
take the open request, and admins. A trigger holds the limit of three.

## First-booking offer

A customer's first booking (not counting ones they cancelled) has the amount in
`first_booking_offer` taken off what they pay: ₱100 to start. `create_booking` records it on the
booking (`bookings.discount`), and `complete_booking` takes it off the inspection fee plus the
approved repair (never below zero). Change the amount in the Table Editor, or set it to 0 to end the
offer; bookings already made keep the discount they were made with. Only admins can change it.
`first_booking_discount()` tells the app what the signed-in customer's next booking would get, so
Home shows the offer only to customers who haven't booked.

The technician collects the discounted amount in cash, so PatchUp pays them back (see "Payouts").

## Receipts

Each completed booking gets a row in `receipts` with the next `number` (an identity, so numbers are
only ever given in order) the moment it's marked done (`private.issue_receipt`, a trigger on
`bookings`; bookings added already done get one too). Jobs done before receipts existed were
numbered in the order they were done. Whoever can see the booking (its customer, its technician,
admins) can read its receipt; nobody can add, change or remove one, and a booking with a receipt
can't be deleted. What the receipt lists comes from the booking: the inspection fee, the approved
quotes' items, and the first-booking offer as it was taken off, adding up to `final_amount`.

## Payouts

What PatchUp owes a technician for a completed job is the first-booking offer as it was taken off
(`private.payback`: never more than the job came to). Admins pay technicians outside the app (GCash,
bank) and record it with `record_payout(technician, amount, reference)`, which pays everything owed
to that technician at once: it refuses an amount that isn't what's owed (more jobs since the admin
looked), records a row in `payouts` and one in `payout_bookings` for each job (so no job is paid
twice), and tells the technician. `paybacks(technician)` lists each job's payback, paid or not, for
the app: admins see anyone's, technicians only their own. Technicians can read their own payouts,
admins all; nobody can change them. The admin dashboard counts what's owed (`payback_owed`, and to
how many technicians).

## Services

The app lists the services from `service_categories`: the active ones (`is_active`), by
`sort_order` then name, each with its `icon` and `inspection_fee`. Admins change them in the app,
under Admin → Services, and customers see each change right away. They can also be changed in the
dashboard's Table Editor; the app then follows within a minute or two:

- **Rename** one with `name`, or **move** it with `sort_order` (Home shows the first seven, then
  More for all of them).
- **Hide** one with `is_active` off: it can't be booked or found any more, but bookings made before
  still show its name, and technicians keep it on their profile for when it's back.
- **Add** one with a `slug` (its address, like `pest-control`, lower-case words joined by dashes;
  don't change it later), a `name`, an `inspection_fee` and a `sort_order`. Technicians who do it
  tick it on their profile. Search finds it by the words of its name; the other words people use
  for each service are in `src/lib/search.ts`.
- **Icon:** one of `air-vent`, `bath`, `brick-wall`, `bug`, `cctv`, `cooking-pot`, `door-open`,
  `drill`, `droplets`, `fan`, `flame`, `hammer`, `key-round`, `lightbulb`, `microwave`,
  `paint-roller`, `plug-zap`, `refrigerator`, `shower-head`, `sofa`, `spray-can`, `sprout`,
  `toolbox`, `truck`, `tv`, `washing-machine`, `wifi` or `wrench` (others show a wrench; the
  list is in `src/components/services/service-icon.tsx`).

Anyone can read every service, hidden ones included; only admins can add or change them. A service
that has bookings can't be deleted: hide it instead.

## Phone numbers

Mobile numbers are optional and kept in `phone_numbers` (one per person, stored as
`+639XXXXXXXXX`), apart from `profiles`, which more people can see. A number is visible to its
owner, to admins, and to the other side of a booking that's under way: from when the technician
accepts (or is assigned) until the job is done or cancelled. That's when the job and the booking
show a Call button.

## Technician documents

Technicians send their government ID, NBI clearance and any certificates from Profile. The files go
to the private Storage bucket `technician-documents` (photos and PDFs, up to 10 MB), each in a
folder named after the technician's id; `technician_documents` records what each file is. Storage
policies let technicians upload only to their own folder, and remove files only until they're
approved; only they and admins can read the files (the app shows them through links that expire
after an hour). Admins get a notification for each new document.

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

4. **Approve technicians.** New technicians can't get jobs until they're approved. In the app, go
   to Profile → Admin → Technicians: each technician's page shows the ID, NBI clearance and
   certificates they sent, and their sign-up email if you need to ask for more.

The app shows technicians their own screens (Jobs) based on the account type they chose at
sign-up, kept in their account details. If you ever change someone between customer and technician
by hand, change that too, or they'll keep seeing the old screens (it takes effect when their session
next refreshes, within the hour, or when they log in again):

```sql
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role": "technician"}'
where email = 'technician@example.com';
```

The project's **URL** and **publishable key** (Project Settings → API Keys) are safe to put in the
website and app. The **secret key** (called `service_role` on older projects) bypasses every rule
above: never put it in the website, the app, or git.

## Sign-in settings (dashboard, once)

The app signs people in with email and password. New accounts and password resets are confirmed
from the email Supabase sends: either by tapping its link (handled by `src/app/auth/confirm`) or by
typing its 6-digit code into the app. These dashboard settings make that work:

1. **Site URL and Redirect URLs** (Authentication → URL Configuration). Set **Site URL** to the live
   address, `https://patchup-gules.vercel.app`, and add these **Redirect URLs** so the email links
   can come back to production, to Vercel previews, and to your computer:

   ```
   https://patchup-gules.vercel.app/**
   https://*-error421.vercel.app/**
   http://localhost:3000/**
   ```

2. **Your own email sending, before anyone outside the team signs up.** Supabase's built-in email
   only delivers to members of your Supabase organization, a few emails per hour, and doesn't let you
   edit the templates. Everyone else sees "We can't send email to this address yet". Create an
   account with an email service such as [Resend](https://resend.com), verify your domain there, and
   enter its SMTP details under Authentication → Emails → SMTP Settings.

3. **Email templates, once custom SMTP is on** (Authentication → Emails → Templates). Supabase's
   default emails only have a link, which works only in the browser where the person signed up. These
   versions have a link that works on any device, plus the 6-digit code:

   **Confirm sign up**, subject `Your PatchUp code: {{ .Token }}`

   ```html
   <h2>Welcome to PatchUp</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm my email</a></p>
   <p>Or enter this code in the app:</p>
   <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px">{{ .Token }}</p>
   <p>If you didn't sign up for PatchUp, you can ignore this email.</p>
   ```

   **Reset password**, subject `Your PatchUp reset code: {{ .Token }}`

   ```html
   <h2>Reset your PatchUp password</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
   <p>Or enter this code in the app:</p>
   <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px">{{ .Token }}</p>
   <p>If you didn't ask to reset your password, you can ignore this email.</p>
   ```

4. **Minimum password length: 8** (Authentication → Sign In / Providers → Email), to match what the
   app asks for.

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

After pushing, regenerate the app's TypeScript types so its queries are checked against the new
tables (`npm run build` catches any that no longer match):

```bash
npx supabase gen types typescript --project-id vfipnxfyzhldhryyrcwe > src/lib/supabase/database.types.ts
```

Supabase can give a new table full API access by default, even to signed-out visitors. In the same
migration, revoke that access, grant back only what the app needs, and turn on row level security,
the way `20261018082113_access_rules.sql` does for the existing tables.
