"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

export type Candidate = { id: string; name: string; city: string; available: boolean; rating: number; reviews: number };

/**
 * For a request nobody has taken (or one the chosen technician hasn't
 * answered): pick an approved technician in the service and give them the
 * job. Both they and the customer are told.
 */
export function AssignTechnician({
  bookingId,
  category,
  askedFor,
  technicians,
}: {
  bookingId: string;
  category: string;
  askedFor: string | null;
  technicians: Candidate[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = technicians.find((t) => t.id === chosen);

  const assign = async () => {
    if (!picked) return;
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("assign_technician", { booking_id: bookingId, technician_id: picked.id });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't assign them. Check your connection and try again.");
      router.refresh();
      return;
    }
    router.refresh();
  };

  if (technicians.length === 0) {
    return (
      <section aria-label="Assign a technician" className="rounded-card bg-white p-5 text-sm shadow-sm">
        <h2 className="text-base font-bold text-ink">Assign a technician</h2>
        <p className="mt-1 text-muted">There are no approved {category.toLowerCase()} technicians yet.</p>
      </section>
    );
  }

  return (
    <section aria-label="Assign a technician" className="rounded-card bg-white p-5 shadow-sm">
      <fieldset>
        <legend className="text-base font-bold text-ink">Assign a technician</legend>
        <p className="mt-1 text-sm text-muted">
          {askedFor
            ? "The customer asked for someone who hasn't answered yet. You can give the job to them or someone else."
            : "Nobody has taken this request yet. Give it to an approved technician."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {technicians.map((t) => (
            <label
              key={t.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-field border-2 p-3 text-sm transition-colors",
                chosen === t.id ? "border-brand-navy bg-brand-navy/5" : "border-line hover:border-brand-navy/50",
              )}
            >
              <input
                type="radio"
                name="technician"
                value={t.id}
                checked={chosen === t.id}
                onChange={() => setChosen(t.id)}
                className="size-5 accent-brand-navy"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">
                  {t.name}
                  {t.id === askedFor && <span className="font-normal text-muted"> · the customer&apos;s choice</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-1 text-muted">
                  {t.reviews > 0 && (
                    <>
                      <Star aria-hidden className="size-3.5 fill-brand-yellow text-brand-yellow" />
                      {t.rating.toFixed(1)} ·
                    </>
                  )}
                  {t.city && <>{t.city} ·</>} {t.available ? "Taking jobs" : "Not taking jobs now"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button className="mt-4" onClick={assign} disabled={!picked || pending}>
        {pending ? "Assigning…" : picked ? `Assign ${picked.name}` : "Choose a technician"}
      </Button>
    </section>
  );
}
