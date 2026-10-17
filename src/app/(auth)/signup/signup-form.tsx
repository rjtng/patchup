"use client";

import { HardHat, Home, Lock, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";

type Role = "customer" | "technician";
type Errors = Partial<Record<"name" | "account" | "password" | "confirm", string>>;

const roles: Array<{ value: Role; label: string; icon: typeof Home }> = [
  { value: "customer", label: "I need repairs", icon: Home },
  { value: "technician", label: "I'm a technician", icon: HardHat },
];

export function SignupForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("customer");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const account = String(data.get("account") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    const next: Errors = {};
    if (!name) next.name = "Enter your full name.";
    if (!account) next.account = "Enter your email or phone number.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // TODO: create the account with Supabase Auth (store `role` on the profile).
    router.push("/signup/verify");
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
        name="account"
        label="Email or phone number"
        icon={Mail}
        placeholder="you@example.com"
        autoComplete="username"
        inputMode="email"
        error={errors.account}
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
          Privacy Policy
        </Link>
      </Checkbox>

      <Button type="submit" disabled={!agreed}>
        {role === "technician" ? "Sign up as a technician" : "Sign up"}
      </Button>
    </form>
  );
}
