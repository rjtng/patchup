"use client";

import { BriefcaseBusiness, CalendarCheck, CircleUserRound, House, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// `match` lists the sections that belong to each tab, so e.g. a service
// category page (reached from Home) keeps Home highlighted.
const customerTabs = [
  { href: "/home", label: "Home", icon: House, match: ["/home", "/services", "/search", "/notifications"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, match: ["/chat"] },
  { href: "/track", label: "Track", icon: MapPin, match: ["/track"] },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck, match: ["/bookings"] },
  { href: "/profile", label: "Profile", icon: CircleUserRound, match: ["/profile"] },
];

const technicianTabs = [
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness, match: ["/jobs"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, match: ["/chat"] },
  { href: "/profile", label: "Profile", icon: CircleUserRound, match: ["/profile"] },
];

// One shared nav for every tab, so the active tab always matches the page
// (in the Figma file, Home stayed highlighted on every screen).
export function BottomNav({ technician }: { technician: boolean }) {
  const pathname = usePathname();
  const tabs = technician ? technicianTabs : customerTabs;
  return (
    <Bar>
      <ul className={technician ? "grid grid-cols-3" : "grid grid-cols-5"}>
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors",
                  active ? "text-brand-yellow" : "text-white/80 hover:text-white",
                )}
              >
                <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </Bar>
  );
}

// Shown until the page knows who is signed in (and so which tabs they have).
export function BottomNavFallback() {
  return (
    <Bar>
      <div className="h-16" />
    </Bar>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className="pb-safe sticky bottom-0 z-20 mt-auto bg-brand-navy text-white shadow-[0_-6px_20px_rgba(0,74,173,0.2)]"
    >
      {children}
    </nav>
  );
}
