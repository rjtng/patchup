import { Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategory, serviceCategories } from "@/lib/services";

export function generateStaticParams() {
  return serviceCategories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: getCategory(slug)?.name ?? "Services" };
}

// Category screen (Plumbing, Electrical, …). Next step: list technicians with
// photo, rating, distance, starting price and a Book button.
export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  return (
    <main>
      <PageHeader title={category.name} backHref="/home" />
      <EmptyState icon={Users} title={`${category.name} technicians`}>
        Available technicians for {category.name.toLowerCase()} will be listed here.
      </EmptyState>
    </main>
  );
}
