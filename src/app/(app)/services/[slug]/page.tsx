import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { getCategory, serviceCategories } from "@/lib/services";
import { TechnicianChoices } from "./technician-choices";

export function generateStaticParams() {
  return serviceCategories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getCategory(slug)?.name ?? "Services" };
}

// Category screen (Plumbing, Electrical, …): book the first available
// technician or pick one.
export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  return (
    <main className="pb-6">
      <PageHeader title={category.name} backHref="/home" />
      <Suspense fallback={<CardsSkeleton />}>
        <TechnicianChoices slug={slug} />
      </Suspense>
    </main>
  );
}
