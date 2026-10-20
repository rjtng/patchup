# PatchUp

A mobile-first web app (PWA) for booking repair services, built from the PatchUp Figma design.

Built with **Next.js 16** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4** and
**Supabase** (database and sign-in).

## Run it

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # Supabase project URL and publishable key
npm run dev
```

Open http://localhost:3000. The app is designed for phone width; on a computer, open your browser's
device toolbar (F12 → toggle device toolbar) and pick a phone, or just narrow the window.

Other scripts:

| Command         | What it does                         |
| --------------- | ------------------------------------ |
| `npm run build` | Production build (also type-checks)  |
| `npm start`     | Serve the production build           |
| `npm run lint`  | Check the code with ESLint           |

GitHub Actions runs `npm run lint`, `npm run build` and the database tests on every pull request and
every push to `main` (see `.github/workflows/ci.yml`).

### Deploying (Vercel)

In the Vercel project, open **Settings → Environment Variables** and add the two variables from
`.env.example` (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) for
Production and Preview. They are built into the app, so redeploy after changing them.

## What's built

| Route                                   | Screen                                              |
| --------------------------------------- | --------------------------------------------------- |
| `/`                                     | Splash (moves on after ~1.6 s)                      |
| `/onboarding`                           | 3 onboarding slides                                 |
| `/welcome`                              | Get started: Sign up / Log in                       |
| `/login`                                | Log in                                              |
| `/signup` → `/signup/verify`            | Sign up (customer or technician) → 6-digit code     |
| `/forgot-password` → `/forgot-password/verify` → `/reset-password` | Password reset flow      |
| `/home`, `/chat`, `/track`, `/bookings`, `/profile` | Customers' five tabs, with the bottom nav   |
| `/jobs`, `/chat`, `/profile`            | Technicians' three tabs (technicians start on Jobs) |
| `/services`                             | All services (Home's More)                          |
| `/services/[slug]`                      | Service category: first available or pick a technician |
| `/services/[slug]/book`                 | Booking form: the problem, visit time, address       |
| `/bookings/[id]`                        | A booking: status, details, quote to approve, timeline, cancel |
| `/jobs/[id]`                            | A job: accept, on the way, arrived, quote, finish    |
| `/receipts/[id]`                        | A done job's receipt (customer, technician, admins), to print or save as a PDF |
| `/track`                                | Customers' coming visits, with a live map while the technician is on the way |
| `/chat/[id]`                            | A booking's chat between the customer and the technician |
| `/search`                               | Search services and technicians (from Home's search box) |
| `/technicians/[id]`                     | A technician's profile: rating, details, reviews, book them |
| `/profile/addresses/new`, `/profile/addresses/[id]` | Add or edit a saved address, with its map pin |
| `/profile/earnings`                     | Technicians' earnings: what PatchUp owes them, this month, payments |
| `/profile/delete` → `/account-deleted`  | Deleting your account                                |
| `/privacy`, `/terms`                    | Privacy Notice and Terms of Service                  |
| `/admin`, `/admin/technicians`, `/admin/bookings`, `/admin/services`, `/admin/payouts` | Admin: overview, approving technicians, assigning and cancelling bookings, the services, paying technicians back |

**Accounts work:** sign up (confirmed with the emailed link or 6-digit code), log in, log out and
password reset use Supabase Auth; email links land on `/auth/confirm`. Signed-out visitors are
sent to Log in, and signed-in people skip the sign-in screens; `src/proxy.ts` handles this and keeps
sessions fresh.

**Services** come from the database: Home shows the first seven and More shows them all, each
with its icon. Admins rename, reorder, hide, re-price or add them under Admin → Services, with no
change to the app (see "Services" in `supabase/README.md`).

**Customers can book:** a category page lists the approved technicians who are taking jobs; the
customer picks one or sends the request to whoever is available, describes the problem, picks a
visit time (in Manila time) and a saved or new address. Bookings are listed under the Bookings tab,
and each has its own page with a timeline and a Cancel button. When the technician sends a
quote, the customer approves or declines it there. Customers can add up to three photos of the problem when they book (or later, until the job is
done); they're made small on the phone before sending, and technicians see them on the job, even
before accepting it. A customer's first booking has the welcome offer
(₱100 to start) taken off what they pay after the visit: Home shows it until they book, and the
booking form, the booking, the quote and the technician's job all show the amount to pay with it.

**Requests nobody takes** are followed up every 5 minutes. After 30 minutes without a technician
(sooner when the visit is under 2 hours away), admins are notified (the bell is on the admin
screens too) so they can assign someone, the customer hears that the PatchUp team is helping, the
technicians who could take it are reminded, and a request for a technician who hasn't answered
opens to the others. If nobody has it by the visit time, it's cancelled and the customer is told;
"Book again" on the booking fills in the form from it, and the first-booking offer still applies.

**Privacy and terms:** the Privacy Notice (`/privacy`) and Terms of Service (`/terms`) describe what
the app actually does, under the Data Privacy Act; sign-up asks people to agree to both (the version
and time are kept with their account), and Profile links to them. Before launch, fill in the
business details in `src/lib/legal.ts` and have a lawyer review both pages. **Deleting an account:**
Profile, then Delete my account, once no booking or job is under way: the person's files go first
(through Storage), then their details; finished bookings, payments and ratings are kept without
their name, and the account can't log in again.

**Paying technicians back:** a customer's first booking has the offer taken off what they pay, so
the technician collects that much less; PatchUp pays it back. The technician's job says so, and
their Earnings (from Profile) show what PatchUp owes them, this month's jobs and cash, and the
payments from PatchUp. Admins see what's owed under Admin → Payouts (from the overview), send it by
GCash or bank, and mark it as paid with the reference; the technician is told.

**No double bookings, and moving a visit:** a technician's jobs under way hold their time, so
nobody can give them another within two hours of one: they can't accept it (their Jobs list marks
such requests), admins can't assign it (the list says who has another job then), and customers asking
for them see those times as taken. Until the technician sets off, the customer (or an admin) can
change the visit time from the booking; the technician is told, and the reminders go again for the
new time.

**Reporting a problem, and moderation:** the customer (from the booking) or the technician (from the
job) taps "Report a problem", says what went wrong and what happened, and admins are told. Admin →
Reports (from the overview) lists the open ones; on the booking's admin page an admin reads the chat,
resolves the report with a note the reporter gets, and can hide a review that breaks the rules (it
stops counting in the rating; the customer is told), remove a chat message (both sides see "Removed
by PatchUp"; it can be put back), or suspend the customer (they can't book until it's lifted, and
Home tells them why).

**Photos and Top technicians:** anyone can add a profile photo from Profile (the app makes it a
small square JPEG); technicians' show on their profile, in search, when picking a technician and on
the customer's Track card, and a customer's own on Home. Home lists Top technicians: approved
technicians taking jobs, those in the city of the customer's latest address first, then by rating.
Track shows each coming visit with the technician's photo and rating, Call (once they've shared a
number), Chat and Cancel, and when and where.

**Receipts:** when the technician marks a job done, it gets a numbered receipt (PU-000001, in
order) listing the inspection fee, each approved repair item and the first-booking offer, adding up
to what was paid in cash. The customer opens it from the booking, the technician from the job and
admins from the admin booking page; it prints (or saves as a PDF) on its own. It's PatchUp's record
of the job, not a BIR official receipt.

**Reminders and late technicians:** the customer is reminded at 6 PM the evening before the visit
(who's coming, when and where), and the technician an hour before, with the address. At the visit
time a technician who hasn't tapped "I'm on my way" is nudged; 30 minutes later, admins are
notified so they can call them or give the job to someone else, and the customer hears that the
PatchUp team is checking.

**Search:** Home's search box opens Search, where results follow as you type. A search can name a
service or describe the problem, in English or Tagalog ("aircon", "leaking faucet", "tubero",
"electrician"), and finds that service; the other words (a name, a city) find approved technicians
by their name, city, description or services, the one searched for by name first, then those
taking jobs, then the best rated. The words for each service are in `src/lib/search.ts`.

**Technicians do the jobs:** they start on Jobs, which lists new requests (ones a customer asked
them for first) and their own jobs, with a switch for whether they're taking new jobs. A job shows
only the area until they accept it; then they get the full address (with a Google Maps link) and
the customer's name, and step through on the way, arrived, quote (item by item), and done, or
finish with the inspection only. Their Profile tab is their work profile: name, mobile number, city, experience,
description and the services they get requests for. New technicians wait for PatchUp's approval:
they send their government ID, NBI clearance and any certificates (photos or PDFs) from Profile,
which admins check on the technician's Admin page before approving them.

**Screens update live:** a new request shows up on technicians' Jobs, a taken one disappears, and
the customer's booking follows each step (accepted, on the way, quote to approve, done) without
anyone refreshing. This uses Supabase Realtime (`src/components/live-updates.tsx`); see "Live
updates" in `supabase/README.md`.

**Notifications:** each step tells the right people: a new request reaches the technicians who could
take it, the customer hears "accepted", "on the way", "quote ready" and "done", the technician hears
the customer's answer and any cancellation. They show on the bell (Home, Jobs) and in Notifications,
and, once someone turns them on (Profile, or the prompt on Jobs and on a booking), on their phone
even when PatchUp is closed. Phone notifications work in Chrome, Edge and Firefox, including on
Android; on iPhone, once PatchUp is added to the Home Screen. See "Notifications" in
`supabase/README.md`.

**Chat:** once a technician has the booking, the customer and the technician can message each
other (Chat tab, or "Message" on the booking or job). Messages arrive live, the Chat tab counts the
chats with something unread, and each new message is a notification too, on the phone as well.
If a technician gives the job back, the next one starts with an empty chat.

**Reviews:** when the job is done, the customer rates it (1 to 5 stars and an optional comment) on
the booking, and the technician hears about it. Reviews, with the reviewer's first name, and the
average rating show on the technician's profile, which customers reach from the technician list
and from their booking; technicians see theirs from Profile.

**Live tracking:** when the technician taps "I'm on my way", their phone shares its location every
few seconds while the job screen is open (it keeps the screen on). The customer follows them on a
map on the Track tab and on the booking, with the distance and a rough arrival time if their
address has a map pin (customers can pin an address with their phone's location when booking).
Sharing stops, and the location is deleted, once the technician arrives. The map uses Leaflet with
[MapTiler](https://www.maptiler.com/)'s streets map: set `NEXT_PUBLIC_MAPTILER_KEY` in Vercel to a
MapTiler API key (in MapTiler, limit the key to PatchUp's web addresses). Without the key the map
falls back to OpenStreetMap's own tiles, which are only meant for light use. MapTiler's free plan
is for non-commercial use and requires its logo on the map (shown, bottom left); once PatchUp has
real customers, move to a paid plan (Flex). See `MAP_TILES` in `src/lib/tracking.ts`.

**Profile:** customers keep their name and mobile number there, and their saved addresses: add,
edit or delete them, and pin each one on the map by tapping it (or with the phone's location). The
technician doing a job and its customer can call each other while the job is under way, if they've
given a number (technicians add theirs on their work profile); nobody else sees it. The Profile
tab also has phone notifications and Log out.

**Admin:** the people who run PatchUp (see "Make yourself an admin" in `supabase/README.md`) get an
Admin link on Profile. The overview counts what needs them (technicians to check, requests nobody
has taken, those waiting too long, jobs running late) and the last 7 days. Under Technicians they see who has
sent their documents, and for each technician the documents themselves (photos shown, PDFs
linked), their sign-up email, services and jobs; then they approve, turn down, suspend or
reinstate them (the technician is told). Admins are notified when a technician sends a document. Under Bookings they give a request to an approved technician (or a job
to another one, until its technician sets off), or cancel a booking with a reason that the customer
and technician see. Under Services they add services and
change their name, inspection fee, icon and order, or hide one; customers see each change right
away. An admin who is also a technician keeps their Jobs screens.

Every step, and the rules behind them (who may see what, who may take which step and when), is in
the database, in `supabase/` (see [its README](supabase/README.md)); the app only picks which
screens to show (`src/lib/roles.ts`). Places still to connect are marked with `TODO` comments.

## Project layout

```
src/
  app/
    (auth)/            sign-in screens (no bottom nav)
    (app)/             the five tabs and their sub-pages (with bottom nav)
    auth/confirm/      where email links land (sign-up confirmation, password reset)
    globals.css        design tokens: colors, gradient, font
    layout.tsx         root layout, metadata, phone-width column
    manifest.ts        PWA manifest ("Add to Home Screen")
  components/
    brand/             PatchUp logo
    layout/            AuthScreen, PageHeader, BottomNav
    ui/                Button, TextField, TextAreaField, PasswordField, Checkbox, OtpInput,
                       EmptyState, CardsSkeleton
    auth/              VerifyCodeForm (shared OTP step)
    bookings/          StatusChip, DetailRow, BookingTimeline, QuoteItems
    notifications/     NotificationBell, PushSettings (phone notifications on this device)
    reviews/           Stars, ReviewItem
    tracking/          TripTracker and TripMap (the customer's map), LocationSharing (the technician's phone)
    live-updates.tsx   keeps a screen current when the database says something changed
  lib/                 helpers and data (service categories, onboarding flag, auth messages,
                       booking labels, visit times and payments, who sees which screens,
                       phone notifications, chat times, distances and arrival estimates)
    supabase/          Supabase clients for the browser, Server Components and the proxy, and
                       the database's TypeScript types (database.types.ts)
  proxy.ts             who may open which screens; refreshes the session
