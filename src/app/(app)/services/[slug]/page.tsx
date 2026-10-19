import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { getCategory, serviceParams } from "@/lib/services";
import { TechnicianChoices } from "./technician-choices";

export function generateStaticParams() {
  return serviceParams();
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: (await getCategory(slug))?.name ?? "Services" };
}

// Category screen (Plumbing, Electrical, …): book the first available
// technician or pick one.
export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  return (
    <main className="pb-6">
      <PageHeader title={category.name} backHref="/home" />
      <Suspense fallback={<CardsSkeleton />}>
        <TechnicianChoices category={category} />
      </Suspense>
    </main>
  );
}
