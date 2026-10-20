import type { Enums, Json } from "@/lib/supabase/database.types";

export type BookingStatus = Enums<"booking_status">;

// Visits happen in the Philippines, so dates and times are always shown and
// chosen in Manila time, whatever the device's own time zone.
export const TIME_ZONE = "Asia/Manila";
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

/** "Oct 18, 2026" */
export function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

/** "Oct 18, 2026, 3:15 PM" */
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
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

// The same statuses as technicians see them.
export const TECHNICIAN_STATUS: typeof STATUS = {
  requested: { label: "New request", tone: "waiting" },
  accepted: { label: "Accepted", tone: "active" },
  en_route: { label: "On the way", tone: "active" },
  arrived: { label: "Arrived", tone: "active" },
  quoted: { label: "Waiting for approval", tone: "waiting" },
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
  // From the follow-up on requests nobody takes (see the unanswered requests migration).
  overdue: "Taking longer than usual; the PatchUp team is helping",
  expired: "Cancelled: no technician was free",
  // From the follow-up on technicians who don't set off (see the visit reminders migration).
  late: "Technician running late; the PatchUp team is checking",
  unassigned: "PatchUp gave the job to another technician",
  // A customer or admin moved the visit (see the scheduling migration); the note says from when.
  rescheduled: "Visit time changed",
};

// The same steps at the last minute (booking_events.last_minute; see the booking limits migration).
export const LAST_MINUTE_LABELS: Record<string, string> = {
  cancelled: "Cancelled at the last minute",
  declined: "Technician gave it back at the last minute; finding another",
};

// From accepted until done: while a job is under way, its customer and
// technician can see each other's mobile number (the access rules decide).
export const UNDER_WAY: BookingStatus[] = ["accepted", "en_route", "arrived", "quoted", "in_progress"];

// Customers can cancel until the technician arrives (the database enforces it too).
export const CUSTOMER_CAN_CANCEL: BookingStatus[] = ["requested", "accepted", "en_route"];
// Moving the visit: until the technician sets off.
export const CAN_RESCHEDULE: BookingStatus[] = ["requested", "accepted"];

/** When the technician who has the job took it, or the visit last moved (as the database's private.taken_at). */
export function takenAt(booking: { created_at: string; booking_events: { event: string; created_at: string }[] }) {
  const taken = booking.booking_events
    .filter((e) => e.event === "accepted" || e.event === "assigned" || e.event === "rescheduled")
    .map((e) => Date.parse(e.created_at));
  return taken.length > 0 ? Math.max(...taken) : Date.parse(booking.created_at);
}

// --- Last minute (see the booking limits migration) --------------------------
// A technician has the job, and it's less than 2 hours to the visit or they're
// on the way. The first 10 minutes after they took it (or the time last
// changed) don't count.

export const LAST_MINUTE_MS = 2 * 60 * 60 * 1000;
const LAST_MINUTE_GRACE_MS = 10 * 60 * 1000;
/** How often a customer can move a visit once a technician has it (or was asked for). */
export const MAX_MOVES = 2;
/** Last-minute cancellations in 30 days that pause a customer's booking. */
export const PAUSE_AFTER = 3;

/** A job with a technician, as far as last minute goes. */
export type LastMinuteCheck = { status: BookingStatus; scheduledAt: string; /** See takenAt. */ takenAt: number };

/** Whether giving back the job now is last-minute (as private.is_last_minute). */
export const isLastMinute = (job: LastMinuteCheck, now: number) =>
  job.status === "en_route" ||
  (job.status === "accepted" &&
    Date.parse(job.scheduledAt) - now < LAST_MINUTE_MS &&
    now - job.takenAt > LAST_MINUTE_GRACE_MS);

/** Whether the customer cancelling now is: not once the visit time has passed (the technician is running late). */
export const isLastMinuteCancel = (job: LastMinuteCheck, now: number) =>
  isLastMinute(job, now) && now < Date.parse(job.scheduledAt);

// A technician's jobs under way hold their time: no other within two hours of
// one (the database holds to it; see the scheduling migration).
export const CLASH_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Whether a visit at `at` comes within two hours of one of these busy times (all in ms). */
export const clashes = (at: number, busy: number[]) => busy.some((b) => Math.abs(b - at) < CLASH_WINDOW_MS);

export const isFinished = (status: BookingStatus) => status === "completed" || status === "cancelled";

// --- Quotes and payment -------------------------------------------------------

export type QuoteItem = { description: string; amount: number };

/** quotes.items as stored by send_quote: [{ description, amount }, …]. */
export function quoteItems(items: Json): QuoteItem[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item) && typeof item.description === "string" && typeof item.amount === "number"
      ? [{ description: item.description, amount: item.amount }]
      : [],
  );
}

/**
 * What the customer pays in cash: the inspection fee plus the approved repair,
 * less the booking's discount (the first-booking offer), as complete_booking
 * works it out.
 */
export function amountDue(booking: {
  inspection_fee: number;
  discount: number;
  quotes: { status: string; total: number }[];
}) {
  const repair = booking.quotes.filter((q) => q.status === "approved").reduce((sum, q) => sum + q.total, 0);
  const { inspection_fee: inspection, discount } = booking;
  return { inspection, repair, discount, total: payable(inspection + repair, discount) };
}

/** What's left to pay after a discount (never below zero). */
export const payable = (amount: number, discount: number) => Math.max(amount - discount, 0);

/** How a total is made up: "₱300 inspection + ₱500 repair − ₱100 first-booking offer". */
export function dueParts({ inspection, repair, discount }: { inspection: number; repair: number; discount: number }) {
  let parts = `${formatPeso(inspection)} inspection`;
  if (repair > 0) parts += ` + ${formatPeso(repair)} repair`;
  if (discount > 0) parts += ` − ${formatPeso(discount)} first-booking offer`;
  return parts;
}

// --- Addresses ------------------------------------------------------------------

type BookingAddress = { street: string; barangay: string; city: string; province: string };

export const fullAddress = (b: BookingAddress) => `${b.street}, ${b.barangay}, ${b.city}, ${b.province}`;

/** Opens the address in Google Maps (the app, on phones): its map pin if it has one, else the address. */
export const mapsLink = (b: BookingAddress & { latitude?: number | null; longitude?: number | null }) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    b.latitude != null && b.longitude != null ? `${b.latitude},${b.longitude}` : fullAddress(b),
  )}`;

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

/** Whether a slot is far enough ahead: at least an hour, or `lead` (ms). */
export function isSlotOpen(day: string, slot: string, now: number, lead = LEAD_TIME_MS) {
  return Date.parse(visitTime(day, slot)) >= now + lead;
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
