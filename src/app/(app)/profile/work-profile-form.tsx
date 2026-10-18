"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TextAreaField, TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

const VERIFICATION: Record<Enums<"verification_status">, { label: string; detail: string; className: string }> = {
  approved: {
    label: "Approved",
    detail: "Customers can find and book you.",
    className: "bg-brand-navy/10 text-brand-navy",
  },
  pending: {
    label: "Being checked",
    detail: "PatchUp is checking your details. Customers can book you once you're approved.",
    className: "bg-brand-yellow text-ink",
  },
  rejected: {
    label: "Not approved",
    detail: "Contact PatchUp support to find out why.",
    className: "bg-danger/10 text-danger",
  },
  suspended: {
    label: "Suspended",
    detail: "Contact PatchUp support to find out why.",
    className: "bg-danger/10 text-danger",
  },
};

type Errors = Partial<Record<"name" | "years" | "form", string>>;

// What customers see about a technician, and the services they get requests for.
export function WorkProfileForm({
  technicianId,
  name,
  work,
  services,
  categories,
}: {
  technicianId: string;
  name: string;
  work: { bio: string; city: string; years_experience: number | null; verification_status: Enums<"verification_status"> };
  services: string[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(services);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const verification = VERIFICATION[work.verification_status];

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (key: string) => String(data.get(key) ?? "").trim();
    const fullName = get("name");
    const yearsText = get("years");
    const years = yearsText === "" ? null : Number(yearsText);
    const chosen = data.getAll("services").map(String);

    const next: Errors = {};
    if (!fullName) next.name = "Enter your name.";
    if (years !== null && !(Number.isInteger(years) && years >= 0 && years <= 60)) next.years = "Enter a whole number of years, 0 to 60.";
    setErrors(next);
    setDone(false);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const supabase = createClient();
    const added = chosen.filter((id) => !saved.includes(id));
    const removed = saved.filter((id) => !chosen.includes(id));
    const results = await Promise.all([
      supabase.from("profiles").update({ full_name: fullName }).eq("id", technicianId),
      supabase
        .from("technician_profiles")
        .update({ bio: get("bio"), city: get("city"), years_experience: years })
        .eq("id", technicianId),
      added.length > 0
        ? supabase.from("technician_services").insert(added.map((category_id) => ({ technician_id: technicianId, category_id })))
        : null,
      removed.length > 0
        ? supabase.from("technician_services").delete().eq("technician_id", technicianId).in("category_id", removed)
        : null,
    ]);
    setPending(false);
    if (results.some((result) => result?.error)) {
      setErrors({ form: "Some changes weren't saved. Check your connection and try again." });
      return;
    }
    setSaved(chosen);
    setDone(true);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 px-6 pt-6">
      <section aria-label="Account status" className="rounded-card bg-white p-5 shadow-sm">
        <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", verification.className)}>
          {verification.label}
        </span>
        <p className="mt-2 text-sm text-ink">{verification.detail}</p>
      </section>

      <section aria-labelledby="about" className="flex flex-col gap-5">
        <div>
          <h2 id="about" className="text-lg font-bold text-ink">
            Your work profile
          </h2>
          <p className="mt-1 text-sm text-muted">Customers see this when they choose a technician.</p>
        </div>
        <TextField name="name" label="Name" defaultValue={name} autoComplete="name" maxLength={100} error={errors.name} />
        <TextField name="city" label="City where you work" defaultValue={work.city} placeholder="e.g. Pasig" maxLength={100} />
        <TextField
          name="years"
          label="Years of experience"
          defaultValue={work.years_experience ?? ""}
          inputMode="numeric"
          placeholder="e.g. 5"
          error={errors.years}
        />
        <TextAreaField
          name="bio"
          label="About your work"
          defaultValue={work.bio}
          placeholder="e.g. Aircon cleaning and repair, 10 years with Carrier and Koppel units."
          maxLength={1000}
        />
      </section>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-1 text-lg font-bold text-ink">Services you offer</legend>
        <p className="text-sm text-muted">You get requests for these.</p>
        {categories.map((c) => (
          <Checkbox key={c.id} name="services" value={c.id} defaultChecked={services.includes(c.id)}>
            {c.name}
          </Checkbox>
        ))}
      </fieldset>

      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-field bg-brand-navy/5 px-4 py-3 text-sm text-brand-navy">
          Saved.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
