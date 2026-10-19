import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { ListLink } from "../../list-link";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Service" };

export default function AdminServicePage({ params }: PageProps<"/admin/services/[id]">) {
  return (
    <main className="pb-6">
      <div className="px-6 pt-3">
        <ListLink href="/admin/services">All services</ListLink>
      </div>
      <Suspense fallback={<CardsSkeleton count={3} />}>
        <ServiceDetails params={params} />
      </Suspense>
    </main>
  );
}

async function ServiceDetails({ params }: { params: PageProps<"/admin/services/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: service }, { data: offered }] = await Promise.all([
    supabase
      .from("service_categories")
      .select("id, slug, name, icon, inspection_fee, is_active")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("technician_services").select("technician_id").eq("category_id", id),
  ]);
  if (!service) {
    return (
      <EmptyState icon={Wrench} title="Service not found">
        Go back to the list of services.
      </EmptyState>
    );
  }
  const technicians = offered?.length ?? 0;

  return (
    <div className="flex flex-col gap-4 px-6 pt-2">
      <div>
        <h2 className="text-xl font-bold text-ink">{service.name}</h2>
        <p className="text-sm text-muted">
          {technicians === 0
            ? "No technicians offer it yet."
            : technicians === 1
              ? "1 technician offers it."
              : `${technicians} technicians offer it.`}{" "}
          {service.is_active && (
            <Link href={`/services/${service.slug}`} className="font-semibold text-brand-navy underline">
              See its page
            </Link>
          )}
        </p>
      </div>
      <ServiceForm service={service} />
    </div>
  );
}
