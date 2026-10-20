"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { formatPeso } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";

// Recording that PatchUp paid a technician back what it owes them. The money
// goes by GCash or bank first; this keeps the record and tells the technician.
export function PayBack({ technicianId, name, amount }: { technicianId: string; name: string; amount: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async () => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("record_payout", {
      technician: technicianId,
      amount,
      reference: reference.trim(),
    });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't record it. Check your connection and try again.");
      // Start again from what's owed now (more may be owed than the admin saw).
      setConfirming(false);
      router.refresh();
      return;
    }
    setConfirming(false);
    setReference("");
    router.refresh();
  };

  const message = error && (
    <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );

  if (!confirming) {
    return (
      <div className="mt-4 flex flex-col gap-3">
        {message}
        <Button
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Mark {formatPeso(amount)} as paid
        </Button>
      </div>
    );
  }
  return (
    <div role="group" aria-label={`Pay ${name} back`} className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
      <div>
        <p className="font-semibold text-ink">
          Mark {formatPeso(amount)} to {name} as paid?
        </p>
        <p className="mt-1 text-sm text-muted">Do this once you&apos;ve sent it. We&apos;ll tell them.</p>
      </div>
      <TextField
        label="GCash or bank reference (optional)"
        hint="They'll see this."
        maxLength={100}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      {message}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Not yet
        </Button>
        <Button onClick={record} disabled={pending}>
          {pending ? "Saving…" : "Yes, it's paid"}
        </Button>
      </div>
    </div>
  );
}
