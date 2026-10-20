"use client";

import { HardHat, Home, Lock, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { emailLinkTarget } from "@/lib/auth-links";
import { cn } from "@/lib/cn";
import { LEGAL } from "@/lib/legal";
import { createClient } from "@/lib/supabase/client";

type Role = "customer" | "technician";
type Errors = Partial<Record<"name" | "email" | "password" | "confirm" | "form", string>>;

const roles: Array<{ value: Role; label: string; icon: typeof Home }> = [
  { value: "customer", label: "I need repairs", icon: Home },
  { value: "technician", label: "I'm a technician", icon: HardHat },
];

export function SignupForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("customer");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    const next: Errors = {};
    if (!name) next.name = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setPending(true);

    // The database creates the profile from `full_name` and `role`.
    const { data: result, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        // With the account: which Terms and Privacy Notice they agreed to, and when.
        data: { full_name: name, role, agreed_terms: LEGAL.version, agreed_at: new Date().toISOString() },
        emailRedirectTo: emailLinkTarget("signup"),
      },
    });

    if (error) {
      setErrors({ form: authErrorMessage(error) });
    } else if (result.user?.identities?.length === 0) {
      // Supabase's sign-up answer for an email that already has an account.
      setErrors({ form: authErrorMessage({ code: "user_already_exists" }) });
    } else if (result.session) {
      // Email confirmation is switched off in Supabase: already signed in.
      router.replace("/home");
      router.refresh();
      return;
    } else {
      router.push(`/signup/verify?email=${encodeURIComponent(email)}`);
      return;
    }
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Account type</legend>
        <div className="grid grid-cols-2 gap-3">
          {roles.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 px-3 py-4 text-center text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-yellow",
                role === value
                  ? "border-brand-navy bg-brand-navy/5 text-brand-navy"
                  : "border-line bg-white text-muted hover:border-brand-navy/40",
              )}
            >
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
                className="sr-only"
              />
              <Icon aria-hidden className="size-6" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        name="name"
        label="Full name"
        icon={UserRound}
        placeholder="Juan Dela Cruz"
        autoComplete="name"
        error={errors.name}
      />
      <TextField
        name="email"
        type="email"
        label="Email"
        icon={Mail}
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
        error={errors.email}
      />
      <PasswordField
        name="password"
        label="Password"
        icon={Lock}
        placeholder="Create a password"
        autoComplete="new-password"
        hint="At least 8 characters"
        error={errors.password}
      />
      <PasswordField
        name="confirm"
        label="Confirm password"
        icon={Lock}
        placeholder="Type it again"
        autoComplete="new-password"
        error={errors.confirm}
      />

      <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)}>
        I agree to the{" "}
        <Link href="/terms" className="font-semibold text-brand-navy underline underline-offset-2">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-brand-navy underline underline-offset-2">
          Privacy Notice
        </Link>
      </Checkbox>

      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}

      <Button type="submit" disabled={!agreed || pending}>
        {pending ? "Creating your account…" : role === "technician" ? "Sign up as a technician" : "Sign up"}
      </Button>
    </form>
  );
}
