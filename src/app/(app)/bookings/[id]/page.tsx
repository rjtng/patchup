import { CalendarClock, MapPin, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailRow } from "@/components/bookings/detail-row";
import { ReceiptLink } from "@/components/bookings/receipt-link";
import { QuoteItems } from "@/components/bookings/quote-items";
import { StatusChip } from "@/components/bookings/status-chip";
import { BookingPhotos } from "@/components/bookings/booking-photos";
import { CancelBooking } from "@/components/bookings/cancel-booking";
import { ContactButtons } from "@/components/bookings/contact-buttons";
import { BookingTimeline } from "@/components/bookings/timeline";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { PushSettings } from "@/components/notifications/push-settings";
import { Stars } from "@/components/reviews/stars";
import { TripTracker } from "@/components/tracking/trip-tracker";
import { ButtonLink } from "@/components/ui/button";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { PHOTO_BUCKET } from "@/lib/booking-photos";
import {
  amountDue,
  CUSTOMER_CAN_CANCEL,
  dueParts,
  formatDay,
  formatPeso,
  formatSchedule,
  fullAddress,
  isFinished,
  quoteItems,
  UNDER_WAY,
} from "@/lib/bookings";
import { withSignedUrls } from "@/lib/documents";
import { pin } from "@/lib/tracking";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { QuoteResponse } from "./quote-response";
import { RateRepair } from "./rate-repair";

export const metadata: Metadata = { title: "Booking" };

