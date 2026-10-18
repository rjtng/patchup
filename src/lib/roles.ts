import type { JwtPayload } from "@supabase/supabase-js";

// Whether to show someone the technician screens (Jobs) or the customer ones
// (Home, Bookings, …). Technicians sign up with `role: "technician"` in their
// account details, which is also what makes the database create their
// technician profile, and the session carries it, so no lookup is needed.
// It only picks screens: the database decides what anyone may do, so a
// customer who edits it just gets empty technician screens.
export function isTechnician(claims: JwtPayload | null | undefined) {
  return claims?.user_metadata?.role === "technician";
}

/** Where someone's app starts. */
export const homeFor = (claims: JwtPayload | null | undefined) => (isTechnician(claims) ? "/jobs" : "/home");
