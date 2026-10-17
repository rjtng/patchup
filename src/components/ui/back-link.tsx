import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function BackLink({
  href,
  label = "Back",
  tone = "light",
}: {
  href: string;
  label?: string;
  /** "light" for use on the gradient, "dark" for use on white. */
  tone?: "light" | "dark";
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "-ml-2 grid size-12 place-items-center rounded-full transition-colors",
        tone === "light" ? "text-white hover:bg-white/15" : "text-brand-navy hover:bg-brand-navy/5",
      )}
    >
      <ArrowLeft className="size-7" strokeWidth={2.25} />
    </Link>
  );
}
