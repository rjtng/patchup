import { ChevronRight, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceIcon } from "@/components/services/service-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPeso } from "@/lib/bookings";
import { getServiceCategories } from "@/lib/services";

export const metadata: Metadata = { title: "All services" };

// Every service, from Home's More.
export default async function ServicesPage() {
  const services = await getServiceCategories();

  return (
    <main className="pb-6">
      <PageHeader title="All services" backHref="/home" />
      {services.length === 0 ? (
        <EmptyState icon={Wrench} title="No services yet">
          Services you can book will show here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3 px-6 pt-6">
          {services.map(({ slug, name, icon, inspection_fee }) => (
            <li key={slug}>
              <Link
                href={`/services/${slug}`}
                className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy">
                  <ServiceIcon name={icon} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{name}</span>
                  <span className="block text-sm text-muted">{formatPeso(inspection_fee)} inspection fee</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
