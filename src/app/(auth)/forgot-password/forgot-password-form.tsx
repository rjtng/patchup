"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { emailLinkTarget } from "@/lib/auth-links";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setError("Enter the email on your account.");
      return;
    }
    setError(undefined);
    setPending(true);

    // Supabase answers the same way whether or not the email has an account,
    // so this doesn't reveal who is signed up.
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: emailLinkTarget("recovery"),
    });
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    router.push(`/forgot-password/verify?email=${encodeURIComponent(email)}`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <TextField
        name="email"
        type="email"
        label="Email"
        icon={Mail}
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
        error={error}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset email"}
      </Button>
    </form>
  );
}
