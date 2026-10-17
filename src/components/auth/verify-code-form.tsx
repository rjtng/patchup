"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";

const RESEND_AFTER_SECONDS = 60;
const CODE_LENGTH = 6;

function formatSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Six-digit code entry used after sign-up and during password reset. */
export function VerifyCodeForm({ nextHref, submitLabel = "Verify" }: { nextHref: string; submitLabel?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    // TODO: verify the code with Supabase Auth (verifyOtp).
    router.push(nextHref);
  };

  const resend = () => {
    // TODO: request a new code from Supabase Auth.
    setCode("");
    setSecondsLeft(RESEND_AFTER_SECONDS);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} label="6-digit code" />
      <p className="text-center text-sm text-muted" aria-live="polite">
        {secondsLeft > 0 ? (
          <>Didn&apos;t get it? You can resend in {formatSeconds(secondsLeft)}</>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={resend}
              className="font-semibold text-brand-navy underline underline-offset-4"
            >
              Resend code
            </button>
          </>
        )}
      </p>
      <Button type="submit" disabled={code.length !== CODE_LENGTH}>
        {submitLabel}
      </Button>
    </form>
  );
}