public/                app icons, and sw.js (the service worker that shows phone notifications)
supabase/              database: tables, access rules, booking steps, tests
```

## Design tokens

Colors were sampled from the Figma file and live in `src/app/globals.css`:

| Token          | Value     | Tailwind class examples            |
| -------------- | --------- | ---------------------------------- |
| brand-cyan     | `#5ce1e6` | `text-brand-cyan`                  |
| brand-sky      | `#1690c8` | gradient midpoint                  |
| brand-navy     | `#004aad` | `bg-brand-navy`, `text-brand-navy` |
| brand-yellow   | `#ffde59` | `bg-brand-yellow`                  |
| surface        | `#f4f6ff` | `bg-surface` (app background)      |

`bg-brand-gradient` is the decorative cyan → navy gradient; `bg-brand-gradient-deep` is a darker
version used behind white text so it stays readable. Primary buttons are solid navy for the same
reason.

The font is Montserrat, bundled with the app through `@fontsource-variable/montserrat`.

## Using the real Figma artwork

- **Logo:** `src/components/brand/logo.tsx` draws a gear-and-wrench mark in SVG. To use the exact
  logo, export it from Figma as SVG and replace the paths there (and the icons in `public/`).
- **Onboarding photos:** export them from Figma into `public/onboarding/`, then set `image` on each
  slide in `src/app/(auth)/onboarding/slides.ts`.

## Next steps

1. Finish the Supabase Auth settings: redirect URLs, your own email sending, then the email
   templates (see "Sign-in settings" in `supabase/README.md`).
2. Sign-in with phone codes (needs an SMS provider).
3. Move MapTiler to a paid plan before launch: its free plan is non-commercial (see "Live
   tracking" above).
4. SMS for important notifications (needs an SMS provider such as Semaphore).
5. Delete the sample accounts and bookings before launch.
