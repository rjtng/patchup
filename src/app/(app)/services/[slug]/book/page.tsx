import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { mySuspension, SuspendedNotice } from "@/components/reports/suspended-notice";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { getCategory } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "./booking-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/services/[slug]/book">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Book ${(await getCategory(slug))?.name.toLowerCase() ?? "a repair"}` };
}

export default function BookPage({ params, searchParams }: PageProps<"/services/[slug]/book">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Book a repair" backHref="/home" />
            <CardsSkeleton count={4} />
          </>
        }
      >
        <BookingFormLoader params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BookingFormLoader({
  params,
  searchParams,
}: {
  params: PageProps<"/services/[slug]/book">["params"];
  searchParams: PageProps<"/services/[slug]/book">["searchParams"];
}) {
  const [{ slug }, { technician: technicianParam, again }] = await Promise.all([params, searchParams]);
  const technicianId = typeof technicianParam === "string" ? technicianParam : null;
  // "Book again" from a cancelled booking: start from what they wrote then.
  const previousId = typeof again === "string" && UUID.test(again) ? again : null;

  const supabase = await createClient();
  const [
    { data: category },
    { data: addresses },
    technician,
    { data: discount },
    { data: previous },
    { data: busy },
    suspension,
  ] = await Promise.all([
    // Read fresh here (not from the cached list), so the fee shown is the one charged.
    supabase
      .from("service_categories")
      .select("id, name, inspection_fee")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("addresses")
      .select("id, label, street, barangay, city, province, landmark, latitude, longitude")
      .order("created_at"),
    technicianId
      ? supabase.from("profiles").select("id, full_name").eq("id", technicianId).maybeSingle()
      : Promise.resolve({ data: null }),
    // What the first-booking offer takes off, if this is their first (booking works it out again).
    supabase.rpc("first_booking_discount"),
    previousId
      ? supabase
          .from("bookings")
          .select("appliance, brand, problem, street, barangay, city, province")
          .eq("id", previousId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // When the technician asked for is taken (booking holds to it too).
    technicianId ? supabase.rpc("busy_times", { technician: technicianId }) : Promise.resolve({ data: [] }),
    // A suspended customer can't book (create_booking refuses them too).
    mySuspension(supabase),
  ]);
  if (!category) notFound();
  if (suspension) {
    return (
      <>
        <PageHeader title={`Book ${category.name.toLowerCase()}`} backHref={`/services/${slug}`} />
        <SuspendedNotice reason={suspension.reason} className="mx-6 mt-6" />
      </>
    );
  }
  // The saved address it was at, if it's still saved.
  const previousAddress = previous
    ? addresses?.find(
        (a) =>
          a.street === previous.street &&
          a.barangay === previous.barangay &&
          a.city === previous.city &&
          a.province === previous.province,
      )
    : undefined;

  return (
    <>
      <PageHeader title={`Book ${category.name.toLowerCase()}`} backHref={`/services/${slug}`} />
      <BookingForm
        category={category}
        technician={technician.data}
        technicianMissing={Boolean(technicianId) && !technician.data}
        addresses={addresses ?? []}
        discount={discount ?? 0}
        busy={technician.data ? (busy ?? []) : []}
        initial={
          previous && {
            appliance: previous.appliance,
            brand: previous.brand,
            problem: previous.problem,
            addressId: previousAddress?.id,
          }
        }
        // Read once per request (this server component runs after the cookies
        // above, so it never re-renders), so the visit times offered start from now.
        // eslint-disable-next-line react-hooks/purity
        now={Date.now()}
      />
    </>
  );
}
