import { CalendarClock, MapPin, MessageCircle, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DetailRow } from "@/components/bookings/detail-row";
import { QuoteItems } from "@/components/bookings/quote-items";
import { StatusChip } from "@/components/bookings/status-chip";
import { BookingTimeline } from "@/components/bookings/timeline";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { PushSettings } from "@/components/notifications/push-settings";
import { Stars } from "@/components/reviews/stars";
import { ButtonLink } from "@/components/ui/button";
import { CardsSkeleton } from "@/components/ui/skeleton";
import {
  amountDue,
  CUSTOMER_CAN_CANCEL,
  formatDay,
  formatPeso,
  formatSchedule,
  fullAddress,
  isFinished,
  quoteItems,
} from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { CancelBooking } from "./cancel-booking";
import { QuoteResponse } from "./quote-response";
import { RateRepair } from "./rate-repair";

export const metadata: Metadata = { title: "Booking" };

export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <main className="pb-6">
      <PageHeader title="Booking" backHref="/bookings" />
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <BookingDetails params={params} />
      </Suspense>
    </main>
  );
}

const QUOTE_STATUS = {
  pending: { label: "Needs your answer", className: "bg-brand-yellow text-ink" },
  approved: { label: "Approved", className: "bg-brand-navy/10 text-brand-navy" },
  declined: { label: "Declined", className: "bg-danger/10 text-danger" },
};

async function BookingDetails({ params }: { params: PageProps<"/bookings/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, technician_id, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, inspection_fee, final_amount, cancel_reason, service_categories(name), technician:profiles!bookings_technician_id_fkey(full_name), booking_events(id, event, note, created_at), quotes(id, items, total, note, status, created_at), reviews(rating, comment, created_at)",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .order("created_at", { referencedTable: "quotes" })
    .maybeSingle();
  if (!booking) notFound();

  const isCustomer = booking.customer_id === auth?.claims.sub;
  const technicianName = booking.technician?.full_name || null;
  const due = amountDue(booking);

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
              <QuoteResponse quoteId={quote.id} repair={quote.total} inspectionFee={booking.inspection_fee} />
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
            <Link
              href={`/technicians/${booking.technician_id}?back=/bookings/${booking.id}`}
              className="font-semibold text-brand-navy underline"
            >
              {technicianName ?? "Your technician"}
            </Link>
          ) : (
            "Finding one for you"
          )}
        </DetailRow>
        {booking.final_amount != null ? (
          <DetailRow icon={Wrench} label="Total paid">
            {formatPeso(booking.final_amount)}
          </DetailRow>
        ) : due.repair > 0 ? (
          <DetailRow icon={Wrench} label="To pay when it's done">
            {formatPeso(due.total)}
            <span className="block text-muted">
              {formatPeso(due.inspection)} inspection + {formatPeso(due.repair)} repair, in cash
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
        <ButtonLink href={`/chat/${booking.id}`} variant="secondary">
          <MessageCircle aria-hidden className="size-5" />
          Message {technicianName ? firstName(technicianName) : "your technician"}
        </ButtonLink>
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
