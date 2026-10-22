"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { createClient } from "@/lib/supabase/client";
import { timeOffLabel, type TimeOff as Days } from "@/lib/working-hours";

// Days a technician won't work, on top of their weekly hours, like a holiday
// or a sick day (see add_time_off). Customers can't book them then, and
// requests for any technician don't reach them.
export function TimeOff({ timeOff, today }: { timeOff: (Days & { id: string })[]; today: string }) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  // "add", or the time off being removed.
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const coming = timeOff.filter((t) => t.ends_on >= today);

  const add = async () => {
    setDone(false);
    if (!first) {
      setError("Pick your first day off.");
      return;
    }
    // For one day, the last day can stay empty.
    const end = last || first;
    if (end < first) {
      setError("Pick your first and last day off, in that order.");
      return;
    }
    setPending("add");
    setError(null);
    const { error } = await createClient().rpc("add_time_off", { starts_on: first, ends_on: end });
    setPending(null);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't save it. Check your connection and try again.");
      return;
    }
    setFirst("");
    setLast("");
    setDone(true);
    router.refresh();
  };

  const remove = async (id: string) => {
    setPending(id);
    setError(null);
    setDone(false);
    const { error } = await createClient().rpc("remove_time_off", { time_off_id: id });
    setPending(null);
    if (error) {
      setError("We couldn't remove it. Check your connection and try again.");
      return;
    }
    router.refresh();
  };

  return (
    <section aria-labelledby="time-off" className="flex flex-col gap-4 px-6 pt-8">
      <div>
        <h2 id="time-off" className="text-lg font-bold text-ink">
          Time off
        </h2>
        <p className="mt-1 text-sm text-muted">
          Days you won&apos;t work, like a holiday or a sick day. Customers can&apos;t book you then, and you don&apos;t
          get requests for those days.
        </p>
      </div>
      {coming.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">No time off coming up.</p>
      ) : (
        <ul
          aria-label="Coming time off"
          className="flex flex-col divide-y divide-line rounded-card bg-white px-5 shadow-sm"
        >
          {coming.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold text-ink">{timeOffLabel(t)}</span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                disabled={pending !== null}
                aria-label={`Remove time off: ${timeOffLabel(t)}`}
                className="min-h-11 px-2 font-semibold text-danger underline disabled:opacity-50"
              >
                {pending === t.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          type="date"
          label="First day off"
          min={today}
          value={first}
          onChange={(e) => {
            setFirst(e.target.value);
            setError(null);
          }}
        />
        <TextField
          type="date"
          label="Last day off"
          min={first || today}
          value={last}
          onChange={(e) => {
            setLast(e.target.value);
            setError(null);
          }}
        />
      </div>
      <p className="-mt-2 text-sm text-muted">For one day, leave the last day empty.</p>
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-field bg-brand-navy/5 px-4 py-3 text-sm text-brand-navy">
          Added.
        </p>
      )}
      <Button variant="secondary" onClick={add} disabled={pending !== null}>
        {pending === "add" ? "Adding…" : "Add time off"}
      </Button>
    </section>
  );
}
