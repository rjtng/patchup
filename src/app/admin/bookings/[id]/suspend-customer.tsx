"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/text-field";
import { formatDay } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";

// An admin suspends a customer (they can't book new repairs until it's
// lifted; bookings they have go on), or lifts it. They're told either way.
export function SuspendCustomer({
  customerId,
  name,
  suspension,
}: {
  customerId: string;
  name: string;
  /** Their suspension, if they're suspended. */
  suspension: { reason: string; suspended_at: string } | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (suspend: boolean) => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("set_customer_suspended", {
      customer_id: customerId,
      suspended: suspend,
      reason: reason.trim(),
    });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't save it. Check your connection and try again.");
      return;
    }
    setConfirming(false);
    setReason("");
    router.refresh();
  };

  const alert = error && (
    <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );

  if (suspension) {
    return (
      <section aria-label="Customer's account" className="flex flex-col gap-3 rounded-card bg-danger/5 p-5 text-sm">
        <div>
          <p className="font-semibold text-danger">
            {name} is suspended since {formatDay(suspension.suspended_at)}
          </p>
          <p className="mt-1 text-ink">
            They can&apos;t book new repairs.{suspension.reason && ` Reason: ${suspension.reason}`}
          </p>
        </div>
        {alert}
        <Button variant="secondary" onClick={() => save(false)} disabled={pending}>
          {pending ? "Saving…" : "Lift suspension"}
        </Button>
      </section>
    );
  }
  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Suspend {name}
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label={`Suspend ${name}?`}
      className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm"
    >
      <div>
        <p className="font-semibold text-ink">Suspend {name}?</p>
        <p className="mt-1 text-sm text-muted">
          They can&apos;t book new repairs until you lift it. Bookings they already have go on. We&apos;ll tell them.
        </p>
      </div>
      <TextAreaField
        label="Reason (optional)"
        hint="They'll see this."
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {alert}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Not now
        </Button>
        <Button variant="danger" onClick={() => save(true)} disabled={pending}>
          {pending ? "Suspending…" : "Suspend"}
        </Button>
      </div>
    </div>
  );
}
