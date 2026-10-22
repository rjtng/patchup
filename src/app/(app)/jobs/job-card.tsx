import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { StatusChip } from "@/components/bookings/status-chip";
import { formatSchedule, type BookingStatus } from "@/lib/bookings";

export type Job = {
  id: string;
  status: BookingStatus;
  technician_id: string | null;
  appliance: string;
  scheduled_at: string;
  barangay: string;
  city: string;
  service_categories: { name: string } | null;
  /** A request within two hours of a job they have: they can't take it. */
  clash?: boolean;
  /** A request outside their working hours (they can still take it). */
  offHours?: boolean;
  /** A request on one of their days off (they can still take it). */
  dayOff?: boolean;
};

export function JobCard({ job, me }: { job: Job; me: string }) {
  const askedForYou = job.status === "requested" && job.technician_id === me;
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-ink">
          {job.service_categories?.name}: {job.appliance}
        </span>
        <span className="mt-0.5 block text-sm text-muted">{formatSchedule(job.scheduled_at)}</span>
        <span className="block text-sm text-muted">
          {job.barangay}, {job.city}
        </span>
        <span className="mt-2 flex flex-wrap gap-2">
          <StatusChip status={job.status} technician />
          {askedForYou && (
            <span className="inline-flex rounded-full bg-brand-navy px-3 py-1 text-xs font-semibold text-white">
              Asked for you
            </span>
          )}
          {job.clash && (
            <span className="inline-flex rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
              You have a job then
            </span>
          )}
          {job.dayOff && !job.clash && (
            <span className="inline-flex rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
              Your day off
            </span>
          )}
          {job.offHours && !job.clash && (
            <span className="inline-flex rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
              Outside your hours
            </span>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}
