"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { hasSeenOnboarding } from "@/lib/onboarding";

const SPLASH_MS = 1600;

export function SplashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const target = hasSeenOnboarding() ? "/welcome" : "/onboarding";
    router.prefetch(target);
    const timer = window.setTimeout(() => router.replace(target), SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [router]);

  return <span className="sr-only">Loading PatchUp…</span>;
}
