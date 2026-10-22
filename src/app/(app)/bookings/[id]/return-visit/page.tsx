import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { mySuspension, SuspendedNotice } from "@/components/reports/suspended-notice";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDay } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";
import { liveReturnVisit, warrantyUntil } from "@/lib/warranty";
import { ReturnVisitForm } from "./return-visit-form";

export const metadata: Metadata = { title: "Return visit" };

// Asking for a return visit under a repair's warranty (see request_return_visit).
export default function ReturnVisitPage({ params }: PageProps<"/bookings/[id]/return-visit">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Return visit" backHref="/bookings" />
            <CardsSkeleton count={3} />
          </>
        }
      >
        <ReturnVisitLoader params={params} />
      </Suspense>
    </main>
  );
}

async function ReturnVisitLoader({ params }: { params: PageProps<"/bookings/[id]/return-visit">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: repair } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, technician_id, completed_at, return_of, appliance, street, barangay, city, service_categories(name), technician:profiles!bookings_technician_id_fkey(full_name), quotes(status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!repair || repair.customer_id !== auth?.claims.sub) notFound();
  const technicianId = repair.technician_id ?? "";
  const [{ data: returnVisits }, suspension, { data: approved }, { data: busy }, { data: hours }, { data: timeOff }] =
    await Promise.all([
      supabase.from("bookings").select("id, status").eq("return_of", repair.id).order("created_at"),
      // A suspended customer can't ask for one (request_return_visit refuses them too).
      mySuspension(supabase),
      // Whether the technician who did it can still take jobs (customers see approved technicians only),
      // and when they're taken, work and are off: other times can't be picked (asking holds to it too).
      supabase.from("technician_profiles").select("id").eq("id", technicianId).maybeSingle(),
      supabase.rpc("busy_times", { technician: technicianId }),
      supabase.from("technician_hours").select("weekday, first_visit, last_visit").eq("technician_id", technicianId),
      supabase
        .from("technician_time_off")
        .select("starts_on, ends_on")
        .eq("technician_id", technicianId)
        .order("starts_on"),
    ]);
  const until = warrantyUntil(repair);
  const asked = liveReturnVisit(returnVisits ?? []);
  // Read once per request, after the data above, so the warranty and the times offered start from now.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const header = <PageHeader title="Return visit" backHref={`/bookings/${repair.id}`} />;
  const notice = (children: ReactNode) => (
    <>
      {header}
      <p className="mx-6 mt-6 rounded-card bg-white p-5 text-sm leading-relaxed text-ink shadow-sm">{children}</p>
    </>
  );
  if (asked) {
    return notice(
      <>
        You&apos;ve already asked for a return visit for this repair.{" "}
        <Link href={`/bookings/${asked.id}`} className="font-semibold text-brand-navy underline">
          See the return visit
        </Link>
      </>,
    );
  }
  if (until === null) {
    return notice(
      repair.return_of
        ? "This was a return visit already, so it has no warranty of its own. If the problem is still there, report a problem on the booking, and PatchUp will help."
        : repair.status !== "completed"
          ? "You can ask for a return visit once the repair is done."
          : "The warranty covers repairs, and this visit was an inspection only.",
    );
  }
  if (now >= until) {
    return notice(
      `The 30-day warranty on this repair ended on ${formatDay(new Date(until).toISOString())}. If something's wrong with the repair, report a problem on the booking.`,
    );
  }
  if (suspension) {
    return (
      <>
        {header}
        <SuspendedNotice reason={suspension.reason} className="mx-6 mt-6" />
      </>
    );
  }

  return (
    <>
      {header}
      <ReturnVisitForm
        repair={{
          id: repair.id,
          what: `${repair.service_categories?.name ?? "Repair"}: ${repair.appliance}`,
          doneAt: repair.completed_at ?? "",
          where: `${repair.street}, ${repair.barangay}, ${repair.city}`,
          by: repair.technician?.full_name || null,
        }}
        until={until}
        technician={approved ? { id: approved.id, full_name: repair.technician?.full_name ?? "" } : null}
        busy={approved ? (busy ?? []) : []}
        hours={approved ? (hours ?? []) : []}
        timeOff={approved ? (timeOff ?? []) : []}
        now={now}
      />
    </>
  );
}
