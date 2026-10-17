"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/text-field";

export function ResetPasswordForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    const next: typeof errors = {};
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    // TODO: update the password with Supabase Auth.
    router.push("/login");
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <PasswordField
        name="password"
        label="New password"
        icon={Lock}
        placeholder="Create a password"
        autoComplete="new-password"
        hint="At least 8 characters"
        error={errors.password}
      />
      <PasswordField
        name="confirm"
        label="Confirm new password"
        icon={Lock}
        placeholder="Type it again"
        autoComplete="new-password"
        error={errors.confirm}
      />
      <Button type="submit" className="mt-1">
        Save and log in
      </Button>
    </form>
  );
}
