import { CalendarCheck, CalendarClock, Mail, MapPin, Phone, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingPhotos } from "@/components/bookings/booking-photos";
import { DetailRow } from "@/components/bookings/detail-row";
import { QuoteItems } from "@/components/bookings/quote-items";
import { StatusChip } from "@/components/bookings/status-chip";
import { BookingTimeline } from "@/components/bookings/timeline";
import { LiveUpdates } from "@/components/live-updates";
import { Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { BOOKING_FILTERS, lateAt, takenAt } from "@/lib/admin";
import { PHOTO_BUCKET } from "@/lib/booking-photos";
import { amountDue, dueParts, formatPeso, formatSchedule, fullAddress, isFinished, mapsLink, quoteItems } from "@/lib/bookings";
import { withSignedUrls } from "@/lib/documents";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { ListLink } from "../../list-link";
import { AdminCancel } from "./admin-cancel";
import { AssignTechnician } from "./assign-technician";

export const metadata: Metadata = { title: "Booking" };

export default function AdminBookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <div className="px-6 pt-3">
              <ListLink href="/admin/bookings">All bookings</ListLink>
            </div>
            <CardsSkeleton count={4} />
          </>
        }
      >
        <BookingDetails params={params} />
      </Suspense>
    </main>
  );
}

const QUOTE_STATUS = { pending: "Waiting for the customer", approved: "Approved", declined: "Declined" };

