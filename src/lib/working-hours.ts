import { TIME_SLOTS } from "@/lib/bookings";

// Technicians' working hours (see the working hours migration): the days they
// work, and their first and last visit time on each, in Manila. A technician
// who hasn't set any works any time.

export type WorkingDay = { weekday: number; first_visit: string; last_visit: string };

/** ISO weekdays, Monday first (1 Monday … 7 Sunday), as the database has them. */
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

const MANILA_MS = 8 * 60 * 60 * 1000; // UTC+8, with no daylight saving

/** "08:00", from a time as the database gives it ("08:00:00"). */
export const hhmm = (time: string) => time.slice(0, 5);

/** "8:00 AM" */
export function clockLabel(time: string) {
  const slot = TIME_SLOTS.find((s) => s.value === hhmm(time));
  if (slot) return slot.label;
  const [h, m] = hhmm(time).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Whether they work at a moment (ms): on its weekday in Manila, between their first and last visit. */
export function worksAt(hours: WorkingDay[], at: number) {
  if (hours.length === 0) return true;
  const manila = new Date(at + MANILA_MS);
  const weekday = ((manila.getUTCDay() + 6) % 7) + 1;
  const time = `${String(manila.getUTCHours()).padStart(2, "0")}:${String(manila.getUTCMinutes()).padStart(2, "0")}`;
  return hours.some((h) => h.weekday === weekday && hhmm(h.first_visit) <= time && time <= hhmm(h.last_visit));
}

/** "Mon–Fri 8:00 AM–5:00 PM · Sat 8:00 AM–1:00 PM", or null when they haven't set hours (they work any time). */
export function hoursSummary(hours: WorkingDay[]) {
  if (hours.length === 0) return null;
  const groups: { from: number; to: number; first: string; last: string }[] = [];
  for (const h of [...hours].sort((a, b) => a.weekday - b.weekday)) {
    const group = groups.at(-1);
    const [first, last] = [hhmm(h.first_visit), hhmm(h.last_visit)];
    if (group && group.to === h.weekday - 1 && group.first === first && group.last === last) group.to = h.weekday;
    else groups.push({ from: h.weekday, to: h.weekday, first, last });
  }
  const day = (n: number) => WEEKDAYS[n - 1].short;
  return groups
    .map((g) => {
      const days = g.from === g.to ? day(g.from) : `${day(g.from)}–${day(g.to)}`;
      return `${days} ${g.first === g.last ? clockLabel(g.first) : `${clockLabel(g.first)}–${clockLabel(g.last)}`}`;
    })
    .join(" · ");
}
