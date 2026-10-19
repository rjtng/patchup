import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CHIP_TONES } from "@/components/bookings/status-chip";
import { ServiceIcon } from "@/components/services/service-icon";
import { ButtonLink } from "@/components/ui/button";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatPeso } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { MoveButtons } from "./move-buttons";

export const metadata: Metadata = { title: "Services" };

// Home shows this many services, then More for the rest (src/app/(app)/home/page.tsx).
const ON_HOME = 7;

export default function AdminServicesPage() {
  return (
    <main className="pb-6">
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <ServiceList />
      </Suspense>
    </main>
  );
}

// Every service, hidden ones too, in the order customers see them.
async function ServiceList() {
  const supabase = await createClient();
  const [{ data: services, error }, { data: offered }] = await Promise.all([
    supabase
      .from("service_categories")
      .select("id, slug, name, icon, inspection_fee, is_active")
      .order("sort_order")
      .order("name"),
    supabase.from("technician_services").select("category_id"),
  ]);
  if (error) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load the services. Refresh to try again.</p>;
  }
  const technicians = (id: string) => (offered ?? []).filter((s) => s.category_id === id).length;
  const onHome = new Set(
    services
      .filter((s) => s.is_active)
      .slice(0, ON_HOME)
      .map((s) => s.id),
  );

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <ButtonLink href="/admin/services/new">
        <Plus aria-hidden className="size-5" />
        Add a service
      </ButtonLink>
      <ul className="flex flex-col gap-3">
        {services.map((s, i) => {
          const count = technicians(s.id);
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-2 rounded-card bg-white py-2 pl-4 pr-2 shadow-sm"
            >
              <Link href={`/admin/services/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2">
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full",
                    s.is_active ? "bg-brand-navy/10 text-brand-navy" : "bg-surface text-muted",
                  )}
                >
                  <ServiceIcon name={s.icon} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{s.name}</span>
                  <span className="block text-sm text-muted">
                    {formatPeso(s.inspection_fee)} · {count === 1 ? "1 technician" : `${count} technicians`}
                  </span>
                  {(onHome.has(s.id) || !s.is_active) && (
                    <span
                      className={cn(
                        "mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        s.is_active ? CHIP_TONES.active : CHIP_TONES.done,
                      )}
                    >
                      {s.is_active ? "On Home" : "Hidden"}
                    </span>
                  )}
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
              <MoveButtons id={s.id} name={s.name} first={i === 0} last={i === services.length - 1} />
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">
        Home shows the first {ON_HOME} services that aren&apos;t hidden, then More for all of them. Hidden services
        can&apos;t be booked or found.
      </p>
    </div>
  );
}
