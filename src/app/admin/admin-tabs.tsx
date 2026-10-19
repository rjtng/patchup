"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/technicians", label: "Technicians" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/services", label: "Services" },
];

// The admin section's tabs, under its header (it has no bottom navigation).
// The current tab depends on the address, so it's marked once that's known.
export function AdminTabs() {
  return (
    <Suspense fallback={<TabList pathname={null} />}>
      <CurrentTabs />
    </Suspense>
  );
}

function CurrentTabs() {
  return <TabList pathname={usePathname()} />;
}

function TabList({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Admin">
      <ul className="grid grid-cols-4 gap-1 rounded-full bg-white/15 p-1">
        {TABS.map(({ href, label }) => {
          const active =
            pathname !== null &&
            (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  active ? "bg-white text-brand-navy" : "text-white hover:bg-white/10",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
