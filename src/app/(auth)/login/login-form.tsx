"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { emailLinkTarget } from "@/lib/auth-links";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your email and your password.");
      return;
    }
    setError(null);
    setPending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error?.code === "email_not_confirmed") {
      // Signed up but never confirmed: send a fresh email.
      await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: emailLinkTarget("signup") } });
      router.push(`/signup/verify?email=${encodeURIComponent(email)}`);
      return;
    }
    if (error) {
      setError(authErrorMessage(error));
      setPending(false);
      return;
    }
    router.replace("/home");
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        name="email"
        type="email"
        label="Email"
        icon={Mail}
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
      />
      <div className="flex flex-col gap-2">
        <PasswordField
          name="password"
          label="Password"
          icon={Lock}
          placeholder="Your password"
          autoComplete="current-password"
        />
        <Link
          href="/forgot-password"
          className="self-end py-1 text-sm font-semibold text-brand-navy underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
