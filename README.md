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
| `/home`, `/chat`, `/track`, `/bookings`, `/profile` | The five tabs, with the bottom nav          |
| `/services/[slug]`                      | Service category: first available or pick a technician |
| `/services/[slug]/book`                 | Booking form: the problem, visit time, address       |
| `/bookings/[id]`                        | A booking: status, details, timeline, cancel         |

**Accounts work:** sign up (confirmed with the emailed link or 6-digit code), log in, log out and
password reset use Supabase Auth; email links land on `/auth/confirm`. Signed-out visitors are
sent to Log in, and signed-in people skip the sign-in screens; `src/proxy.ts` handles this and keeps
sessions fresh.

**Customers can book:** a category page lists the approved technicians who are taking jobs; the
customer picks one or sends the request to whoever is available, describes the problem, picks a
visit time (in Manila time) and a saved or new address. Bookings are listed under the Bookings tab,
and each has its own page with a timeline and a Cancel button. Booking, cancelling and the rules
behind them (who may see what, when a booking can be cancelled) are in the database, in
`supabase/` (see [its README](supabase/README.md)). Places still to connect are marked with `TODO`
comments.

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
    bookings/          StatusChip
  lib/                 helpers and data (service categories, onboarding flag, auth messages,
                       booking labels and visit times)
    supabase/          Supabase clients for the browser, Server Components and the proxy, and
                       the database's TypeScript types (database.types.ts)
  proxy.ts             who may open which screens; refreshes the session
public/                app icons
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
3. Technician screens: accept or decline requests, mark "on the way" and "arrived", send the
   quote, complete the job.
4. Customers: approve or decline a quote, review the technician; chat, notifications, live tracking.
5. An admin dashboard to approve technicians and assign jobs.
