import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";

/*
 * Gradient header for app screens. Tab screens (Home, Chat, Track, Bookings,
 * Profile) leave out backHref: they are top-level, so they don't need a back
 * arrow. Detail screens pass one.
 */
export function PageHeader({
  title,
  backHref,
  actions,
  children,
}: {
  title: ReactNode;
  backHref?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="bg-brand-gradient-deep rounded-b-[2rem] px-6 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <div className="flex min-h-12 items-center gap-2">
        {backHref && <BackLink href={backHref} />}
        <h1 className="flex-1 text-2xl font-bold">{title}</h1>
        {actions}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
