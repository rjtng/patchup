"use client";

import { BriefcaseBusiness, CalendarCheck, CircleUserRound, House, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLiveTopics } from "@/components/live-updates";
import { CHAT_READ_EVENT } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

// `match` lists the sections that belong to each tab, so e.g. a service
// category page (reached from Home) keeps Home highlighted.
const customerTabs = [
  { href: "/home", label: "Home", icon: House, match: ["/home", "/services", "/search", "/notifications", "/technicians"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, match: ["/chat"] },
  { href: "/track", label: "Track", icon: MapPin, match: ["/track"] },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck, match: ["/bookings"] },
  { href: "/profile", label: "Profile", icon: CircleUserRound, match: ["/profile"] },
];

const technicianTabs = [
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness, match: ["/jobs", "/notifications"] },
  { href: "/chat", label: "Chat", icon: MessageCircle, match: ["/chat"] },
  { href: "/profile", label: "Profile", icon: CircleUserRound, match: ["/profile", "/technicians"] },
];

// One shared nav for every tab, so the active tab always matches the page
// (in the Figma file, Home stayed highlighted on every screen).
export function BottomNav({ technician, userId }: { technician: boolean; userId?: string }) {
  const pathname = usePathname();
  const tabs = technician ? technicianTabs : customerTabs;
  const unreadChats = useUnreadChats(userId, pathname);
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
                <span className="relative">
                  <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 2} />
                  {href === "/chat" && unreadChats > 0 && (
                    <span
                      aria-hidden
                      className="absolute -right-2.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-yellow px-1 text-[0.6875rem] font-bold text-ink"
                    >
                      {unreadChats}
                    </span>
                  )}
                </span>
                {label}
                {href === "/chat" && unreadChats > 0 && <span className="sr-only">, {unreadChats} unread</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </Bar>
  );
}

// How many chats have messages the person hasn't read: checked when they move
// between screens, when a chat is read, and when a new message arrives (which
// comes with a notification on their user topic).
function useUnreadChats(userId: string | undefined, pathname: string) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    unreadChats().then((n) => n !== null && setCount(n));
  }, []);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    unreadChats().then((n) => current && n !== null && setCount(n));
    return () => {
      current = false;
    };
  }, [userId, pathname]);
  useEffect(() => {
    window.addEventListener(CHAT_READ_EVENT, refresh);
    return () => window.removeEventListener(CHAT_READ_EVENT, refresh);
  }, [refresh]);
  useLiveTopics(userId ? [`user:${userId}`] : [], refresh);

  return userId ? count : 0;
}

async function unreadChats() {
  const { data } = await createClient().rpc("chat_conversations");
  return data ? data.filter((c) => c.unread > 0).length : null;
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
