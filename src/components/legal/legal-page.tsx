"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// The Privacy Notice and Terms of Service are opened from sign-up and from
// Profile, so the back arrow goes back to wherever they came from.
export function HistoryBack({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="-ml-2 grid size-12 place-items-center rounded-full text-white transition-colors hover:bg-white/15"
    >
      <ArrowLeft aria-hidden className="size-7" strokeWidth={2.25} />
    </button>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </section>
  );
}
