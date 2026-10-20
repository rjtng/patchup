import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";

/*
 * Shared layout for every sign-in screen: gradient header with a back arrow
 * and title, then a white sheet holding the form. Using one layout keeps the
 * Forgot Password, OTP and Reset screens consistent (they flipped layouts in
 * the Figma file).
 */
export function AuthScreen({
  backHref,
  back,
  title,
  subtitle,
  children,
  footer,
}: {
  backHref?: string;
  /** Instead of backHref, a back control of its own. */
  back?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <header className="bg-brand-gradient-deep px-6 pb-14 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="h-12">{back ?? (backHref && <BackLink href={backHref} />)}</div>
        <h1 className="mt-4 text-[2rem] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-white/90">{subtitle}</p>}
      </header>
      <section className="-mt-8 flex flex-1 flex-col rounded-t-[2rem] bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8">
        {children}
        {footer && <div className="mt-auto pt-8 text-center text-sm text-muted">{footer}</div>}
      </section>
    </main>
  );
}
