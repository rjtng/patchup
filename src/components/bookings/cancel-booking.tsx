"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isLastMinuteCancel, PAUSE_AFTER, type LastMinuteCheck } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";

/** A visit a technician has, for warning about cancelling it at the last minute. */
export type CancelCheck = LastMinuteCheck & {
  /** The technician's first name. */
  who: string;
  /** The customer's last-minute cancellations in the last 30 days. */
  cancellations: number;
};

/** The check, if cancelling now would be last-minute (read when Cancel is tapped). */
export const lastMinuteNow = (check?: CancelCheck) =>
  check && isLastMinuteCancel(check, Date.now()) ? check : undefined;

// Cancelling asks for confirmation first; it can't be undone.
export function CancelBooking({ bookingId, check }: { bookingId: string; check?: CancelCheck }) {
  const [confirming, setConfirming] = useState<{ lastMinute?: CancelCheck } | null>(null);

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming({ lastMinute: lastMinuteNow(check) })}>
        Cancel booking
      </Button>
    );
  }
  return <CancelConfirm bookingId={bookingId} lastMinute={confirming.lastMinute} onClose={() => setConfirming(null)} />;
}

/**
 * "Cancel this booking?": Keep it, or Yes, cancel (either closes it, with
 * onClose). At the last minute, it says so first, and what it leads to.
 */
export function CancelConfirm({
  bookingId,
  lastMinute,
  onClose,
}: {
  bookingId: string;
  lastMinute?: CancelCheck;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("cancel_booking", { booking_id: bookingId });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't cancel it. Check your connection and try again.");
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <div role="group" aria-label="Cancel this booking?" className="rounded-card bg-white p-5 shadow-sm">
      <p className="font-semibold text-ink">Cancel this booking?</p>
      {lastMinute ? (
        <LastMinuteNote check={lastMinute} />
      ) : (
        <p className="mt-1 text-sm text-muted">This can&apos;t be undone.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Keep it
        </Button>
        <Button variant="danger" onClick={cancel} disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel"}
        </Button>
      </div>
    </div>
  );
}

const NTH = ["first", "second", "third"];

function LastMinuteNote({ check }: { check: CancelCheck }) {
  const count = check.cancellations + 1;
  return (
    <div className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-ink">
      <p className="font-semibold text-danger">This is a last-minute cancellation</p>
      <p className="mt-1">
        {check.status === "en_route"
          ? `${check.who} is already on the way.`
          : `The visit is less than 2 hours away, and ${check.who} has set the time aside for you.`}{" "}
        {count < PAUSE_AFTER
          ? `It would be your ${NTH[count - 1]} in 30 days. After ${PAUSE_AFTER}, you can't book new repairs for a while.`
          : `With ${count} in 30 days, you couldn't book new repairs for a while.`}
      </p>
    </div>
  );
}