async function BookingDetails({ params }: { params: PageProps<"/admin/bookings/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, technician_id, category_id, created_at, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, latitude, longitude, inspection_fee, discount, final_amount, cancel_reason, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), technician:profiles!bookings_technician_id_fkey(full_name), booking_events(id, event, note, created_at), quotes(id, items, total, note, status, created_at), reviews(rating, comment), booking_photos(id, storage_path, created_at)",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .order("created_at", { referencedTable: "quotes" })
    .order("created_at", { referencedTable: "booking_photos" })
    .maybeSingle();
  if (!booking) {
    return (
      <>
        <div className="px-6 pt-3">
          <ListLink href="/admin/bookings">All bookings</ListLink>
        </div>
        <EmptyState icon={CalendarCheck} title="Booking not found" />
      </>
    );
  }

  const people = [booking.customer_id, booking.technician_id].filter((p): p is string => p !== null);
  const [{ data: emails }, { data: phones }, { data: technicians }] = await Promise.all([
    supabase.rpc("admin_emails", { user_ids: people }),
    supabase.from("phone_numbers").select("user_id, phone").in("user_id", people),
    // Who could do it: approved technicians in this service (also for a job whose technician hasn't set off).
    booking.status === "requested" || booking.status === "accepted"
      ? supabase
          .from("technician_profiles")
          .select("id, city, is_available, rating_avg, rating_count, profiles(full_name), technician_services!inner(category_id)")
          .eq("technician_services.category_id", booking.category_id)
          .eq("verification_status", "approved")
      : Promise.resolve({ data: null }),
  ]);
  const emailOf = (userId: string | null) => emails?.find((e) => e.id === userId)?.email ?? null;
  const phoneOf = (userId: string | null) => phones?.find((p) => p.user_id === userId)?.phone ?? null;
  const list = BOOKING_FILTERS.find((f) => (f.statuses as readonly string[]).includes(booking.status))?.value ?? "open";
  const due = amountDue(booking);
  const photos = await withSignedUrls(supabase, booking.booking_photos, PHOTO_BUCKET);
  const customerName = booking.customer?.full_name || "The customer";
  const technicianName = booking.technician?.full_name || null;
  // A technician who hasn't set off by now: read once per request, after the data above.
  const late =
    booking.status === "accepted" &&
    // eslint-disable-next-line react-hooks/purity
    Date.now() >= lateAt(Date.parse(booking.scheduled_at), takenAt(booking));

  return (
    <div className="flex flex-col gap-4 px-6">
      <div className="pt-3">
        <ListLink href={`/admin/bookings?show=${list}`}>All bookings</ListLink>
      </div>
      <LiveUpdates topics={[`booking:${booking.id}`]} />
      <section className="rounded-card bg-white p-5 shadow-sm">
        <StatusChip status={booking.status} />
        <h2 className="mt-3 text-xl font-bold text-ink">
          {booking.service_categories?.name}: {booking.appliance}
        </h2>
        {booking.brand && <p className="text-sm text-muted">{booking.brand}</p>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{booking.problem}</p>
      </section>

      <BookingPhotos bookingId={booking.id} photos={photos} editable={false} intro="From the customer." />

      {(booking.status === "requested" || booking.status === "accepted") && technicians && (
        <AssignTechnician
          bookingId={booking.id}
          category={booking.service_categories?.name ?? "this service"}
          askedFor={booking.status === "requested" ? booking.technician_id : null}
          current={
            booking.status === "accepted" && booking.technician_id
              ? {
                  id: booking.technician_id,
                  name: technicianName ?? "The technician",
                  late,
                }
              : null
          }
          technicians={technicians
            .map((t) => ({
              id: t.id,
              name: t.profiles?.full_name || "No name yet",
              city: t.city,
              available: t.is_available,
              rating: Number(t.rating_avg),
              reviews: t.rating_count,
            }))
            // Those taking jobs first, then the best rated.
            .sort((a, b) => Number(b.available) - Number(a.available) || b.rating - a.rating)}
        />
      )}

      <section aria-label="People" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={UserRound} label="Customer">
          {customerName}
          <Email address={emailOf(booking.customer_id)} />
          <PhoneNumber phone={phoneOf(booking.customer_id)} />
        </DetailRow>
        <DetailRow icon={Wrench} label={booking.status === "requested" && booking.technician_id ? "Asked for" : "Technician"}>
          {booking.technician_id ? (
            <>
              <Link href={`/admin/technicians/${booking.technician_id}`} className="font-semibold text-brand-navy underline">
                {technicianName ?? "No name yet"}
              </Link>
              <Email address={emailOf(booking.technician_id)} />
              <PhoneNumber phone={phoneOf(booking.technician_id)} />
            </>
          ) : (
            "Nobody yet"
          )}
        </DetailRow>
      </section>

      <section aria-label="Details" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={CalendarClock} label="Visit">
          {formatSchedule(booking.scheduled_at)}
        </DetailRow>
        <DetailRow icon={MapPin} label="Address">
          {fullAddress(booking)}
          {booking.landmark && <span className="block text-muted">{booking.landmark}</span>}
          <a
            href={mapsLink(booking)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block w-fit font-semibold text-brand-navy underline"
          >
            Open in Maps
          </a>
        </DetailRow>
        <DetailRow
          icon={Wrench}
          label={
            booking.final_amount != null ? "Total paid" : due.repair > 0 || due.discount > 0 ? "To pay" : "Inspection fee"
          }
        >
          {formatPeso(booking.final_amount ?? due.total)}
          <span className="block text-muted">
            {due.repair > 0 || due.discount > 0 ? `${dueParts(due)}, in cash` : "In cash"}
          </span>
        </DetailRow>
      </section>

      {booking.quotes.map((quote) => (
        <section key={quote.id} aria-label="Quote" className="rounded-card bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Repair quote</h2>
            <span className="text-xs font-semibold text-muted">{QUOTE_STATUS[quote.status]}</span>
          </div>
          <QuoteItems items={quoteItems(quote.items)} total={quote.total} />
          {quote.note && <p className="mt-3 whitespace-pre-line text-sm text-muted">{quote.note}</p>}
        </section>
      ))}

      {booking.reviews && (
        <section aria-label="Review" className="flex flex-col gap-2 rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-ink">The customer&apos;s review</h2>
          <Stars rating={booking.reviews.rating} />
          {booking.reviews.comment && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{booking.reviews.comment}</p>
          )}
        </section>
      )}

      <BookingTimeline events={booking.booking_events} />

      {!isFinished(booking.status) && <AdminCancel bookingId={booking.id} />}
    </div>
  );
}

function Email({ address }: { address: string | null }) {
  if (!address) return null;
  return (
    <a href={`mailto:${address}`} className="flex w-fit items-center gap-1.5 break-all text-brand-navy underline">
      <Mail aria-hidden className="size-4 shrink-0" />
      {address}
    </a>
  );
}

function PhoneNumber({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a href={`tel:${phone}`} className="flex w-fit items-center gap-1.5 text-brand-navy underline">
      <Phone aria-hidden className="size-4 shrink-0" />
      {formatPhone(phone)}
    </a>
  );
}
