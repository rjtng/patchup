"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPeso, isLastMinute, payable, type BookingStatus, type LastMinuteCheck } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";
import { QuoteForm } from "./quote-form";

type Step = "accept" | "decline" | "en_route" | "arrived" | "complete";

// What each step asks before it runs (the ones that can't be undone).
type Confirm = { title: string; body: string; yes: string };
type ConfirmFor = { status: BookingStatus; amount: string; free: boolean; lastMinute: boolean; returnVisit: boolean };
const CONFIRM: Partial<Record<Step, (job: ConfirmFor) => Confirm>> = {
  // A return visit doesn't go to the other technicians: PatchUp (an admin) gives it to someone.
  decline: ({ status, lastMinute, returnVisit }) =>
    status === "requested"
      ? {
          title: returnVisit ? "Turn down this return visit?" : "Turn down this job?",
          body: returnVisit ? "PatchUp finds another technician to go." : "It goes to the other technicians instead.",
          yes: "Yes, turn it down",
        }
      : {
          title: returnVisit ? "Give this return visit back?" : "Give this job back?",
          body:
            (lastMinute
              ? `${status === "en_route" ? "You're on the way" : "The visit is less than 2 hours away"}, so this is a last-minute give-back: PatchUp is told, and it counts on your record. `
              : "") +
            (returnVisit
              ? "PatchUp finds another technician to go, and you won't see the address any more."
              : "It goes back to the other technicians, and you won't see the address any more."),
          yes: "Yes, give it back",
        },
  complete: ({ amount, free }) =>
    free
      ? { title: "Nothing to collect", body: "Finish the job: there's nothing to pay. This can't be undone.", yes: "Job done" }
      : {
          title: `Collect ${amount} in cash`,
          body: "Finish the job once the customer has paid you. This can't be undone.",
          yes: "Job done, paid",
        },
};

// The booking functions' own messages are written for people; anything else
// (a dropped connection, say) gets a general one.
function stepErrorMessage(error: PostgrestError) {
  if (error.code === "P0001" || error.code === "42501" || error.code === "P0002") return error.message;
  return "That didn't go through. Check your connection and try again.";
}

// The technician's next steps for a job, depending on where it is.
export function JobActions({
  jobId,
  status,
  mine,
  inspectionFee,
  discount,
  amountDue,
  clash = null,
  lastMinute,
  returnVisit = false,
}: {
  jobId: string;
  status: BookingStatus;
  mine: boolean;
  inspectionFee: number;
  /** Taken off what the customer pays (their first-booking offer). */
  discount: number;
  amountDue: number;
  /** A request: the job of theirs it comes within two hours of, which stops them taking it. */
  clash?: string | null;
  /** Their job, for warning about giving it back at the last minute. */
  lastMinute?: LastMinuteCheck;
  /** A return visit under warranty (see lib/warranty). */
  returnVisit?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Step | null>(null);
  const [confirming, setConfirming] = useState<Step | null>(null);
  // Read when "Give back this job" is tapped.
  const [lastMinuteNow, setLastMinuteNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (step: Step) => {
    // Leaving for the job: ask for the location now, while the tap counts as
    // permission to ask, so sharing it (LocationSharing) can start by itself.
    if (step === "en_route") navigator.geolocation?.getCurrentPosition(() => {}, () => {}, { maximumAge: 60_000 });
    const supabase = createClient();
    const booking_id = jobId;
    setPending(step);
    setError(null);
    const { error } = await {
      accept: () => supabase.rpc("accept_booking", { booking_id }),
      decline: () => supabase.rpc("decline_booking", { booking_id }),
      en_route: () => supabase.rpc("mark_en_route", { booking_id }),
      arrived: () => supabase.rpc("mark_arrived", { booking_id }),
      complete: () => supabase.rpc("complete_booking", { booking_id }),
    }[step]();
    setPending(null);
    setConfirming(null);
    if (error) {
      setError(stepErrorMessage(error));
      return;
    }
    if (step === "decline") router.push("/jobs");
    router.refresh();
  };

  const confirm =
    confirming &&
    CONFIRM[confirming]?.({
      status,
      amount: formatPeso(amountDue),
      free: amountDue === 0,
      lastMinute: lastMinuteNow,
      returnVisit,
    });
  if (confirming && confirm) {
    return (
      <div role="group" aria-label={confirm.title} className="rounded-card bg-white p-5 shadow-sm">
        <p className="font-semibold text-ink">{confirm.title}</p>
        <p className="mt-1 text-sm text-muted">{confirm.body}</p>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending !== null}>
            Not yet
          </Button>
          <Button variant={confirming === "decline" ? "danger" : "primary"} onClick={() => run(confirming)} disabled={pending !== null}>
            {pending ? "One moment…" : confirm.yes}
          </Button>
        </div>
      </div>
    );
  }

  const button = (step: Step, label: string, variant: "primary" | "secondary" | "danger" = "primary") => (
    <Button
      variant={variant}
      disabled={pending !== null}
      onClick={() => {
        if (step === "decline") setLastMinuteNow(lastMinute !== undefined && isLastMinute(lastMinute, Date.now()));
        if (CONFIRM[step]) setConfirming(step);
        else run(step);
      }}
    >
      {pending === step ? "One moment…" : label}
    </Button>
  );

  let actions;
  if (status === "requested") {
    actions = (
      <>
        {clash ? (
          <p className="rounded-card bg-white p-5 text-sm text-ink shadow-sm">
            You already have a job then: {clash}. Leave this one for another technician
            {mine ? ", or turn it down" : ""}.
          </p>
        ) : (
          button("accept", "Accept job")
        )}
        {mine && button("decline", "Turn down", "danger")}
      </>
    );
  } else if (!mine) {
    actions = null;
  } else if (status === "accepted") {
    actions = (
      <>
        {button("en_route", "I'm on my way")}
        {button("arrived", "I've arrived", "secondary")}
        {button("decline", "Give back this job", "danger")}
      </>
    );
  } else if (status === "en_route") {
    actions = (
      <>
        {button("arrived", "I've arrived")}
        {button("decline", "Give back this job", "danger")}
      </>
    );
  } else if (status === "arrived") {
    actions = (
      <>
        <QuoteForm jobId={jobId} inspectionFee={inspectionFee} discount={discount} returnVisit={returnVisit} />
        <p className="mt-2 text-sm text-muted">
          {returnVisit
            ? "Fixed it without new parts, or nothing to fix? Finish at no charge."
            : "No repair needed, or the customer doesn't want one? Finish with the inspection only."}
        </p>
        {button(
          "complete",
          returnVisit ? "Finish: no charge" : `Finish: inspection only (${formatPeso(payable(inspectionFee, discount))})`,
          "secondary",
        )}
      </>
    );
  } else if (status === "quoted") {
    actions = (
      <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
        Waiting for the customer to approve your quote. Start the repair once they do.
      </p>
    );
  } else if (status === "in_progress") {
    actions = button("complete", "Job done");
  }

  if (!actions && !error) return null;
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {actions}
    </div>
  );
}
