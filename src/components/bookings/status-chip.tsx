import { STATUS, type BookingStatus } from "@/lib/bookings";
import { cn } from "@/lib/cn";

const TONES = {
  waiting: "bg-brand-yellow text-ink",
  active: "bg-brand-navy/10 text-brand-navy",
  done: "bg-surface text-ink",
  cancelled: "bg-danger/10 text-danger",
};

export function StatusChip({ status, className }: { status: BookingStatus; className?: string }) {
  const { label, tone } = STATUS[status];
  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", TONES[tone], className)}>
      {label}
    </span>
  );
}
