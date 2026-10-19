"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/text-field";
import { createClient } from "@/lib/supabase/client";

// An admin can cancel a booking at any step before it's done. The reason goes
// to the customer and the technician, and on the booking's timeline.
export function AdminCancel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("cancel_booking", { booking_id: bookingId, reason: reason.trim() || undefined });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't cancel it. Check your connection and try again.");
      return;
    }
    setConfirming(false);
    router.refresh();
  };

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Cancel booking
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Cancel this booking?" className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
      <div>
        <p className="font-semibold text-ink">Cancel this booking?</p>
        <p className="mt-1 text-sm text-muted">We&apos;ll tell the customer and the technician. This can&apos;t be undone.</p>
      </div>
      <TextAreaField
        label="Reason (optional)"
        hint="They'll see this."
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
        <Button variant="danger" onClick={cancel} disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel"}
        </Button>
      </div>
    </div>
  );
}
