"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// An admin hides a review that breaks the rules: others stop seeing it, it
// stops counting in the technician's rating, and the customer is told. Or
// shows it again.
export function HideReview({
  bookingId,
  hidden,
  customerName,
}: {
  bookingId: string;
  hidden: boolean;
  customerName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (hide: boolean) => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("set_review_hidden", { booking_id: bookingId, hidden: hide });
    setPending(false);
    if (error) {
      setError("We couldn't save it. Check your connection and try again.");
      return;
    }
    setConfirming(false);
    router.refresh();
  };

  const alert = error && (
    <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );

  if (hidden) {
    return (
      <>
        {alert}
        <Button variant="secondary" onClick={() => save(false)} disabled={pending}>
          {pending ? "Saving…" : "Show it again"}
        </Button>
      </>
    );
  }
  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Hide review
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Hide this review?" className="flex flex-col gap-3 border-t border-line pt-4">
      <div>
        <p className="font-semibold text-ink">Hide this review?</p>
        <p className="mt-1 text-sm text-muted">
          Others stop seeing it, and it stops counting in the technician&apos;s rating. {customerName} is told it broke
          the rules for reviews.
        </p>
      </div>
      {alert}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
        <Button variant="danger" onClick={() => save(true)} disabled={pending}>
          {pending ? "Hiding…" : "Yes, hide it"}
        </Button>
      </div>
    </div>
  );
}
