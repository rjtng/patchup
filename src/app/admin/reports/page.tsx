import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatDay } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { ADMIN_REASON, type ReportReason } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { ListLink } from "../list-link";

export const metadata: Metadata = { title: "Reports" };

// Problems customers and technicians reported with a booking: the open ones
// to look into (each is resolved on its booking's page), then the latest resolved.
export default function ReportsPage() {
  return (
    <main className="pb-6">
      <div className="px-6 pt-3">
        <ListLink href="/admin">Overview</ListLink>
      </div>
      <Suspense fallback={<CardsSkeleton />}>
        <Reports />
      </Suspense>
    </main>
  );
}

const REPORT =
  "id, reason, details, created_at, resolved_at, resolution, reporter_id, reporter:profiles!reports_reporter_id_fkey(full_name), bookings(id, customer_id, appliance, service_categories(name))";

async function Reports() {
  const supabase = await createClient();
  const [{ data: open, error }, { data: latest }] = await Promise.all([
    supabase.from("reports").select(REPORT).is("resolved_at", null).order("created_at"),
    // Open ones sort last, so these are the latest resolved (unless fewer were).
    supabase.from("reports").select(REPORT).order("resolved_at", { ascending: false, nullsFirst: false }).limit(30),
  ]);
  if (error || !open) {
    return (
      <p className="px-6 text-sm text-danger">We couldn&apos;t load the reports. Refresh the page to try again.</p>
    );
  }
  const resolved = (latest ?? []).filter((r) => r.resolved_at);

  return (
    <div className="flex flex-col gap-4 px-6">
      <h2 className="text-lg font-bold text-ink">To look into</h2>
      {open.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">No problems to look into right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <ReportItem key={r.id} report={r} />
          ))}
        </ul>
      )}

      <h2 className="mt-4 text-lg font-bold text-ink">Resolved</h2>
      {resolved.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">None resolved yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {resolved.map((r) => (
            <ReportItem key={r.id} report={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

type ReportRow = {
  id: string;
  reason: string;
  details: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  reporter_id: string;
  reporter: { full_name: string } | null;
  bookings: { id: string; customer_id: string; appliance: string; service_categories: { name: string } | null } | null;
};

function ReportItem({ report: r }: { report: ReportRow }) {
  const role = r.reporter_id === r.bookings?.customer_id ? "customer" : "technician";
  return (
    <li>
      <Link
        href={`/admin/bookings/${r.bookings?.id}`}
        className={cn(
          "block rounded-card bg-white p-5 text-sm shadow-sm transition-shadow hover:shadow-md",
          !r.resolved_at && "ring-2 ring-danger/40",
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-bold text-ink">{ADMIN_REASON[r.reason as ReportReason] ?? r.reason}</span>
          <span className="shrink-0 text-xs text-muted">{formatDateTime(r.created_at)}</span>
        </span>
        <span className="block text-ink">
          {r.bookings?.service_categories?.name}: {r.bookings?.appliance}
        </span>
        <span className="block text-muted">
          From {r.reporter?.full_name || `the ${role}`} ({role})
        </span>
        <span className="mt-2 line-clamp-2 block text-ink">{r.details}</span>
        {r.resolved_at && (
          <span className="mt-2 block text-muted">
            Resolved {formatDay(r.resolved_at)}: {r.resolution}
          </span>
        )}
      </Link>
    </li>
  );
}
