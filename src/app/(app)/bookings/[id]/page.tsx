import { CalendarClock, MapPin, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { StatusChip } from "@/components/bookings/status-chip";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { CUSTOMER_CAN_CANCEL, EVENT_LABELS, formatPeso, formatSchedule } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";
import { CancelBooking } from "./cancel-booking";

export const metadata: Metadata = { title: "Booking" };

export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <main className="pb-6">
      <PageHeader title="Booking" backHref="/bookings" />
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <BookingDetails params={params} />
      </Suspense>
    </main>
  );
}

async function BookingDetails({ params }: { params: PageProps<"/bookings/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, inspection_fee, final_amount, cancel_reason, service_categories(name), technician:profiles!bookings_technician_id_fkey(full_name), booking_events(id, event, note, created_at)",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .maybeSingle();
  if (!booking) notFound();

  const isCustomer = booking.customer_id === auth?.claims.sub;
  const technicianName = booking.technician?.full_name || null;

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <section className="rounded-card bg-white p-5 shadow-sm">
        <StatusChip status={booking.status} />
        <h2 className="mt-3 text-xl font-bold text-ink">
          {booking.service_categories?.name}: {booking.appliance}
        </h2>
        {booking.brand && <p className="text-sm text-muted">{booking.brand}</p>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{booking.problem}</p>
      </section>

      <section aria-label="Details" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <Detail icon={CalendarClock} label="Visit">
          {formatSchedule(booking.scheduled_at)}
        </Detail>
        <Detail icon={MapPin} label="Address">
          {booking.street}, {booking.barangay}, {booking.city}, {booking.province}
          {booking.landmark && <span className="block text-muted">{booking.landmark}</span>}
        </Detail>
        <Detail icon={UserRound} label="Technician">
          {technicianName ?? "Finding one for you"}
        </Detail>
        <Detail icon={Wrench} label={booking.final_amount != null ? "Total paid" : "Inspection fee"}>
          {formatPeso(booking.final_amount ?? booking.inspection_fee)}
          {booking.final_amount == null && (
            <span className="block text-muted">Cash after the visit. The repair is quoted before it starts.</span>
          )}
        </Detail>
      </section>

      <section aria-labelledby="timeline" className="rounded-card bg-white p-5 shadow-sm">
        <h2 id="timeline" className="text-base font-bold text-ink">
          Timeline
        </h2>
        <ol className="mt-3 flex flex-col gap-3 border-l-2 border-line pl-4">
          {booking.booking_events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span aria-hidden className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-brand-navy" />
              <span className="block font-semibold text-ink">{EVENT_LABELS[e.event] ?? e.event}</span>
              <span className="block text-muted">{formatSchedule(e.created_at)}</span>
              {e.note && <span className="block text-ink">{e.note}</span>}
            </li>
          ))}
        </ol>
      </section>

      {isCustomer && CUSTOMER_CAN_CANCEL.includes(booking.status) && <CancelBooking bookingId={booking.id} />}
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-navy" />
      <div>
        <p className="font-semibold text-ink">{label}</p>
        <div className="text-ink">{children}</div>
      </div>
    </div>
  );
}
