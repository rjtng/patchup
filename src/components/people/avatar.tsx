import { cn } from "@/lib/cn";

/**
 * Someone's profile photo, or the first letter of their name in its place.
 * Decorative: their name is always shown next to it. Size it with className
 * (size-12 by default).
 */
export function Avatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  const classes = cn(
    "grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-navy/10 text-lg font-bold text-brand-navy",
    className,
  );
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className={cn(classes, "object-cover")} />;
  }
  return (
    <span aria-hidden className={classes}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
