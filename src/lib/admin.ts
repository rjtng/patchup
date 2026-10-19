import type { BookingStatus } from "@/lib/bookings";
import type { Enums, Json } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

export type VerificationStatus = Enums<"verification_status">;

/**
 * Whether the signed-in person is a PatchUp admin (profiles.role). Only picks
 * what to show: the database checks it again for everything an admin does.
 */
export async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", auth.claims.sub).maybeSingle();
  return data?.role === "admin";
}

// --- Overview -------------------------------------------------------------------

/** What admin_overview() counts (see the admin migration). */
export type Overview = {
  pending_technicians: number;
  approved_technicians: number;
  available_technicians: number;
  customers: number;
  unassigned_requests: number;
  stale_requests: number;
  awaiting_technician: number;
  active_bookings: number;
  booked_week: number;
  completed_week: number;
  completed_value_week: number;
  cancelled_week: number;
};

export function overview(data: Json): Overview | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const count = (key: keyof Overview) => Number(data[key] ?? 0);
  return {
    pending_technicians: count("pending_technicians"),
    approved_technicians: count("approved_technicians"),
    available_technicians: count("available_technicians"),
    customers: count("customers"),
    unassigned_requests: count("unassigned_requests"),
    stale_requests: count("stale_requests"),
    awaiting_technician: count("awaiting_technician"),
    active_bookings: count("active_bookings"),
    booked_week: count("booked_week"),
    completed_week: count("completed_week"),
    completed_value_week: count("completed_value_week"),
    cancelled_week: count("cancelled_week"),
  };
}

// --- Technicians ------------------------------------------------------------------

export const VERIFICATION: Record<VerificationStatus, { label: string; tone: "waiting" | "active" | "cancelled" }> = {
  pending: { label: "Waiting for approval", tone: "waiting" },
  approved: { label: "Approved", tone: "active" },
  suspended: { label: "Suspended", tone: "cancelled" },
  rejected: { label: "Not approved", tone: "cancelled" },
};

// The Technicians tab's filters, in order (?status=…).
export const TECHNICIAN_FILTERS: { value: VerificationStatus | "all"; label: string }[] = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Not approved" },
  { value: "all", label: "All" },
];

export const technicianFilter = (value: unknown) =>
  TECHNICIAN_FILTERS.find((f) => f.value === value)?.value ?? "pending";

// --- Bookings ---------------------------------------------------------------------

// The Bookings tab's filters, in order (?show=…).
export const BOOKING_FILTERS = [
  { value: "open", label: "Requests", statuses: ["requested"] },
  { value: "active", label: "In progress", statuses: ["accepted", "en_route", "arrived", "quoted", "in_progress"] },
  { value: "done", label: "Done", statuses: ["completed"] },
  { value: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
] as const satisfies { value: string; label: string; statuses: BookingStatus[] }[];

export type BookingFilter = (typeof BOOKING_FILTERS)[number]["value"];

export const bookingFilter = (value: unknown): BookingFilter =>
  BOOKING_FILTERS.find((f) => f.value === value)?.value ?? "open";

const MINUTE = 60_000;

/**
 * When a request started waiting for a technician: when it was made, or when a
 * technician last gave it back (as the database's private.waiting_since).
 */
export function waitingSince(booking: { created_at: string; booking_events: { event: string; created_at: string }[] }) {
  const starts = booking.booking_events
    .filter((e) => e.event === "created" || e.event === "declined")
    .map((e) => Date.parse(e.created_at));
  return starts.length > 0 ? Math.max(...starts) : Date.parse(booking.created_at);
}

/**
 * When a waiting request needs an admin: 30 minutes on, or once the visit is
 * less than 2 hours away (but not before 10 minutes have gone by). The
 * follow-up job tells admins then (private.follow_up_at in the database).
 */
export const followUpAt = (since: number, scheduledAt: number) =>
  Math.min(since + 30 * MINUTE, Math.max(since + 10 * MINUTE, scheduledAt - 120 * MINUTE));

/** How long something has been waiting: "5 min", "2 hr", "3 days". */
export function formatWaiting(ms: number) {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.floor(hours / 24)} days`;
}
