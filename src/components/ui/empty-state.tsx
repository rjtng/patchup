import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-6 my-8 flex flex-col items-center rounded-card bg-white px-6 py-10 text-center shadow-sm">
      <span className="grid size-16 place-items-center rounded-full bg-surface text-brand-navy">
        <Icon aria-hidden className="size-8" />
      </span>
      <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
      {children && <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  );
}
