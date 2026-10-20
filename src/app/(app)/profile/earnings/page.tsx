import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDay, formatPeso, TIME_ZONE } from "@/lib/bookings";
import { jobsLabel, owedByTechnician, sumPesos } from "@/lib/payouts";
import { isTechnician } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Earnings" };

// A technician's jobs and cash this month, what PatchUp owes them for the
// first-booking offer, and what PatchUp has paid them.
export default function EarningsPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Earnings" backHref="/profile" />
      <Suspense fallback={<CardsSkeleton count={3} />}>
        <Earnings />
      </Suspense>
    </main>
  );
}

/** The first moment of this month in Manila, as an ISO string. */
function startOfMonth(now: Date) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" })
    .format(now)
    .split("-");
  return new Date(`${year}-${month}-01T00:00:00+08:00`).toISOString();
}

async function Earnings() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!isTechnician(auth?.claims)) {
    return (
      <EmptyState icon={BriefcaseBusiness} title="For technicians">
        Technicians see the jobs they&apos;ve done and what PatchUp pays them here.
      </EmptyState>
    );
  }
  const technicianId = auth!.claims.sub;
  const [{ data: paybacks, error }, { data: month }, { data: payouts }] = await Promise.all([
    supabase.rpc("paybacks"),
    supabase
      .from("bookings")
      .select("final_amount")
      .eq("technician_id", technicianId)
      .eq("status", "completed")
      .gte("completed_at", startOfMonth(new Date())),
    supabase
      .from("payouts")
      .select("id, amount, reference, paid_at, payout_bookings(booking_id)")
      .order("paid_at", { ascending: false })
      .limit(30),
  ]);
  if (error) {
    return (
      <p className="px-6 pt-6 text-sm text-danger">
        We couldn&apos;t load your earnings. Refresh the page to try again.
      </p>
    );
  }
  const owed = owedByTechnician(paybacks)[0];
  const collected = sumPesos((month ?? []).map((b) => b.final_amount ?? 0));

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <section aria-labelledby="owed" className="rounded-card bg-white p-5 shadow-sm">
        <h2 id="owed" className="text-base font-bold text-ink">
          PatchUp owes you
        </h2>
        <p className="mt-2 text-3xl font-bold text-brand-navy">{formatPeso(owed?.amount ?? 0)}</p>
        {owed ? (
          <>
            <p className="mt-1 text-sm text-muted">
              For the first-booking offer on {jobsLabel(owed.jobs.length)}:{" "}
              {owed.jobs.length === 1 ? "the customer" : "those customers"} paid you that much less, and PatchUp pays
              you back by GCash or bank transfer.
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-line text-sm">
              {owed.jobs.map((job) => (
                <li key={job.booking_id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">
                      {job.category}: {job.appliance}
                    </span>
                    <span className="block text-muted">Done {formatDay(job.completed_at)}</span>
                  </span>
                  <span className="font-semibold text-ink">{formatPeso(Number(job.amount))}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Nothing right now. When a customer&apos;s first booking has the offer, they pay you less and PatchUp pays
            you back the difference.
          </p>
        )}
      </section>

      <section aria-labelledby="month" className="rounded-card bg-white p-5 shadow-sm">
        <h2 id="month" className="text-base font-bold text-ink">
          This month
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-sm text-muted">Jobs done</dt>
            <dd className="text-2xl font-bold text-brand-navy">{month?.length ?? 0}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Cash collected</dt>
            <dd className="text-2xl font-bold text-brand-navy">{formatPeso(collected)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="paid" className="rounded-card bg-white p-5 shadow-sm">
        <h2 id="paid" className="text-base font-bold text-ink">
          Payments from PatchUp
        </h2>
        {payouts && payouts.length > 0 ? (
          <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
            {payouts.map((payout) => (
              <li key={payout.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-ink">{formatDay(payout.paid_at)}</span>
                  <span className="block text-muted">
                    {jobsLabel(payout.payout_bookings.length)}
                    {payout.reference && ` · Ref. ${payout.reference}`}
                  </span>
                </span>
                <span className="font-semibold text-ink">{formatPeso(Number(payout.amount))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">None yet.</p>
        )}
      </section>
    </div>
  );
}
