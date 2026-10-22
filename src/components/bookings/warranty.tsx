import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { formatDay, formatSchedule, STATUS, type BookingStatus } from "@/lib/bookings";
import { cn } from "@/lib/cn";

// The repair warranty (see lib/warranty): the mark on a return visit, and a
// repair's warranty as its customer sees it.

export function ReturnVisitChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-navy ring-1 ring-inset ring-brand-navy/30",
        className,
      )}
    >
      <ShieldCheck aria-hidden className="size-3.5" />
      Return visit
    </span>
  );
}

/**
 * A repair's warranty on its booking page: until when it runs, and asking for
 * a return visit (or the one asked for, if there is one).
 */
export function WarrantyCard({
  bookingId,
  until,
  now,
  technician,
  returnVisit,
}: {
  bookingId: string;
  /** When the warranty ends (ms). */
  until: number;
  now: number;
  /** Who did the repair, as the customer calls them: "Tess", or "your technician". */
  technician: string;
  /** The return visit asked for (not a cancelled one), if any. */
  returnVisit: { id: string; status: BookingStatus; scheduled_at: string; completed_at: string | null } | null;
}) {
  const end = formatDay(new Date(until).toISOString());
  return (
    <section aria-labelledby="warranty" className="rounded-card bg-white p-5 shadow-sm">
      <h2 id="warranty" className="flex items-center gap-2 text-base font-bold text-ink">
        <ShieldCheck aria-hidden className="size-5 shrink-0 text-brand-navy" />
        30-day warranty
      </h2>
      {returnVisit ? (
        <>
          <p className="mt-1 text-sm text-muted">
            {returnVisit.status === "completed" && returnVisit.completed_at
              ? `Your return visit was done on ${formatDay(returnVisit.completed_at)}.`
              : `Your return visit: ${formatSchedule(returnVisit.scheduled_at)}. ${STATUS[returnVisit.status].label}.`}
          </p>
          <Link
            href={`/bookings/${returnVisit.id}`}
            className="mt-2 block w-fit text-sm font-semibold text-brand-navy underline"
          >
            See the return visit
          </Link>
        </>
      ) : now < until ? (
        <>
          <p className="mt-1 text-sm text-muted">
            If the problem comes back by {end}, {technician} comes back to fix it: no inspection fee, and no charge for
            the work. New parts, if it needs them, are quoted first, and you decide.
          </p>
          <ButtonLink href={`/bookings/${bookingId}/return-visit`} variant="secondary" className="mt-4">
            Ask for a return visit
          </ButtonLink>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">
          It ended on {end}. If something&apos;s wrong with the repair, report a problem below.
        </p>
      )}
    </section>
  );
}
