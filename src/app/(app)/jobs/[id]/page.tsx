import { Banknote, BriefcaseBusiness, CalendarClock, MapPin, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingPhotos } from "@/components/bookings/booking-photos";
import { DetailRow } from "@/components/bookings/detail-row";
import { ReceiptLink } from "@/components/bookings/receipt-link";
import { QuoteItems } from "@/components/bookings/quote-items";
import { StatusChip } from "@/components/bookings/status-chip";
import { ContactButtons } from "@/components/bookings/contact-buttons";
import { BookingTimeline } from "@/components/bookings/timeline";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { ReviewItem } from "@/components/reviews/stars";
import { LocationSharing } from "@/components/tracking/location-sharing";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { PHOTO_BUCKET } from "@/lib/booking-photos";
import {
  amountDue,
  dueParts,
  formatDay,
  formatPeso,
  formatSchedule,
  fullAddress,
  mapsLink,
  quoteItems,
  UNDER_WAY,
} from "@/lib/bookings";
import { withSignedUrls } from "@/lib/documents";
import { firstName } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { JobActions } from "./job-actions";

export const metadata: Metadata = { title: "Job" };

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <main className="pb-6">
      <PageHeader title="Job" backHref="/jobs" />
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <JobDetails params={params} />
      </Suspense>
    </main>
  );
}

const QUOTE_STATUS = {
  pending: { label: "Waiting for the customer", className: "bg-brand-yellow text-ink" },
  approved: { label: "Approved", className: "bg-brand-navy/10 text-brand-navy" },
  declined: { label: "Declined", className: "bg-danger/10 text-danger" },
};

