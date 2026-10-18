"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Cancelling asks for confirmation first; it can't be undone.
export function CancelBooking({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
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
    <div role="group" aria-label="Cancel this booking?" className="rounded-card bg-white p-5 shadow-sm">
      <p className="font-semibold text-ink">Cancel this booking?</p>
      <p className="mt-1 text-sm text-muted">This can&apos;t be undone.</p>
      {error && (
        <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-3">
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
