import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/*
 * One primary and one secondary style for the whole app (the Figma file had
 * three competing primary styles). Primary is solid navy rather than the
 * gradient because white text on the cyan end of the gradient is unreadable.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-navy text-white shadow-[0_6px_16px_rgba(0,74,173,0.25)] hover:bg-brand-navy-dark",
  secondary:
    "border-2 border-brand-navy bg-white text-brand-navy hover:bg-surface",
  ghost: "text-brand-navy hover:bg-brand-navy/5",
  danger: "border-2 border-danger bg-white text-danger hover:bg-danger/5",
};

export function buttonClasses(variant: Variant = "primary", className?: string) {
  return cn(base, variants[variant], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant };

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, className)} {...props} />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant };

export function ButtonLink({ variant = "primary", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
