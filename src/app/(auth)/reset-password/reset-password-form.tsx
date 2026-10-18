"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/text-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    const next: typeof errors = {};
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setPending(true);

    // Entering the emailed code signed the person in, so this updates their account.
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      setPending(false);
      return;
    }
    router.replace("/home");
    router.refresh();
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
      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" className="mt-1" disabled={pending}>
        {pending ? "Saving…" : "Save and log in"}
      </Button>
    </form>
  );
}
