import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Back to the list a detail page came from (the header's arrow leaves Admin).
export function ListLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex h-12 w-fit items-center gap-2 px-1 text-sm font-semibold text-brand-navy hover:underline"
    >
      <ArrowLeft aria-hidden className="size-5" strokeWidth={2.25} />
      {children}
    </Link>
  );
}
