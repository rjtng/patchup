"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/text-field";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const account = String(data.get("account") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!account || !password) {
      setError("Enter your email or phone number and your password.");
      return;
    }
    setError(null);
    // TODO: sign in with Supabase Auth, show its error message on failure.
    router.push("/home");
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        name="account"
        label="Email or phone number"
        icon={Mail}
        placeholder="you@example.com"
        autoComplete="username"
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
      <Button type="submit">Log in</Button>
    </form>
  );
}
