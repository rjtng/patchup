"use client";

import { clashes, isSlotOpen, TIME_SLOTS, upcomingDays, visitTime } from "@/lib/bookings";
import { cn } from "@/lib/cn";

// A radio button styled as a chip. `relative` keeps the hidden input inside the
// chip, so the scrolling row of days can't widen the page.
export const radioChip = (selected: boolean) =>
  cn(
    "relative rounded-field border-2 px-3 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-yellow has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40",
    selected
      ? "border-brand-navy bg-brand-navy text-white"
      : "cursor-pointer border-line bg-white text-ink hover:border-brand-navy/40",
  );

export type VisitChoice = { day: string; slot: string | null };

/** Whether a slot can be picked: far enough ahead (see isSlotOpen), and the technician (if any) isn't taken then. */
export const slotFree = (day: string, slot: string, now: number, busy: number[], lead?: number) =>
  isSlotOpen(day, slot, now, lead) && !clashes(Date.parse(visitTime(day, slot)), busy);

/** The first day with a time that can be picked. */
export const firstFreeDay = (now: number, busy: number[], lead?: number) => {
  const days = upcomingDays(now);
  return (days.find((d) => TIME_SLOTS.some((s) => slotFree(d.value, s.value, now, busy, lead))) ?? days[0]).value;
};

/**
 * The days ahead and the visit times on each. Times too soon, and those when
 * the technician is taken (`busy`, in ms: within two hours of another of
 * their jobs), can't be picked; nor `current`, the time it already is.
 */
export function VisitTimePicker({
  legend,
  value,
  onChange,
  now,
  busy = [],
  current,
  lead,
  error,
  inset = "page",
}: {
  legend: string;
  value: VisitChoice;
  onChange: (value: VisitChoice) => void;
  now: number;
  busy?: number[];
  /** Moving a visit: its time now (ISO). */
  current?: string;
  /** How far ahead a time must be, if more than the usual hour (ms). */
  lead?: number;
  error?: string;
  /** What it sits in, so the scrolling row of days runs to its edges: the page, or a card. */
  inset?: "page" | "card";
}) {
  const days = upcomingDays(now);
  const isCurrent = (day: string, slot: string) =>
    current !== undefined && Date.parse(visitTime(day, slot)) === Date.parse(current);
  const free = (day: string, slot: string) => slotFree(day, slot, now, busy, lead) && !isCurrent(day, slot);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 text-lg font-bold text-ink">{legend}</legend>
      <div className={cn("flex gap-2 overflow-x-auto pb-1", inset === "page" ? "-mx-6 px-6" : "-mx-5 px-5")}>
        {days.map((d) => (
          <label key={d.value} className={cn(radioChip(value.day === d.value), "flex min-w-16 shrink-0 flex-col")}>
            <input
              type="radio"
              name="day"
              value={d.value}
              aria-label={d.spoken}
              checked={value.day === d.value}
              disabled={!TIME_SLOTS.some((s) => free(d.value, s.value))}
              onChange={() =>
                onChange({ day: d.value, slot: value.slot && free(d.value, value.slot) ? value.slot : null })
              }
              className="sr-only"
            />
            <span className={cn("text-xs font-medium", value.day === d.value ? "text-white/80" : "text-muted")}>
              {d.month}
            </span>
            {d.label}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TIME_SLOTS.map((s) => {
          // Too soon is plain (greyed out); taken and the time it is now say so.
          const note = !isSlotOpen(value.day, s.value, now, lead)
            ? null
            : isCurrent(value.day, s.value)
              ? "Now"
              : clashes(Date.parse(visitTime(value.day, s.value)), busy)
                ? "Taken"
                : null;
          return (
            <label key={s.value} className={cn(radioChip(value.slot === s.value), "flex flex-col")}>
              <input
                type="radio"
                name="slot"
                value={s.value}
                aria-label={note ? `${s.label}, ${note.toLowerCase()}` : undefined}
                checked={value.slot === s.value}
                disabled={!free(value.day, s.value)}
                onChange={() => onChange({ day: value.day, slot: s.value })}
                className="sr-only"
              />
              {s.label}
              {note && <span className="text-xs font-medium">{note}</span>}
            </label>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </fieldset>
  );
}
