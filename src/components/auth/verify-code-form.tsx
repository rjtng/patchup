"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { authErrorMessage } from "@/lib/auth-errors";
import { emailLinkTarget } from "@/lib/auth-links";
import { createClient } from "@/lib/supabase/client";

const RESEND_AFTER_SECONDS = 60;
const CODE_LENGTH = 6;

function formatSeconds(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Six-digit code entry, after sign-up ("signup") and during password reset
 * ("recovery"). The email's link works too (see app/auth/confirm); this is
 * for emails that carry a code. The address the email went to comes from
 * `?email=` in the URL, so pages render this inside <Suspense> (Next.js
 * requires it for URL data).
 */
export function VerifyCodeForm({
  purpose,
  nextHref,
  restartHref,
  submitLabel = "Verify",
}: {
  purpose: "signup" | "recovery";
  nextHref: string;
  restartHref: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_AFTER_SECONDS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  if (!email) {
    return (
      <p className="text-center text-muted">
        We don&apos;t know which email to check.{" "}
        <Link href={restartHref} className="font-semibold text-brand-navy underline underline-offset-4">
          Start again
        </Link>
      </p>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    setError(null);
    setNotice(null);
    setPending(true);

    const { error } = await createClient().auth.verifyOtp({
      email,
      token: code,
      type: purpose === "signup" ? "email" : "recovery",
    });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    // The code signs the person in.
    router.replace(nextHref);
    router.refresh();
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setCode("");
    setSecondsLeft(RESEND_AFTER_SECONDS);

    const supabase = createClient();
    const { error } =
      purpose === "signup"
        ? await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: emailLinkTarget("signup") } })
        : await supabase.auth.resetPasswordForEmail(email, { redirectTo: emailLinkTarget("recovery") });
    if (error) setError(authErrorMessage(error));
    else setNotice("We sent you a new email.");
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        Sent to <span className="font-semibold text-ink">{email}</span>
      </p>
      <OtpInput value={code} onChange={setCode} length={CODE_LENGTH} label="6-digit code" />
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-center text-sm text-muted" aria-live="polite">
        {notice && <>{notice} </>}
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
      <Button type="submit" disabled={code.length !== CODE_LENGTH || pending}>
        {pending ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}
