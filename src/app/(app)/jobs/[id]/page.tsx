import { Banknote, BriefcaseBusiness, CalendarClock, MapPin, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DetailRow } from "@/components/bookings/detail-row";
import { QuoteItems } from "@/components/bookings/quote-items";
import { StatusChip } from "@/components/bookings/status-chip";
import { BookingTimeline } from "@/components/bookings/timeline";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { amountDue, formatPeso, formatSchedule, fullAddress, mapsLink, quoteItems } from "@/lib/bookings";
import { cn } from "@/lib/cn";
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
      "id, status, technician_id, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, inspection_fee, final_amount, cancel_reason, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), booking_events(id, event, note, created_at), quotes(id, items, total, note, status, created_at)",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .order("created_at", { referencedTable: "quotes" })
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
                  className="mt-1 inline-block font-semibold text-brand-navy underline"
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
          </DetailRow>
        )}
        <DetailRow icon={Banknote} label={job.final_amount != null ? "Collected" : "Customer pays in cash"}>
          {formatPeso(job.final_amount ?? due.total)}
          <span className="block text-muted">
            {due.repair > 0
              ? `${formatPeso(due.inspection)} inspection + ${formatPeso(due.repair)} repair`
              : "Inspection fee"}
          </span>
        </DetailRow>
      </section>

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

      <JobActions
        jobId={job.id}
        status={job.status}
        mine={mine}
        inspectionFee={job.inspection_fee}
        amountDue={due.total}
      />

      <BookingTimeline events={job.booking_events} />
    </div>
  );
}
