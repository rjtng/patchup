"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

export type Candidate = {
  id: string;
  name: string;
  city: string;
  available: boolean;
  rating: number;
  reviews: number;
  /** Has another job within two hours of this visit: can't be given it. */
  busy: boolean;
};

/**
 * For a request nobody has taken (or one the chosen technician hasn't
 * answered): pick an approved technician in the service and give them the
 * job. Both they and the customer are told. For a job a technician has taken
 * but not set off for (`current`), the same gives it to someone else, and the
 * technician who had it is told too.
 */
export function AssignTechnician({
  bookingId,
  category,
  askedFor,
  current = null,
  technicians: candidates,
}: {
  bookingId: string;
  category: string;
  askedFor: string | null;
  /** The technician who has the job, and whether they're running late. */
  current?: { id: string; name: string; late: boolean } | null;
  technicians: Candidate[];
}) {
  const technicians = candidates.filter((t) => t.id !== current?.id);
  const title = current ? "Give the job to someone else" : "Assign a technician";
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
      <section aria-label={title} className="rounded-card bg-white p-5 text-sm shadow-sm">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <p className="mt-1 text-muted">
          There are no {current ? "other " : ""}approved {category.toLowerCase()} technicians yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-label={title} className="rounded-card bg-white p-5 shadow-sm">
      <fieldset>
        <legend className="text-base font-bold text-ink">{title}</legend>
        <p className="mt-1 text-sm text-muted">
          {current
            ? current.late
              ? `${current.name} hasn't set off for this visit. Choose someone else to give it to; the new technician, ${current.name} and the customer are all told.`
              : `${current.name} has this job. If they can't do it, choose someone else to give it to; the new technician, ${current.name} and the customer are all told.`
            : askedFor
              ? "The customer asked for someone who hasn't answered yet. You can give the job to them or someone else."
              : "Nobody has taken this request yet. Give it to an approved technician."}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {technicians.map((t) => (
            <label
              key={t.id}
              className={cn(
                "flex items-center gap-3 rounded-field border-2 p-3 text-sm transition-colors",
                t.busy
                  ? "cursor-not-allowed border-line opacity-60"
                  : chosen === t.id
                    ? "cursor-pointer border-brand-navy bg-brand-navy/5"
                    : "cursor-pointer border-line hover:border-brand-navy/50",
              )}
            >
              <input
                type="radio"
                name="technician"
                value={t.id}
                checked={chosen === t.id}
                disabled={t.busy}
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
                  {t.city && <>{t.city} ·</>}{" "}
                  {t.busy ? "Has another job then" : t.available ? "Taking jobs" : "Not taking jobs now"}
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
        {pending ? "Assigning…" : picked ? `${current ? "Give it to" : "Assign"} ${picked.name}` : "Choose a technician"}
      </Button>
    </section>
  );
}
