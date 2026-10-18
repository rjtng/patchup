import type { Enums } from "@/lib/supabase/database.types";

export type BookingStatus = Enums<"booking_status">;

// Visits happen in the Philippines, so dates and times are always shown and
// chosen in Manila time, whatever the device's own time zone.
const TIME_ZONE = "Asia/Manila";
const MANILA_OFFSET = "+08:00"; // no daylight saving

export function formatPeso(amount: number) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/** "Mon, Oct 20, 10:00 AM" */
export function formatSchedule(iso: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const STATUS: Record<BookingStatus, { label: string; tone: "waiting" | "active" | "done" | "cancelled" }> = {
  requested: { label: "Finding a technician", tone: "waiting" },
  accepted: { label: "Technician confirmed", tone: "active" },
  en_route: { label: "Technician on the way", tone: "active" },
  arrived: { label: "Technician has arrived", tone: "active" },
  quoted: { label: "Quote ready", tone: "waiting" },
  in_progress: { label: "Repair in progress", tone: "active" },
  completed: { label: "Completed", tone: "done" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
};

// The booking timeline's steps (booking_events.event).
export const EVENT_LABELS: Record<string, string> = {
  created: "Booking made",
  accepted: "Technician accepted",
  declined: "Technician couldn't make it; finding another",
  assigned: "Technician assigned",
  en_route: "Technician on the way",
  arrived: "Technician arrived",
  quote_sent: "Quote sent",
  quote_approved: "Quote approved",
  quote_declined: "Quote declined",
  completed: "Job completed",
  cancelled: "Booking cancelled",
};

// Customers can cancel until the technician arrives (the database enforces it too).
export const CUSTOMER_CAN_CANCEL: BookingStatus[] = ["requested", "accepted", "en_route"];

export const isFinished = (status: BookingStatus) => status === "completed" || status === "cancelled";

// --- Choosing a visit time ---------------------------------------------------

export const TIME_SLOTS = [
  { value: "08:00", label: "8:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "17:00", label: "5:00 PM" },
];

const DAYS_AHEAD = 14;
const LEAD_TIME_MS = 60 * 60 * 1000; // a technician needs at least an hour's notice

/** The visit time as an ISO timestamp, from a Manila date ("2026-10-20") and slot ("10:00"). */
export const visitTime = (day: string, slot: string) => `${day}T${slot}:00${MANILA_OFFSET}`;

export function isSlotOpen(day: string, slot: string, now: number) {
  return Date.parse(visitTime(day, slot)) >= now + LEAD_TIME_MS;
}

/** The next two weeks of Manila dates, labelled "Today", "Tomorrow", "Wed 22", … */
export function upcomingDays(now: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now); // YYYY-MM-DD
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const value = date.toISOString().slice(0, 10);
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Tomorrow"
          : `${new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "short" }).format(date)} ${date.getUTCDate()}`;
    const month = new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "short" }).format(date);
    // What screen readers announce, e.g. "Tomorrow, Monday, October 19".
    const long = new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(date);
    const spoken = i < 2 ? `${label}, ${long}` : long;
    return { value, label, month, spoken, open: TIME_SLOTS.some((s) => isSlotOpen(value, s.value, now)) };
  });
}
