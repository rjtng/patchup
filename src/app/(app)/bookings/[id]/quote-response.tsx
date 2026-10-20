"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dueParts, formatPeso, payable } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";

// The customer's answer to the technician's quote.
export function QuoteResponse({
  quoteId,
  repair,
  inspectionFee,
  discount,
}: {
  quoteId: string;
  repair: number;
  inspectionFee: number;
  discount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (approve: boolean) => {
    setPending(approve ? "approve" : "decline");
    setError(null);
    const { error } = await createClient().rpc("respond_to_quote", { quote_id: quoteId, approve });
    setPending(null);
    if (error) {
      setError(error.code === "P0001" || error.code === "42501" ? error.message : "That didn't go through. Check your connection and try again.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-muted">
        Approve to start the repair: you&apos;ll pay {formatPeso(payable(repair + inspectionFee, discount))} in cash
        when it&apos;s done ({dueParts({ inspection: inspectionFee, repair, discount })}). If you decline, the
        technician can send a new quote or finish with the inspection only.
      </p>
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button onClick={() => respond(true)} disabled={pending !== null}>
        {pending === "approve" ? "Approving…" : `Approve ${formatPeso(repair)}`}
      </Button>
      <Button variant="secondary" onClick={() => respond(false)} disabled={pending !== null}>
        {pending === "decline" ? "Declining…" : "Decline"}
      </Button>
    </div>
  );
}
