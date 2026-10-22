"use client";

import { clashes, isSlotOpen, TIME_SLOTS, upcomingDays, visitTime } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { onTimeOff, worksAt, type TimeOff, type WorkingDay } from "@/lib/working-hours";

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

/**
 * What else decides whether a time can be picked, for a technician: when
 * they're taken (`busy`, in ms: within two hours of another of their jobs),
 * how far ahead it must be (`lead`, see isSlotOpen), their working hours and
 * their days off.
 */
export type Availability = { busy?: number[]; lead?: number; hours?: WorkingDay[]; timeOff?: TimeOff[] };

/** Whether a slot can be picked: far enough ahead, and the technician (if any) works then and isn't taken. */
export const slotFree = (
  day: string,
  slot: string,
  now: number,
  { busy = [], lead, hours = [], timeOff = [] }: Availability = {},
) => {
  const at = Date.parse(visitTime(day, slot));
  return isSlotOpen(day, slot, now, lead) && worksAt(hours, at) && !onTimeOff(timeOff, at) && !clashes(at, busy);
};

/** The first day with a time that can be picked. */
export const firstFreeDay = (now: number, availability: Availability = {}) => {
  const days = upcomingDays(now);
  return (days.find((d) => TIME_SLOTS.some((s) => slotFree(d.value, s.value, now, availability))) ?? days[0]).value;
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
  hours = [],
  timeOff = [],
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
  /** The technician's working hours: times outside them are off. */
  hours?: WorkingDay[];
  /** and their days off. */
  timeOff?: TimeOff[];
  error?: string;
  /** What it sits in, so the scrolling row of days runs to its edges: the page, or a card. */
  inset?: "page" | "card";
}) {
  const days = upcomingDays(now);
  const isCurrent = (day: string, slot: string) =>
    current !== undefined && Date.parse(visitTime(day, slot)) === Date.parse(current);
  const free = (day: string, slot: string) =>
    slotFree(day, slot, now, { busy, lead, hours, timeOff }) && !isCurrent(day, slot);

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
          // Too soon is plain (greyed out); the time it is now, off and taken say so.
          const at = Date.parse(visitTime(value.day, s.value));
          const note = !isSlotOpen(value.day, s.value, now, lead)
            ? null
            : isCurrent(value.day, s.value)
              ? "Now"
              : !worksAt(hours, at) || onTimeOff(timeOff, at)
                ? "Off"
                : clashes(at, busy)
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
