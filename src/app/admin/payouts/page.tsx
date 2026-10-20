import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDay, formatPeso } from "@/lib/bookings";
import { jobsLabel, owedByTechnician } from "@/lib/payouts";
import { createClient } from "@/lib/supabase/server";
import { ListLink } from "../list-link";
import { PayBack } from "./pay-back";

export const metadata: Metadata = { title: "Payouts" };

// What PatchUp owes technicians for first-booking offers (their customers paid
// them that much less), and the payouts recorded so far.
export default function PayoutsPage() {
  return (
    <main className="pb-6">
      <div className="px-6 pt-3">
        <ListLink href="/admin">Overview</ListLink>
      </div>
      <Suspense fallback={<CardsSkeleton />}>
        <Payouts />
      </Suspense>
    </main>
  );
}

async function Payouts() {
  const supabase = await createClient();
  const [{ data: paybacks, error }, { data: payouts }] = await Promise.all([
    supabase.rpc("paybacks"),
    supabase
      .from("payouts")
      .select(
        "id, amount, reference, paid_at, technician:profiles!payouts_technician_id_fkey(full_name), payout_bookings(booking_id)",
      )
      .order("paid_at", { ascending: false })
      .limit(30),
  ]);
  if (error) {
    return (
      <p className="px-6 text-sm text-danger">We couldn&apos;t load what&apos;s owed. Refresh the page to try again.</p>
    );
  }
  const owed = owedByTechnician(paybacks);

  return (
    <div className="flex flex-col gap-4 px-6">
      <h2 className="text-lg font-bold text-ink">To pay back</h2>
      <p className="-mt-2 text-sm text-muted">
        First-booking offers: each customer paid their technician that much less. Send it by GCash or bank, then mark it
        as paid.
      </p>
      {owed.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">Nothing to pay back right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {owed.map((t) => (
            <li key={t.technicianId}>
              <section aria-label={t.name} className="rounded-card bg-white p-5 shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/admin/technicians/${t.technicianId}`} className="font-bold text-brand-navy underline">
                    {t.name}
                  </Link>
                  <span className="text-xl font-bold text-ink">{formatPeso(t.amount)}</span>
                </div>
                <p className="text-sm text-muted">For {jobsLabel(t.jobs.length)}</p>
                <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
                  {t.jobs.map((job) => (
                    <li key={job.booking_id} className="flex justify-between gap-3 py-2">
                      <Link href={`/admin/bookings/${job.booking_id}`} className="min-w-0 hover:underline">
                        <span className="block truncate text-ink">
                          {job.category}: {job.appliance}
                        </span>
                        <span className="block text-muted">Done {formatDay(job.completed_at)}</span>
                      </Link>
                      <span className="text-ink">{formatPeso(Number(job.amount))}</span>
                    </li>
                  ))}
                </ul>
                <PayBack technicianId={t.technicianId} name={t.name} amount={t.amount} />
              </section>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 text-lg font-bold text-ink">Paid</h2>
      {payouts && payouts.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-card bg-white px-5 py-1 text-sm shadow-sm">
          {payouts.map((payout) => (
            <li key={payout.id} className="flex justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{payout.technician?.full_name || "A technician"}</span>
                <span className="block text-muted">
                  {formatDay(payout.paid_at)} · {jobsLabel(payout.payout_bookings.length)}
                  {payout.reference && ` · Ref. ${payout.reference}`}
                </span>
              </span>
              <span className="font-semibold text-ink">{formatPeso(Number(payout.amount))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">No payouts recorded yet.</p>
      )}
    </div>
  );
}
