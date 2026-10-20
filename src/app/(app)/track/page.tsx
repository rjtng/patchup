import { MapPin, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { Avatar } from "@/components/people/avatar";
import { TripTracker } from "@/components/tracking/trip-tracker";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatSchedule, takenAt } from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { profilePhotos } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/server";
import { pin } from "@/lib/tracking";
import { VisitActions } from "./visit-actions";

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
// for each, who's coming (photo, rating), Call, Chat and Cancel, and when and
// where.
async function Visits() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims.sub ?? "";
  const { data: visits, error } = await supabase
    .from("bookings")
    .select(
      "id, status, technician_id, created_at, appliance, scheduled_at, street, barangay, city, latitude, longitude, service_categories(name), technician:profiles!bookings_technician_id_fkey(full_name), booking_events(event, created_at)",
    )
    .eq("customer_id", me)
    .in("status", ["accepted", "en_route"])
    .order("scheduled_at");
  const live = <LiveUpdates topics={[`user:${me}`]} />;
  // Where the technicians on the way are (see TripTracker).
  const onTheWay = (visits ?? []).filter((v) => v.status === "en_route").map((v) => v.id);
  const technicians = [...new Set((visits ?? []).flatMap((v) => (v.technician_id ? [v.technician_id] : [])))];
  const [{ data: locations }, { data: ratings }, { data: phones }, photos, { data: record }] = await Promise.all([
    onTheWay.length
      ? supabase
          .from("technician_locations")
          .select("booking_id, latitude, longitude, accuracy, updated_at")
          .in("booking_id", onTheWay)
      : { data: [] },
    supabase.from("technician_profiles").select("id, rating_avg, rating_count").in("id", technicians),
    // Their numbers, while the job is under way (the access rules return them only then).
    supabase.from("phone_numbers").select("user_id, phone").in("user_id", technicians),
    profilePhotos(supabase, technicians),
    // For the warning when cancelling at the last minute.
    supabase.rpc("last_minute_record").single(),
  ]);

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
        const who = technician ? firstName(technician) : "your technician";
        const what = `${v.service_categories?.name}: ${v.appliance}`;
        const rating = ratings?.find((r) => r.id === v.technician_id);
        const enRoute = v.status === "en_route";
        return (
          <div key={v.id} className="flex flex-col gap-3">
            {enRoute && (
              <TripTracker
                bookingId={v.id}
                technicianName={technician}
                destination={pin(v)}
                initial={locations?.find((l) => l.booking_id === v.id) ?? null}
              />
            )}
            <section aria-label={what} className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Avatar
                  name={technician ?? "?"}
                  photo={v.technician_id ? photos.get(v.technician_id) : null}
                  className="size-14 rounded-xl text-xl"
                />
                <div className="min-w-0 flex-1">
                  {v.technician_id ? (
                    <Link
                      href={`/technicians/${v.technician_id}?back=/track`}
                      className="block truncate font-bold text-ink hover:underline"
                    >
                      {technician ?? "Your technician"}
                    </Link>
                  ) : (
                    <p className="font-bold text-ink">Your technician</p>
                  )}
                  <p className="truncate text-sm text-muted">{what}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-ink">
                    {rating && rating.rating_count > 0 ? (
                      <>
                        <Star aria-hidden className="size-4 fill-brand-yellow text-brand-yellow" />
                        {rating.rating_avg.toFixed(1)} (
                        {rating.rating_count === 1 ? "1 review" : `${rating.rating_count} reviews`})
                      </>
                    ) : (
                      <span className="text-muted">New on PatchUp</span>
                    )}
                  </p>
                </div>
              </div>
              <VisitActions
                bookingId={v.id}
                who={who}
                phone={phones?.find((p) => p.user_id === v.technician_id)?.phone ?? null}
                check={{
                  status: v.status,
                  scheduledAt: v.scheduled_at,
                  takenAt: takenAt(v),
                  who,
                  cancellations: record?.cancellations ?? 0,
                }}
              />
              <div className="border-t border-line pt-4 text-sm">
                {enRoute ? (
                  <p className="font-semibold text-ink">Booked for {formatSchedule(v.scheduled_at)}</p>
                ) : (
                  <h2 className="font-bold text-ink">
                    {technician ? who : "Your technician"} is coming {formatSchedule(v.scheduled_at)}
                  </h2>
                )}
                <p className="text-muted">
                  {v.street}, {v.barangay}, {v.city}
                </p>
                {!enRoute && <p className="mt-1 text-muted">You can follow them here once they&apos;re on the way.</p>}
                <Link href={`/bookings/${v.id}`} className="mt-2 inline-block font-semibold text-brand-navy underline">
                  See booking
                </Link>
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
}
