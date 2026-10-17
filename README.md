# PatchUp

A mobile-first web app (PWA) for booking repair services, built from the PatchUp Figma design.

Built with **Next.js 16** (App Router), **React 19**, **TypeScript** and **Tailwind CSS 4**.

## Run it

You need [Node.js](https://nodejs.org) 20.9 or newer.

```bash
npm install
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
| `/services/[slug]`                      | Service category (Plumbing, Electrical, …)          |

The forms validate input and move to the next screen, but **nothing is saved yet**: every place that
needs the backend is marked with a `TODO` comment (search the project for `TODO`).

## Project layout

```
src/
  app/
    (auth)/            sign-in screens (no bottom nav)
    (app)/             the five tabs and their sub-pages (with bottom nav)
    globals.css        design tokens: colors, gradient, font
    layout.tsx         root layout, metadata, phone-width column
    manifest.ts        PWA manifest ("Add to Home Screen")
  components/
    brand/             PatchUp logo
    layout/            AuthScreen, PageHeader, BottomNav
    ui/                Button, TextField, PasswordField, Checkbox, OtpInput, EmptyState
    auth/              VerifyCodeForm (shared OTP step)
  lib/                 helpers and data (service categories, onboarding flag)
public/                app icons
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

1. Create a [Supabase](https://supabase.com) project and connect auth (email, phone OTP).
2. Database tables: profiles (with customer/technician role), technicians, services, bookings,
   reviews, messages.
3. Technician list and profile → booking flow (service, date and time, address, confirm).
4. Bookings list and details, chat, notifications, tracking, reviews.
5. Deploy to [Vercel](https://vercel.com).
