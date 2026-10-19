import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { serviceCategories } from "@/lib/services";
import { Greeting } from "./greeting";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <main className="pb-6">
      <header className="bg-brand-gradient-deep rounded-b-[2rem] px-6 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="flex min-h-12 items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/90">
              <Greeting />
            </p>
            <p className="text-xl font-bold">What needs fixing today?</p>
          </div>
          <NotificationBell />
        </div>
        <form role="search" action="/search" className="mt-4">
          <label className="flex h-12 items-center gap-3 rounded-full bg-white px-4 text-ink">
            <Search aria-hidden className="size-5 text-brand-navy" />
            <span className="sr-only">Search</span>
            <input
              name="q"
              type="search"
              placeholder="Search a service or technician"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            />
          </label>
        </form>
      </header>

      <section aria-labelledby="offer" className="mx-6 mt-6 rounded-card bg-brand-yellow p-5 text-brand-navy">
        <h2 id="offer" className="text-lg font-bold">
          Today&apos;s offer
        </h2>
        <p className="mt-1 text-sm font-medium">Get ₱100 off your first booking.</p>
      </section>

      <section aria-labelledby="services" className="mt-6 px-6">
        <h2 id="services" className="text-lg font-bold text-ink">
          Services
        </h2>
        <ul className="mt-3 grid grid-cols-4 gap-3">
          {serviceCategories.map(({ slug, name, icon: Icon }) => (
            <li key={slug}>
              <Link
                href={`/services/${slug}`}
                className="flex flex-col items-center gap-2 rounded-card bg-white px-1 py-3 text-center text-xs font-semibold text-ink shadow-sm transition-shadow hover:shadow-md"
              >
                <Icon aria-hidden className="size-8 text-brand-navy" strokeWidth={1.75} />
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
