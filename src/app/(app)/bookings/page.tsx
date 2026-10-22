import { CalendarCheck, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatusChip } from "@/components/bookings/status-chip";
import { ReturnVisitChip } from "@/components/bookings/warranty";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatSchedule, isFinished } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bookings" };

export default function BookingsPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Bookings" />
      <Suspense fallback={<CardsSkeleton />}>
        <BookingList />
      </Suspense>
    </main>
  );
}

async function BookingList() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims.sub ?? "";
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, status, appliance, scheduled_at, return_of, service_categories(name), reviews(rating)")
    .eq("customer_id", me)
    .order("scheduled_at");
  const live = <LiveUpdates topics={[`user:${me}`]} />;

  if (error) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load your bookings. Refresh the page to try again.</p>;
  }
  if (bookings.length === 0) {
    return (
      <>
        {live}
        <EmptyState icon={CalendarCheck} title="No bookings yet">
          Your upcoming and past repairs will be listed here.
        </EmptyState>
        <div className="px-6">
          <ButtonLink href="/home">Find a service</ButtonLink>
        </div>
      </>
    );
  }

  const upcoming = bookings.filter((b) => !isFinished(b.status));
  const past = bookings.filter((b) => isFinished(b.status)).reverse();

  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      {live}
      {[
        { title: "Upcoming", list: upcoming },
        { title: "Past", list: past },
      ]
        .filter((group) => group.list.length > 0)
        .map((group) => (
          <section key={group.title} aria-label={group.title} className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-ink">{group.title}</h2>
            <ul className="flex flex-col gap-3">
              {group.list.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">
                        {b.service_categories?.name}: {b.appliance}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{formatSchedule(b.scheduled_at)}</span>
                      <span className="mt-2 flex flex-wrap gap-2">
                        <StatusChip status={b.status} />
                        {b.return_of && <ReturnVisitChip />}
                        {b.status === "completed" && !b.reviews && (
                          <span className="inline-flex rounded-full bg-brand-yellow px-3 py-1 text-xs font-semibold text-ink">
                            Rate your repair
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
