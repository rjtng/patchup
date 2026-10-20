"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { radioChip } from "@/components/bookings/visit-time-picker";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/text-field";
import { formatDay } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { CUSTOMER_REASONS, reasonLabel, TECHNICIAN_REASONS, type Report } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";

// The customer's or technician's reports on a booking (what PatchUp said
// back, or that it's being looked into), and reporting a problem: what went
// wrong and what happened. One open report at a time.
export function ReportProblem({
  bookingId,
  technician,
  reports,
}: {
  bookingId: string;
  /** Reporting as the technician (their reasons differ). */
  technician: boolean;
  /** Their own reports on it, oldest first. */
  reports: Report[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasons = technician ? TECHNICIAN_REASONS : CUSTOMER_REASONS;
  const waiting = reports.some((r) => !r.resolved_at);

  const send = async () => {
    if (!reason) {
      setError("Pick what went wrong.");
      return;
    }
    if (!details.trim()) {
      setError("Say what happened, so the team can look into it.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("report_problem", { booking_id: bookingId, reason, details });
    setPending(false);
    if (error) {
      setError(
        error.code === "P0001" || error.code === "42501"
          ? error.message
          : "We couldn't send it. Check your connection and try again.",
      );
      return;
    }
    setOpen(false);
    setReason(null);
    setDetails("");
    router.refresh();
  };

  return (
    <>
      {reports.map((r) => (
        <section key={r.id} aria-label="Your report" className="rounded-card bg-white p-5 text-sm shadow-sm">
          <p className="font-semibold text-ink">
            You reported a problem on {formatDay(r.created_at)}: {reasonLabel(r.reason, technician)}
          </p>
          <p className="mt-1 whitespace-pre-line text-muted">{r.details}</p>
          {r.resolved_at ? (
            <p className="mt-3 rounded-field bg-brand-navy/5 px-4 py-3 text-ink">
              <span className="font-semibold">PatchUp: </span>
              {r.resolution}
            </p>
          ) : (
            <p className="mt-3 font-semibold text-brand-navy">
              The PatchUp team is looking into it and will get back to you.
            </p>
          )}
        </section>
      ))}

      {!waiting &&
        (open ? (
          <section aria-labelledby="report" className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
            <fieldset className="flex flex-col gap-2">
              <legend id="report" className="mb-2 text-base font-bold text-ink">
                What went wrong?
              </legend>
              {reasons.map((r) => (
                <label key={r.value} className={cn(radioChip(reason === r.value), "text-left")}>
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="sr-only"
                  />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <TextAreaField
              label="What happened?"
              hint="Only the PatchUp team sees this."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={1000}
            />
            {error && (
              <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Not now
              </Button>
              <Button onClick={send} disabled={pending}>
                {pending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </section>
        ) : (
          <Button variant="ghost" onClick={() => setOpen(true)}>
            <Flag aria-hidden className="size-5" />
            Report a problem
          </Button>
        ))}
    </>
  );
}
