import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatPeso, formatSchedule, fullAddress } from "@/lib/bookings";
import { LEGAL } from "@/lib/legal";
import { receiptLines, receiptNumber } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt" };

// A done job's receipt, for its customer, its technician and admins (the
// database shows it to no one else). Outside the tabs, so it prints on its own.
export default function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  return (
    <main className="pb-6 print:p-0">
      <Suspense
        fallback={
          <>
            <PageHeader title="Receipt" />
            <CardsSkeleton count={1} />
          </>
        }
      >
        <Receipt params={params} />
      </Suspense>
    </main>
  );
}

async function Receipt({ params }: { params: PageProps<"/receipts/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, customer_id, technician_id, appliance, brand, scheduled_at, street, barangay, city, province, inspection_fee, final_amount, return_of, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), technician:profiles!bookings_technician_id_fkey(full_name), quotes(items, total, status, created_at), receipts(number, issued_at)",
    )
    .eq("id", id)
    .order("created_at", { referencedTable: "quotes" })
    .maybeSingle();
  if (!booking?.receipts || booking.final_amount == null) notFound();

  const { lines, offer, total } = receiptLines({ ...booking, final_amount: booking.final_amount });
  const technicianName = booking.technician?.full_name || "PatchUp technician";
  // Back to the booking as the viewer knows it.
  const me = auth?.claims.sub;
  const backHref =
    me === booking.customer_id
      ? `/bookings/${booking.id}`
      : me === booking.technician_id
        ? `/jobs/${booking.id}`
        : `/admin/bookings/${booking.id}`;

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Receipt" backHref={backHref} />
      </div>
      <div className="flex flex-col gap-4 px-6 pt-6 print:p-0">
        <article
          aria-label="Receipt"
          className="rounded-card bg-white p-5 text-sm shadow-sm print:rounded-none print:p-0 print:shadow-none"
        >
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <p className="text-xl font-bold text-brand-navy">{LEGAL.business}</p>
            <div className="sm:text-right">
              <h2 className="font-bold text-ink">Receipt {receiptNumber(booking.receipts.number)}</h2>
              <p className="text-muted">{formatDateTime(booking.receipts.issued_at)}</p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-line pt-4">
            <dt className="text-muted">Customer</dt>
            <dd className="text-ink">{booking.customer?.full_name || "PatchUp customer"}</dd>
            <dt className="text-muted">Address</dt>
            <dd className="text-ink">{fullAddress(booking)}</dd>
            <dt className="text-muted">Technician</dt>
            <dd className="text-ink">{technicianName}</dd>
            <dt className="text-muted">Service</dt>
            <dd className="text-ink">
              {booking.service_categories?.name}: {booking.appliance}
              {booking.brand && ` (${booking.brand})`}
            </dd>
            <dt className="text-muted">Visit</dt>
            <dd className="text-ink">{formatSchedule(booking.scheduled_at)}</dd>
          </dl>

          <dl aria-label="What was paid" className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {lines.map((line, i) => (
              <div key={i} className="flex justify-between gap-4">
                <dt className="text-ink">{line.label}</dt>
                <dd className="shrink-0 text-ink">{formatPeso(line.amount)}</dd>
              </div>
            ))}
            {offer > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink">First-booking offer</dt>
                <dd className="shrink-0 text-ink">−{formatPeso(offer)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-bold">
              <dt className="text-ink">Total paid</dt>
              <dd className="shrink-0 text-ink">{formatPeso(total)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-ink">Paid in cash to {technicianName}.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            This is {LEGAL.business}&apos;s record of the job, not an official receipt or invoice for tax purposes: ask
            the technician if you need one. Questions? Write to {LEGAL.email} with the receipt number.
          </p>
        </article>
        <PrintButton className="print:hidden" />
      </div>
    </>
  );
}
