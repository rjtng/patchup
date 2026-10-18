"use client";

import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

// Messages for people arriving from an email link (see app/auth/confirm),
// chosen by `?notice=` in the URL. Render inside <Suspense>.
const NOTICES: Record<string, { text: string; error?: boolean }> = {
  "email-confirmed": { text: "Your email is confirmed. Log in to continue." },
  "link-failed": {
    text: "That link has expired or was already used. Log in, and we'll send you a new one if you still need it.",
    error: true,
  },
  "reset-link-failed": {
    text: "That reset link has expired, was already used, or was opened in a different browser. Ask for a new one below, on this device.",
    error: true,
  },
};

export function AuthNotice() {
  const notice = NOTICES[useSearchParams().get("notice") ?? ""];
  if (!notice) return null;
  return (
    <p
      role="status"
      className={cn(
        "mb-5 rounded-field px-4 py-3 text-sm",
        notice.error ? "bg-danger/5 text-danger" : "bg-brand-navy/5 text-brand-navy",
      )}
    >
      {notice.text}
    </p>
  );
}
