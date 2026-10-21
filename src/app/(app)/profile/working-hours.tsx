"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TIME_SLOTS } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";
import { hhmm, WEEKDAYS, type WorkingDay } from "@/lib/working-hours";

const FIRST = TIME_SLOTS[0].value;
const LAST = TIME_SLOTS[TIME_SLOTS.length - 1].value;

// The days a technician works, and their first and last visit on each (see
// set_working_hours). Customers who ask for them pick a time within these,
// and requests for any technician reach them only then.
export function WorkingHours({ initial }: { initial: WorkingDay[] }) {
  const router = useRouter();
  const [days, setDays] = useState(() =>
    WEEKDAYS.map((d) => {
      const set = initial.find((h) => h.weekday === d.value);
      // Until they set their hours they work any time: every day, from the first visit time to the last.
      return {
        weekday: d.value,
        on: initial.length === 0 || set !== undefined,
        first: set ? hhmm(set.first_visit) : FIRST,
        last: set ? hhmm(set.last_visit) : LAST,
      };
    }),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const update = (weekday: number, change: Partial<(typeof days)[number]>) => {
    setDone(false);
    setError(null);
    setDays((list) => list.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)));
  };

  const save = async () => {
    const chosen = days.filter((d) => d.on);
    if (chosen.length === 0) {
      setError("Pick at least one day. To stop new jobs for a while, turn off Taking new jobs.");
      return;
    }
    if (chosen.some((d) => d.first > d.last)) {
      setError("A day's last visit can't be before its first.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("set_working_hours", {
      days: chosen.map((d) => ({ weekday: d.weekday, first_visit: d.first, last_visit: d.last })),
    });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't save them. Check your connection and try again.");
      return;
    }
    setDone(true);
    router.refresh();
  };

  return (
    <section aria-labelledby="hours" className="flex flex-col gap-4 px-6 pt-8">
      <div>
        <h2 id="hours" className="text-lg font-bold text-ink">
          Working hours
        </h2>
        <p className="mt-1 text-sm text-muted">
          Customers who ask for you pick a time within these, and requests for any technician reach you only then.
          {initial.length === 0 && " Until you save them, you get requests for any time."}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-card bg-white px-5 shadow-sm">
        {days.map((d) => {
          const day = WEEKDAYS[d.weekday - 1].long;
          return (
            <li key={d.weekday} className="flex flex-col gap-3 py-4">
              <Checkbox checked={d.on} onChange={(e) => update(d.weekday, { on: e.target.checked })}>
                <span className="font-semibold">{day}</span>
              </Checkbox>
              {d.on && (
                <div className="grid grid-cols-2 gap-3">
                  <TimeSelect
                    label="First visit"
                    name={`${day}, first visit`}
                    value={d.first}
                    onChange={(first) => update(d.weekday, { first })}
                  />
                  <TimeSelect
                    label="Last visit"
                    name={`${day}, last visit`}
                    value={d.last}
                    onChange={(last) => update(d.weekday, { last })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-field bg-brand-navy/5 px-4 py-3 text-sm text-brand-navy">
          Saved.
        </p>
      )}
      <Button onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save working hours"}
      </Button>
    </section>
  );
}

/** A visit time, from the times customers can book. `name` is what screen readers announce. */
function TimeSelect({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
      </label>
      <select
        id={id}
        aria-label={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-field border-2 border-line bg-white px-3 text-base text-ink focus:border-brand-navy focus:outline-none"
      >
        {TIME_SLOTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
