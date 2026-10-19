import { CalendarClock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { TripTracker } from "@/components/tracking/trip-tracker";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatSchedule } from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { pin } from "@/lib/tracking";

export const metadata: Metadata = { title: "Track" };

export default function TrackPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Track" />
      <Suspense fallback={<CardsSkeleton count={2} />}>
        <Visits />
      </Suspense>
    </main>
  );
}

// The customer's coming visits: a live map for a technician on the way, and
// when the others are due.
async function Visits() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims.sub ?? "";
  const { data: visits, error } = await supabase
    .from("bookings")
    .select(
      "id, status, appliance, scheduled_at, latitude, longitude, service_categories(name), technician:profiles!bookings_technician_id_fkey(full_name)",
    )
    .eq("customer_id", me)
    .in("status", ["accepted", "en_route"])
    .order("scheduled_at");
  const live = <LiveUpdates topics={[`user:${me}`]} />;
  // Where the technicians on the way are (see TripTracker).
  const onTheWay = (visits ?? []).filter((v) => v.status === "en_route").map((v) => v.id);
  const { data: locations } = onTheWay.length
    ? await supabase
        .from("technician_locations")
        .select("booking_id, latitude, longitude, accuracy, updated_at")
        .in("booking_id", onTheWay)
    : { data: [] };

  if (error) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load your visits. Refresh the page to try again.</p>;
  }
  if (visits.length === 0) {
    return (
      <>
        {live}
        <EmptyState icon={MapPin} title="Nothing to track right now">
          When a technician is on the way, you&apos;ll see where they are and about how long they&apos;ll be.
        </EmptyState>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      {live}
      {visits.map((v) => {
        const technician = v.technician?.full_name || null;
        const what = `${v.service_categories?.name}: ${v.appliance}`;
        return (
          <div key={v.id} className="flex flex-col gap-2">
            <Link href={`/bookings/${v.id}`} className="text-sm font-semibold text-brand-navy underline">
              {what}
            </Link>
            {v.status === "en_route" ? (
              <TripTracker
                bookingId={v.id}
                technicianName={technician}
                destination={pin(v)}
                initial={locations?.find((l) => l.booking_id === v.id) ?? null}
              />
            ) : (
              <section aria-label={what} className="flex items-start gap-3 rounded-card bg-white p-5 shadow-sm">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy">
                  <CalendarClock aria-hidden className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-bold text-ink">
                    {technician ? firstName(technician) : "Your technician"} is coming {formatSchedule(v.scheduled_at)}
                  </h2>
                  <p className="text-sm text-muted">You can follow them here once they&apos;re on the way.</p>
                </div>
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
