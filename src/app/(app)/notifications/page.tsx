import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { PushSettings } from "@/components/notifications/push-settings";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatSchedule } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Notifications" };

// Everything PatchUp has told this person, newest first. (Technicians'
// "Home" is Jobs: the proxy sends them there from the back arrow.)
export default function NotificationsPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Notifications" backHref="/home" />
      <Suspense fallback={<CardsSkeleton />}>
        <NotificationList />
      </Suspense>
    </main>
  );
}

async function NotificationList() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, title, body, url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load your notifications. Refresh the page to try again.</p>;
  }
  const unread = notifications.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      {auth?.claims.sub && <LiveUpdates topics={[`user:${auth.claims.sub}`]} />}
      <MarkRead unread={unread.join(" ")} />
      <PushSettings variant="prompt">Get these on this phone too, even when PatchUp is closed.</PushSettings>

      {notifications.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
          No notifications yet. Updates about your bookings will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                href={n.url}
                className={cn(
                  "flex items-center gap-3 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
                  !n.read_at && "ring-2 ring-brand-navy/25",
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2.5 shrink-0 self-start rounded-full mt-1.5", n.read_at ? "bg-transparent" : "bg-brand-navy")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">
                    {!n.read_at && <span className="sr-only">New: </span>}
                    {n.title}
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-ink">{n.body}</span>}
                  <span className="mt-1 block text-xs text-muted">{formatSchedule(n.created_at)}</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
