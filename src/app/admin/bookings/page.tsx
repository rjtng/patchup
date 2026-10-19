import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CHIP_TONES, StatusChip } from "@/components/bookings/status-chip";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { BOOKING_FILTERS, bookingFilter, formatWaiting, STALE_AFTER_MS, type BookingFilter } from "@/lib/admin";
import { formatDay, formatPeso, formatSchedule } from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { Filters } from "../filters";

export const metadata: Metadata = { title: "Bookings" };

// How each list is sorted: requests waiting longest first, jobs by visit
// time, finished ones latest first.
const ORDER: Record<BookingFilter, { column: "created_at" | "scheduled_at" | "completed_at" | "cancelled_at"; ascending: boolean }> = {
  open: { column: "created_at", ascending: true },
  active: { column: "scheduled_at", ascending: true },
  done: { column: "completed_at", ascending: false },
  cancelled: { column: "cancelled_at", ascending: false },
};

const NONE: Record<BookingFilter, string> = {
  open: "No requests are waiting for a technician.",
  active: "No jobs in progress.",
  done: "No jobs done yet.",
  cancelled: "No cancelled bookings.",
};

const LIMIT = 100;

export default function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <main className="pb-6">
      <Suspense fallback={<CardsSkeleton />}>
        <BookingList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BookingList({ searchParams }: { searchParams: PageProps<"/admin/bookings">["searchParams"] }) {
  const show = bookingFilter((await searchParams).show);
  const filter = BOOKING_FILTERS.find((f) => f.value === show)!;
  const supabase = await createClient();
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, status, appliance, scheduled_at, created_at, completed_at, cancelled_at, barangay, city, technician_id, final_amount, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), technician:profiles!bookings_technician_id_fkey(full_name)",
    )
    .in("status", filter.statuses)
    .order(ORDER[show].column, { ascending: ORDER[show].ascending })
    .limit(LIMIT);
  // Read once per request, after the data above, for how long requests have waited.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <Filters
        label="Show bookings"
        options={BOOKING_FILTERS.map((f) => ({ href: `/admin/bookings?show=${f.value}`, label: f.label, active: f.value === show }))}
      />
      {error ? (
        <p className="text-sm text-danger">We couldn&apos;t load the bookings. Refresh the page to try again.</p>
      ) : bookings.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">{NONE[show]}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {bookings.map((b) => {
              const waited = now - Date.parse(b.created_at);
              const customer = b.customer?.full_name || "A customer";
              const technician = b.technician?.full_name || (b.technician_id ? "A technician" : null);
              return (
                <li key={b.id}>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">
                        {b.service_categories?.name}: {b.appliance}
                      </span>
                      <span className="block truncate text-sm text-ink">
                        {customer}
                        {technician ? ` with ${technician}` : ""}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {formatSchedule(b.scheduled_at)} · {b.barangay}, {b.city}
                      </span>
                      {b.status === "completed" && b.completed_at && (
                        <span className="block text-sm text-muted">
                          Done {formatDay(b.completed_at)}
                          {b.final_amount != null && ` · ${formatPeso(b.final_amount)}`}
                        </span>
                      )}
                      {b.status === "cancelled" && b.cancelled_at && (
                        <span className="block text-sm text-muted">Cancelled {formatDay(b.cancelled_at)}</span>
                      )}
                      <span className="mt-2 flex flex-wrap gap-2">
                        {b.status === "requested" ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                              b.technician_id
                                ? CHIP_TONES.active
                                : waited >= STALE_AFTER_MS
                                  ? CHIP_TONES.cancelled
                                  : CHIP_TONES.waiting,
                            )}
                          >
                            {b.technician_id
                              ? `Waiting for ${b.technician?.full_name ? firstName(b.technician.full_name) : "the technician"}`
                              : "Nobody has taken it"}{" "}
                            · {formatWaiting(waited)}
                          </span>
                        ) : (
                          <StatusChip status={b.status} />
                        )}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {bookings.length === LIMIT && <p className="text-sm text-muted">Showing the first {LIMIT}.</p>}
        </>
      )}
    </div>
  );
}