export default function BookingPage({ params, searchParams }: PageProps<"/bookings/[id]">) {
  return (
    <main className="pb-6">
      <PageHeader title="Booking" backHref="/bookings" />
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <BookingDetails params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const QUOTE_STATUS = {
  pending: { label: "Needs your answer", className: "bg-brand-yellow text-ink" },
  approved: { label: "Approved", className: "bg-brand-navy/10 text-brand-navy" },
  declined: { label: "Declined", className: "bg-danger/10 text-danger" },
};

async function BookingDetails({
  params,
  searchParams,
}: {
  params: PageProps<"/bookings/[id]">["params"];
  searchParams: PageProps<"/bookings/[id]">["searchParams"];
}) {
  const [{ id }, { photos: photosParam }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, technician_id, latitude, longitude, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, inspection_fee, discount, final_amount, cancel_reason, service_categories(name, slug), technician:profiles!bookings_technician_id_fkey(full_name), booking_events(id, event, note, created_at), quotes(id, items, total, note, status, created_at), reviews(rating, comment, created_at), booking_photos(id, storage_path, created_at), receipts(number)",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .order("created_at", { referencedTable: "quotes" })
    .order("created_at", { referencedTable: "booking_photos" })
    .maybeSingle();
  if (!booking) notFound();
  const photos = await withSignedUrls(supabase, booking.booking_photos, PHOTO_BUCKET);

  const isCustomer = booking.customer_id === auth?.claims.sub;
  // Where the technician is, while they're on the way (see TripTracker).
  const trip =
    isCustomer && booking.status === "en_route"
      ? (
          await supabase
            .from("technician_locations")
            .select("latitude, longitude, accuracy, updated_at")
            .eq("booking_id", booking.id)
            .maybeSingle()
        ).data
      : null;
  const technicianName = booking.technician?.full_name || null;
  // The technician's number, while the job is under way (the access rules return it only then).
  const phone =
    isCustomer && booking.technician_id && UNDER_WAY.includes(booking.status)
      ? ((await supabase.from("phone_numbers").select("phone").eq("user_id", booking.technician_id).maybeSingle()).data
          ?.phone ?? null)
      : null;
  const due = amountDue(booking);
  // The follow-up on requests nobody takes: it told admins (still waiting), or cancelled it at the visit time.
  const waitingSteps = booking.booking_events.filter((e) => ["created", "declined", "overdue"].includes(e.event));
  const teamHelping = booking.status === "requested" && waitingSteps.at(-1)?.event === "overdue";
  const expired = booking.booking_events.some((e) => e.event === "expired");
  // The follow-up on technicians who don't set off: it told admins this technician is late.
  const takenSteps = booking.booking_events.filter((e) => ["accepted", "assigned", "late"].includes(e.event));
  const runningLate = booking.status === "accepted" && takenSteps.at(-1)?.event === "late";
  // Booking again: whether the first-booking offer still applies (cancelled bookings don't use it up).
  const offer =
    isCustomer && booking.status === "cancelled" ? ((await supabase.rpc("first_booking_discount")).data ?? 0) : 0;

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <LiveUpdates topics={[`booking:${booking.id}`]} />
      <section className="rounded-card bg-white p-5 shadow-sm">
        <StatusChip status={booking.status} />
        <h2 className="mt-3 text-xl font-bold text-ink">
          {booking.service_categories?.name}: {booking.appliance}
        </h2>
        {booking.brand && <p className="text-sm text-muted">{booking.brand}</p>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{booking.problem}</p>
      </section>

      {isCustomer && booking.status === "cancelled" && booking.service_categories && (
        <section aria-labelledby="book-again" className="rounded-card bg-white p-5 shadow-sm">
          <h2 id="book-again" className="text-base font-bold text-ink">
            {expired ? "No technician was free for this time" : "This booking was cancelled"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {expired
              ? "Sorry about that. Book again and pick another time."
              : booking.cancel_reason
                ? `Reason: ${booking.cancel_reason}`
                : "Book again whenever you're ready."}
            {offer > 0 && ` Your first-booking offer still applies: ${formatPeso(offer)} off.`}
          </p>
          <ButtonLink href={`/services/${booking.service_categories.slug}/book?again=${booking.id}`} className="mt-4">
            Book again
          </ButtonLink>
        </section>
      )}

      <BookingPhotos
        bookingId={booking.id}
        photos={photos}
        editable={isCustomer && !isFinished(booking.status)}
        intro={
          photosParam === "failed"
            ? "Some photos didn't upload. Add them again here."
            : isCustomer && !isFinished(booking.status)
              ? "Up to 3 photos of the problem, so the technician sees it before coming."
              : undefined
        }
      />

      {isCustomer && booking.status === "en_route" && (
        <TripTracker
          bookingId={booking.id}
          technicianName={technicianName}
          destination={pin(booking)}
          initial={trip}
        />
      )}

      {isCustomer && booking.status === "completed" && !booking.reviews && (
        <RateRepair bookingId={booking.id} technicianName={technicianName ?? "your technician"} />
      )}
      {booking.reviews && (
        <section aria-label="Your review" className="flex flex-col gap-2 rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-ink">Your review</h2>
          <Stars rating={booking.reviews.rating} />
          {booking.reviews.comment && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{booking.reviews.comment}</p>
          )}
          <p className="text-xs text-muted">{formatDay(booking.reviews.created_at)}. Thanks for helping others choose!</p>
        </section>
      )}

      {booking.quotes
        .slice()
        .reverse()
        .map((quote) => (
          <section key={quote.id} aria-label="Quote" className="rounded-card bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-ink">Repair quote</h2>
              <span
                className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", QUOTE_STATUS[quote.status].className)}
              >
                {QUOTE_STATUS[quote.status].label}
              </span>
            </div>
            <QuoteItems items={quoteItems(quote.items)} total={quote.total} />
            {quote.note && <p className="mt-3 whitespace-pre-line text-sm text-muted">{quote.note}</p>}
            {isCustomer && quote.status === "pending" && booking.status === "quoted" && (
              <QuoteResponse
                quoteId={quote.id}
                repair={quote.total}
                inspectionFee={booking.inspection_fee}
                discount={booking.discount}
              />
            )}
          </section>
        ))}

      <section aria-label="Details" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={CalendarClock} label="Visit">
          {formatSchedule(booking.scheduled_at)}
        </DetailRow>
        <DetailRow icon={MapPin} label="Address">
          {fullAddress(booking)}
          {booking.landmark && <span className="block text-muted">{booking.landmark}</span>}
        </DetailRow>
        <DetailRow icon={UserRound} label="Technician">
          {booking.technician_id ? (
            <>
              <Link
                href={`/technicians/${booking.technician_id}?back=/bookings/${booking.id}`}
                className="font-semibold text-brand-navy underline"
              >
                {technicianName ?? "Your technician"}
              </Link>
              {runningLate && (
                <span className="block text-muted">Running late; the PatchUp team is checking with them.</span>
              )}
            </>
          ) : booking.status === "cancelled" ? (
            "None"
          ) : (
            <>
              Finding one for you
              {teamHelping && (
                <span className="block text-muted">It&apos;s taking longer than usual, so the PatchUp team is helping.</span>
              )}
            </>
          )}
        </DetailRow>
        {booking.status === "cancelled" ? null : booking.final_amount != null ? (
          <DetailRow icon={Wrench} label="Total paid">
            {formatPeso(booking.final_amount)}
            {due.discount > 0 && <span className="block text-muted">{dueParts(due)}</span>}
            {booking.receipts && <ReceiptLink bookingId={booking.id} number={booking.receipts.number} />}
          </DetailRow>
        ) : due.repair > 0 ? (
          <DetailRow icon={Wrench} label="To pay when it's done">
            {formatPeso(due.total)}
            <span className="block text-muted">{dueParts(due)}, in cash</span>
          </DetailRow>
        ) : due.discount > 0 ? (
          <DetailRow icon={Wrench} label="To pay after the visit">
            {formatPeso(due.total)}
            <span className="block text-muted">
              {dueParts(due)}, in cash. The repair is quoted before it starts.
            </span>
          </DetailRow>
        ) : (
          <DetailRow icon={Wrench} label="Inspection fee">
            {formatPeso(booking.inspection_fee)}
            <span className="block text-muted">Cash after the visit. The repair is quoted before it starts.</span>
          </DetailRow>
        )}
      </section>

      {isCustomer && booking.technician_id && booking.status !== "cancelled" && (
        <ContactButtons bookingId={booking.id} name={technicianName} phone={phone} fallback="your technician" />
      )}

      {isCustomer && !isFinished(booking.status) && (
        <PushSettings variant="prompt">
          Get updates on this phone, even when PatchUp is closed: when your technician is on the way, when the quote
          is ready.
        </PushSettings>
      )}

      <BookingTimeline events={booking.booking_events} />

      {isCustomer && CUSTOMER_CAN_CANCEL.includes(booking.status) && <CancelBooking bookingId={booking.id} />}
    </div>
  );
}
