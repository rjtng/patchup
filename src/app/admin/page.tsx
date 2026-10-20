import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { overview } from "@/lib/admin";
import { formatPeso } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  return (
    <main className="pb-6">
      <Suspense fallback={<CardsSkeleton count={4} />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const supabase = await createClient();
  const [{ data, error }, { data: reports }] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.from("reports").select("id").is("resolved_at", null),
  ]);
  const o = data ? overview(data) : null;
  const openReports = reports?.length ?? 0;
  if (error || !o) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load the overview. Refresh the page to try again.</p>;
  }

  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <Group title="Needs you">
        <Tile
          href="/admin/technicians?status=pending"
          value={o.pending_technicians}
          label={o.pending_technicians === 1 ? "technician to check" : "technicians to check"}
          urgent={o.pending_technicians > 0}
        />
        <Tile
          href="/admin/bookings?show=open"
          value={o.unassigned_requests}
          label={o.unassigned_requests === 1 ? "request nobody has taken" : "requests nobody has taken"}
          note={o.stale_requests > 0 ? `${o.stale_requests} waiting too long` : undefined}
          urgent={o.stale_requests > 0}
        />
        <Tile
          href="/admin/reports"
          value={openReports}
          label={openReports === 1 ? "reported problem to look into" : "reported problems to look into"}
          note="From customers and technicians"
          urgent={openReports > 0}
        />
        <Tile
          href="/admin/payouts"
          value={formatPeso(o.payback_owed)}
          label="to pay technicians back"
          note={
            o.payback_technicians > 0
              ? `First-booking offers, to ${o.payback_technicians === 1 ? "1 technician" : `${o.payback_technicians} technicians`}`
              : "First-booking offers"
          }
        />
      </Group>

      <Group title="Right now">
        <Tile
          href="/admin/bookings?show=active"
          value={o.active_bookings}
          label={o.active_bookings === 1 ? "job in progress" : "jobs in progress"}
          note={o.late_jobs > 0 ? `${o.late_jobs} running late` : undefined}
          urgent={o.late_jobs > 0}
        />
        <Tile
          href="/admin/bookings?show=open"
          value={o.awaiting_technician}
          label="waiting for the technician the customer chose"
        />
        <Tile
          href="/admin/technicians?status=approved"
          value={o.available_technicians}
          label="taking new jobs"
          note={`of ${o.approved_technicians} approved ${o.approved_technicians === 1 ? "technician" : "technicians"}`}
        />
        <Tile value={o.customers} label={o.customers === 1 ? "customer" : "customers"} />
      </Group>

      <Group title="Last 7 days">
        <Tile value={o.booked_week} label="booked" />
        <Tile
          href="/admin/bookings?show=done"
          value={o.completed_week}
          label="done"
          note={o.completed_week > 0 ? `${formatPeso(o.completed_value_week)} paid in cash` : undefined}
        />
        <Tile href="/admin/bookings?show=cancelled" value={o.cancelled_week} label="cancelled" />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <ul className="grid grid-cols-2 gap-3">{children}</ul>
    </section>
  );
}

// One number on the dashboard; most open the list behind it.
function Tile({
  href,
  value,
  label,
  note,
  urgent = false,
}: {
  href?: string;
  value: number | string;
  label: string;
  note?: string;
  urgent?: boolean;
}) {
  const content = (
    <>
      <span className={cn("block text-3xl font-bold", urgent ? "text-danger" : "text-brand-navy")}>{value}</span>
      <span className="mt-1 block text-sm font-semibold leading-snug text-ink">{label}</span>
      {note && <span className={cn("mt-1 block text-xs", urgent ? "font-semibold text-danger" : "text-muted")}>{note}</span>}
    </>
  );
  const box = "block h-full rounded-card bg-white p-4 shadow-sm";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(box, "transition-shadow hover:shadow-md", urgent && "ring-2 ring-danger/40")}>
          {content}
        </Link>
      ) : (
        <div className={box}>{content}</div>
      )}
    </li>
  );
}
