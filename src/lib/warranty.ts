import type { BookingStatus } from "@/lib/bookings";

// The repair warranty (see the repair warranty migration): a repair (a job
// done after the customer approved a quote) gets a free return visit if the
// problem comes back within 30 days. It goes to the technician who did the
// repair: no inspection fee, and no charge for the work (new parts are quoted
// first). A repair gets one return visit, and a return visit has no warranty
// of its own.

export const WARRANTY_DAYS = 30;
const WARRANTY_MS = WARRANTY_DAYS * 24 * 60 * 60 * 1000;

/** Until when a booking's warranty runs (ms), as private.warranty_until: null if it has none. */
export function warrantyUntil(booking: {
  status: BookingStatus;
  completed_at: string | null;
  return_of: string | null;
  quotes: { status: string }[];
}) {
  if (booking.status !== "completed" || !booking.completed_at || booking.return_of) return null;
  if (!booking.quotes.some((q) => q.status === "approved")) return null;
  return Date.parse(booking.completed_at) + WARRANTY_MS;
}

/** A repair's return visit that counts: the latest that wasn't cancelled (there's at most one). */
export const liveReturnVisit = <T extends { status: BookingStatus }>(returnVisits: T[]) =>
  returnVisits.filter((r) => r.status !== "cancelled").at(-1) ?? null;
