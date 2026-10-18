"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

// Whether the technician gets new requests (technician_profiles.is_available).
export function AvailabilityToggle({ technicianId, available }: { technicianId: string; available: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(available);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setPending(true);
    setError(false);
    const { error } = await createClient()
      .from("technician_profiles")
      .update({ is_available: next })
      .eq("id", technicianId);
    setPending(false);
    if (error) {
      setOn(!next);
      setError(true);
      return;
    }
    router.refresh(); // the open requests come and go with it
  };

  return (
    <section className="rounded-card bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <h2 id="availability" className="font-bold text-ink">
            Taking new jobs
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {on ? "You get new requests for your services." : "You won't get new requests. Your accepted jobs stay below."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="availability"
          onClick={toggle}
          disabled={pending}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60",
            on ? "bg-brand-navy" : "bg-line",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform",
              on && "translate-x-6",
            )}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          We couldn&apos;t change that. Check your connection and try again.
        </p>
      )}
    </section>
  );
}