async function JobDetails({ params }: { params: PageProps<"/jobs/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: job } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, technician_id, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, latitude, longitude, inspection_fee, discount, final_amount, cancel_reason, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), booking_events(id, event, note, created_at), quotes(id, items, total, note, status, created_at), reviews(rating, comment, customer_name, created_at), booking_photos(id, storage_path, created_at), receipts(number)",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .order("created_at", { referencedTable: "quotes" })
    .order("created_at", { referencedTable: "booking_photos" })
    .maybeSingle();
  const me = auth?.claims.sub;
  // Open requests, or this technician's own jobs (the access rules hide the rest).
  if (!job || (job.technician_id !== null && job.technician_id !== me)) {
    return (
      <EmptyState icon={BriefcaseBusiness} title="This job isn't available">
        Another technician may have taken it, or the customer cancelled.{" "}
        <Link href="/jobs" className="font-semibold text-brand-navy underline">
          Back to Jobs
        </Link>
      </EmptyState>
    );
  }

  const mine = job.technician_id === me;
  // The street address is for the technician doing the job; before that, the area is enough to decide.
  const assigned = mine && job.status !== "requested";
  const onTheWay = assigned && ["accepted", "en_route", "arrived"].includes(job.status);
  const due = amountDue(job);
  // What the first-booking offer took off what the customer pays: PatchUp pays the technician that back.
  const payback = due.inspection + due.repair - due.total;
  const photos = await withSignedUrls(supabase, job.booking_photos, PHOTO_BUCKET);
  // The customer's number, while the job is under way (the access rules return it only then).
  const phone =
    assigned && UNDER_WAY.includes(job.status)
      ? ((await supabase.from("phone_numbers").select("phone").eq("user_id", job.customer_id).maybeSingle()).data?.phone ?? null)
      : null;

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <LiveUpdates topics={[`booking:${job.id}`]} />
      <section className="rounded-card bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <StatusChip status={job.status} technician />
          {mine && job.status === "requested" && (
            <span className="inline-flex rounded-full bg-brand-navy px-3 py-1 text-xs font-semibold text-white">
              Asked for you
            </span>
          )}
        </div>
        <h2 className="mt-3 text-xl font-bold text-ink">
          {job.service_categories?.name}: {job.appliance}
        </h2>
        {job.brand && <p className="text-sm text-muted">{job.brand}</p>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{job.problem}</p>
      </section>

      <BookingPhotos bookingId={job.id} photos={photos} editable={false} intro="From the customer." />

      <section aria-label="Details" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={CalendarClock} label="Visit">
          {formatSchedule(job.scheduled_at)}
        </DetailRow>
        <DetailRow icon={MapPin} label="Address">
          {assigned ? (
            <>
              {fullAddress(job)}
              {job.landmark && <span className="block text-muted">{job.landmark}</span>}
              {onTheWay && (
                <a
                  href={mapsLink(job)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block w-fit font-semibold text-brand-navy underline"
                >
                  Open in Google Maps
                </a>
              )}
            </>
          ) : (
            <>
              {job.barangay}, {job.city}
              <span className="block text-muted">You&apos;ll see the full address once you accept.</span>
            </>
          )}
        </DetailRow>
        {mine && (
          <DetailRow icon={UserRound} label="Customer">
            {job.customer?.full_name || "PatchUp customer"}
            {phone && (
              <a href={`tel:${phone}`} className="block w-fit font-semibold text-brand-navy underline">
                {formatPhone(phone)}
              </a>
            )}
          </DetailRow>
        )}
        <DetailRow icon={Banknote} label={job.final_amount != null ? "Collected" : "Customer pays in cash"}>
          {formatPeso(job.final_amount ?? due.total)}
          <span className="block text-muted">
            {due.repair > 0 || due.discount > 0 ? dueParts(due) : "Inspection fee"}
          </span>
          {payback > 0 && (
            <span className="block text-muted">
              PatchUp pays you back the {formatPeso(payback)} first-booking offer (see Profile → Earnings).
            </span>
          )}
          {mine && job.receipts && <ReceiptLink bookingId={job.id} number={job.receipts.number} />}
        </DetailRow>
      </section>

      {mine && job.status === "en_route" && (
        <LocationSharing
          bookingId={job.id}
          customerName={job.customer?.full_name ? firstName(job.customer.full_name) : "the customer"}
        />
      )}

      {mine && job.status !== "cancelled" && (
        <ContactButtons bookingId={job.id} name={job.customer?.full_name || null} phone={phone} fallback="the customer" />
      )}

      {job.status === "cancelled" && (
        <p className="rounded-card bg-danger/5 p-5 text-sm text-danger">
          This booking was cancelled{job.cancel_reason ? `: ${job.cancel_reason}` : "."}
        </p>
      )}

      {mine &&
        job.quotes
          .slice()
          .reverse()
          .map((quote) => (
            <section key={quote.id} aria-label="Quote" className="rounded-card bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-ink">Your quote</h2>
                <span
                  className={cn(
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                    QUOTE_STATUS[quote.status].className,
                  )}
                >
                  {QUOTE_STATUS[quote.status].label}
                </span>
              </div>
              <QuoteItems items={quoteItems(quote.items)} total={quote.total} />
              {quote.note && <p className="mt-3 whitespace-pre-line text-sm text-muted">{quote.note}</p>}
            </section>
          ))}

      {mine && job.status === "completed" && (
        <section aria-label="Customer's review" className="flex flex-col gap-2 rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-ink">Customer&apos;s review</h2>
          {job.reviews ? (
            <ReviewItem
              rating={job.reviews.rating}
              comment={job.reviews.comment}
              by={job.reviews.customer_name || "Customer"}
              date={formatDay(job.reviews.created_at)}
            />
          ) : (
            <p className="text-sm text-muted">No review yet. Customers are asked to rate the job once it&apos;s done.</p>
          )}
        </section>
      )}

      <JobActions
        jobId={job.id}
        status={job.status}
        mine={mine}
        inspectionFee={job.inspection_fee}
        discount={job.discount}
        amountDue={due.total}
      />

      <BookingTimeline events={job.booking_events} />
    </div>
  );
}
