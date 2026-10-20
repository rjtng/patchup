import { CalendarX } from "lucide-react";
import { formatDateTime } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import type { createClient } from "@/lib/supabase/server";

/** Until when the signed-in customer can't book, after 3 last-minute cancellations in 30 days (null when they can). */
export async function myBookingPause(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("last_minute_record").single();
  return data?.booking_paused_until ?? null;
}

// What a customer whose booking is paused sees on Home, and instead of the
// booking form. It lifts by itself (see private.booking_paused_until).
export function BookingPausedNotice({ until, className }: { until: string; className?: string }) {
  return (
    <section aria-labelledby="paused" className={cn("flex gap-3 rounded-card bg-danger/5 p-5 text-sm", className)}>
      <CalendarX aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <div>
        <h2 id="paused" className="font-bold text-ink">
          Booking is paused
        </h2>
        <p className="mt-1 leading-relaxed text-ink">
          You cancelled 3 visits at the last minute in the past 30 days, so you can book new repairs again from{" "}
          {formatDateTime(until)}. Bookings you already have go on as planned.
        </p>
      </div>
    </section>
  );
}
