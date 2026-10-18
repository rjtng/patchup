import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// One line of a booking's details: icon, label, value.
export function DetailRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-navy" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{label}</p>
        <div className="text-ink">{children}</div>
      </div>
    </div>
  );
}
