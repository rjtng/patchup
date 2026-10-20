import { Ellipsis, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ServiceIcon } from "@/components/services/service-icon";
import { getServiceCategories } from "@/lib/services";
import { FirstBookingOffer } from "./first-booking-offer";
import { Greeting } from "./greeting";
import { MyPhoto, MyPhotoPlaceholder } from "./my-photo";
import { TopTechnicians } from "./top-technicians";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  // Two rows of four: the first seven services, then More for all of them.
  const services = (await getServiceCategories()).slice(0, 7);

  return (
    <main className="pb-6">
      <header className="bg-brand-gradient-deep rounded-b-[2rem] px-6 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="flex min-h-12 items-center gap-3">
          <Suspense fallback={<MyPhotoPlaceholder />}>
            <MyPhoto />
          </Suspense>
          <div className="min-w-0 flex-1">
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

      <Suspense>
        <FirstBookingOffer />
      </Suspense>

      <section aria-labelledby="services" className="mt-6 px-6">
        <h2 id="services" className="text-lg font-bold text-ink">
          Services
        </h2>
        <ul className="mt-3 grid grid-cols-4 gap-3">
          {services.map(({ slug, name, icon }) => (
            <ServiceTile
              key={slug}
              href={`/services/${slug}`}
              icon={<ServiceIcon name={icon} {...TILE_ICON} />}
              name={name}
            />
          ))}
          <ServiceTile
            href="/services"
            icon={<Ellipsis aria-hidden {...TILE_ICON} />}
            name="More"
            label="More services"
          />
        </ul>
      </section>

      <Suspense>
        <TopTechnicians />
      </Suspense>
    </main>
  );
}

const TILE_ICON = { className: "size-8 text-brand-navy", strokeWidth: 1.75 };

function ServiceTile({ href, icon, name, label }: { href: string; icon: ReactNode; name: string; label?: string }) {
  return (
    <li>
      <Link
        href={href}
        aria-label={label}
        className="flex h-full flex-col items-center gap-2 rounded-card bg-white px-1 py-3 text-center text-xs font-semibold text-ink shadow-sm transition-shadow hover:shadow-md"
      >
        {icon}
        {name}
      </Link>
    </li>
  );
}
