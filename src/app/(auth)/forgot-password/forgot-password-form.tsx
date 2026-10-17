"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const account = String(new FormData(e.currentTarget).get("account") ?? "").trim();
    if (!account) {
      setError("Enter the email or phone number on your account.");
      return;
    }
    // TODO: send a reset code with Supabase Auth.
    router.push("/forgot-password/verify");
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <TextField
        name="account"
        label="Email or phone number"
        icon={Mail}
        placeholder="you@example.com"
        autoComplete="username"
        inputMode="email"
        error={error}
      />
      <Button type="submit">Send code</Button>
    </form>
  );
}
