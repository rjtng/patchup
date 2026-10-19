import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { TECHNICIAN_FILTERS, technicianFilter } from "@/lib/admin";
import { formatDay } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";
import { Filters } from "../filters";
import { VerificationChip } from "../verification-chip";

export const metadata: Metadata = { title: "Technicians" };

const NONE = {
  pending: "Nobody is waiting for approval.",
  approved: "No approved technicians yet.",
  suspended: "No suspended technicians.",
  rejected: "Nobody has been turned down.",
  all: "No technicians have signed up yet.",
};

export default function AdminTechniciansPage({ searchParams }: PageProps<"/admin/technicians">) {
  return (
    <main className="pb-6">
      <Suspense fallback={<CardsSkeleton />}>
        <TechnicianList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function TechnicianList({ searchParams }: { searchParams: PageProps<"/admin/technicians">["searchParams"] }) {
  const status = technicianFilter((await searchParams).status);
  const supabase = await createClient();
  const { data: technicians, error } = await supabase.rpc("admin_technicians", status === "all" ? {} : { status });

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <Filters
        label="Show technicians"
        options={TECHNICIAN_FILTERS.map((f) => ({
          href: `/admin/technicians?status=${f.value}`,
          label: f.label,
          active: f.value === status,
        }))}
      />
      {error ? (
        <p className="text-sm text-danger">We couldn&apos;t load the technicians. Refresh the page to try again.</p>
      ) : technicians.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">{NONE[status]}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {technicians.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/technicians/${t.id}`}
                className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{t.full_name || "No name yet"}</span>
                  <span className="block truncate text-sm text-muted">
                    {t.services.length > 0 ? t.services.join(", ") : "No services chosen yet"}
                  </span>
                  <span className="block text-sm text-muted">
                    {[t.city, t.years_experience != null && `${t.years_experience} yrs`, `signed up ${formatDay(t.joined_at)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2">
                    <VerificationChip status={t.verification_status} />
                    {t.verification_status === "approved" && (
                      <span className="inline-flex rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink">
                        {t.is_available ? "Taking jobs" : "Not taking jobs"}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
