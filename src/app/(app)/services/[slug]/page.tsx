import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { getCategory } from "@/lib/services";
import { TechnicianChoices } from "./technician-choices";

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await getCategory(slug))?.name ?? "Services" };
}

// Category screen (Plumbing, Electrical, …): book the first available
// technician or pick one.
export default function ServicePage({ params }: PageProps<"/services/[slug]">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Service" backHref="/home" />
            <CardsSkeleton />
          </>
        }
      >
        <Service params={params} />
      </Suspense>
    </main>
  );
}

// Looked up as the page is opened rather than built ahead, so a service an
// admin has just added, changed or hidden shows as it is now (the list of
// services itself is cached, and Admin refreshes it).
async function Service({ params }: { params: PageProps<"/services/[slug]">["params"] }) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  return (
    <>
      <PageHeader title={category.name} backHref="/home" />
      <Suspense fallback={<CardsSkeleton />}>
        <TechnicianChoices category={category} />
      </Suspense>
    </>
  );
}
