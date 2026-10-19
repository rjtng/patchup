"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { VerificationStatus } from "@/lib/admin";
import { createClient } from "@/lib/supabase/client";

type Action = { to: VerificationStatus; label: string; danger?: boolean; confirm: (name: string) => string; done: string };

const APPROVE: Action = {
  to: "approved",
  label: "Approve",
  confirm: (name) => `${name} will be able to take jobs, and we'll let them know.`,
  done: "Approved. We've let them know.",
};
const REJECT: Action = {
  to: "rejected",
  label: "Don't approve",
  danger: true,
  confirm: (name) => `We'll tell ${name} their application wasn't approved, and to contact PatchUp support.`,
  done: "Not approved. We've let them know.",
};
const SUSPEND: Action = {
  to: "suspended",
  label: "Suspend",
  danger: true,
  confirm: (name) =>
    `${name} stops getting new jobs right away, and we'll let them know. Jobs they already have stay with them: cancel those from Bookings if needed.`,
  done: "Suspended. We've let them know.",
};
const REINSTATE: Action = { ...APPROVE, label: "Reinstate", done: "Reinstated. We've let them know." };

// What an admin can do with an account in each state.
const ACTIONS: Record<VerificationStatus, Action[]> = {
  pending: [APPROVE, REJECT],
  approved: [SUSPEND],
  suspended: [REINSTATE],
  rejected: [APPROVE],
};

/** Approve, turn down, suspend or reinstate a technician, after confirming. */
export function VerificationActions({
  technicianId,
  name,
  status,
}: {
  technicianId: string;
  name: string;
  status: VerificationStatus;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const apply = async (action: Action) => {
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("set_technician_verification", {
      technician_id: technicianId,
      status: action.to,
    });
    setPending(false);
    if (error) {
      setError("That didn't work. Check your connection and try again.");
      return;
    }
    setConfirming(null);
    setDone(action.done);
    router.refresh();
  };

  return (
    <section aria-label="Account" className="flex flex-col gap-3">
      {done && (
        <p role="status" className="rounded-card bg-brand-navy/10 px-4 py-3 text-sm font-semibold text-brand-navy">
          {done}
        </p>
      )}
      {confirming ? (
        <div role="group" aria-label={`${confirming.label}?`} className="rounded-card bg-white p-5 shadow-sm">
          <p className="font-semibold text-ink">{confirming.label}?</p>
          <p className="mt-1 text-sm text-muted">{confirming.confirm(name)}</p>
          {error && (
            <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Go back
            </Button>
            <Button variant={confirming.danger ? "danger" : "primary"} onClick={() => apply(confirming)} disabled={pending}>
              {pending ? "Saving…" : `Yes, ${confirming.label.toLowerCase()}`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          {ACTIONS[status].map((action) => (
            <Button
              key={action.to}
              variant={action.danger ? "danger" : "primary"}
              onClick={() => {
                setDone(null);
                setError(null);
                setConfirming(action);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
