import { CHIP_TONES } from "@/components/bookings/status-chip";
import { VERIFICATION, type VerificationStatus } from "@/lib/admin";
import { cn } from "@/lib/cn";

// Where a technician's account stands (technician_profiles.verification_status).
export function VerificationChip({ status }: { status: VerificationStatus }) {
  const { label, tone } = VERIFICATION[status];
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", CHIP_TONES[tone])}>{label}</span>;
}
