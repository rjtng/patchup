"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

// Reloads the screen, for lists that don't update on their own (Jobs, the admin screens).
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Refresh"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="grid size-12 place-items-center rounded-full bg-white/15 hover:bg-white/25"
    >
      <RefreshCw aria-hidden className={cn("size-6", pending && "animate-spin")} />
    </button>
  );
}
