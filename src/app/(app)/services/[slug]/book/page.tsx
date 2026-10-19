import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { getCategory, serviceCategories } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "./booking-form";

export function generateStaticParams() {
  return serviceCategories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]/book">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Book ${getCategory(slug)?.name.toLowerCase() ?? "a repair"}` };
}

export default async function BookPage({ params, searchParams }: PageProps<"/services/[slug]/book">) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  return (
    <main className="pb-6">
      <PageHeader title={`Book ${category.name.toLowerCase()}`} backHref={`/services/${slug}`} />
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <BookingFormLoader slug={slug} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BookingFormLoader({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: PageProps<"/services/[slug]/book">["searchParams"];
}) {
  const { technician: technicianParam } = await searchParams;
  const technicianId = typeof technicianParam === "string" ? technicianParam : null;

  const supabase = await createClient();
  const [{ data: category }, { data: addresses }, technician] = await Promise.all([
    supabase.from("service_categories").select("id, name, inspection_fee").eq("slug", slug).maybeSingle(),
    supabase
      .from("addresses")
      .select("id, label, street, barangay, city, province, landmark, latitude, longitude")
      .order("created_at"),
    technicianId
      ? supabase.from("profiles").select("id, full_name").eq("id", technicianId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!category) notFound();

  return (
    <BookingForm
      category={category}
      technician={technician.data}
      technicianMissing={Boolean(technicianId) && !technician.data}
      addresses={addresses ?? []}
      // Read once per request (this server component runs after the cookies
      // above, so it never re-renders), so the visit times offered start from now.
      // eslint-disable-next-line react-hooks/purity
      now={Date.now()}
    />
  );
}
