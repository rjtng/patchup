import Link from "next/link";
import { cn } from "@/lib/cn";

// A row of filters for an admin list (each a link, so the filter stays in the address).
export function Filters({ label, options }: { label: string; options: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label={label}>
      <ul className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
        {options.map((option) => (
          <li key={option.href} className="shrink-0">
            <Link
              href={option.href}
              aria-current={option.active ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-full border-2 px-4 text-sm font-semibold transition-colors",
                option.active
                  ? "border-brand-navy bg-brand-navy text-white"
                  : "border-line bg-white text-ink hover:border-brand-navy",
              )}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
