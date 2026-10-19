"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { saveMyName } from "@/lib/account";
import { formatPhone, normalizePhone, saveMyPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

type Errors = Partial<Record<"name" | "phone" | "form", string>>;

/** A customer's name and mobile number (their email is how they log in, so it's shown, not edited). */
export function DetailsForm({
  userId,
  name,
  email,
  phone,
}: {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const fullName = String(data.get("name") ?? "").trim();
    const phoneText = String(data.get("phone") ?? "").trim();
    const newPhone = phoneText ? normalizePhone(phoneText) : null;

    const next: Errors = {};
    if (!fullName) next.name = "Enter your name.";
    if (phoneText && !newPhone) next.phone = "Enter a Philippine mobile number, like 0917 123 4567.";
    setErrors(next);
    setDone(false);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const supabase = createClient();
    const results = await Promise.all([
      fullName === name ? true : saveMyName(supabase, userId, fullName),
      newPhone === phone ? true : saveMyPhone(supabase, userId, newPhone),
    ]);
    setPending(false);
    if (results.includes(false)) {
      setErrors({ form: "Some changes weren't saved. Check your connection and try again." });
      return;
    }
    setDone(true);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="details" className="flex flex-col gap-5 px-6 pt-6">
      <h2 id="details" className="text-lg font-bold text-ink">
        Your details
      </h2>
      <TextField name="name" label="Name" defaultValue={name} autoComplete="name" maxLength={100} error={errors.name} />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-ink">Email</p>
        <p className="break-all text-base text-ink">{email}</p>
        <p className="text-sm text-muted">You log in with this.</p>
      </div>
      <TextField
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label="Mobile number (optional)"
        placeholder="e.g. 0917 123 4567"
        defaultValue={phone ? formatPhone(phone) : ""}
        hint="Only the technician doing a job for you sees it, so they can call if they can't find the place."
        error={errors.phone}
      />
      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-semibold text-brand-navy">
          Saved.
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
