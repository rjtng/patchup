import { formatPeso } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";

// The first-booking offer, for customers who haven't booked yet (the amount is
// in first_booking_offer; booking takes it off, see create_booking).
export async function FirstBookingOffer() {
  const supabase = await createClient();
  const { data: discount } = await supabase.rpc("first_booking_discount");
  if (!discount) return null;

  return (
    <section aria-labelledby="offer" className="mx-6 mt-6 rounded-card bg-brand-yellow p-5 text-brand-navy">
      <h2 id="offer" className="text-lg font-bold">
        Welcome offer
      </h2>
      <p className="mt-1 text-sm font-medium">
        Get {formatPeso(discount)} off your first booking. It&apos;s taken off what you pay after the visit.
      </p>
    </section>
  );
}
