"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { iconLabel, SERVICE_ICON_NAMES, ServiceIcon } from "@/components/services/service-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { checkService, slugFor, type ServiceErrors, type ServiceInput } from "@/lib/service-form";
import { addService, saveService } from "./actions";

type Service = { id: string; slug: string; name: string; icon: string; inspection_fee: number; is_active: boolean };

const NEW: ServiceInput = { name: "", slug: "", fee: "", icon: "wrench", shown: true };

/** Adds a service (no `service`), or changes one: its name, fee, icon, and whether customers see it. */
export function ServiceForm({ service }: { service?: Service }) {
  const router = useRouter();
  const initial: ServiceInput = service
    ? {
        name: service.name,
        slug: service.slug,
        fee: String(Number(service.inspection_fee)),
        icon: service.icon,
        shown: service.is_active,
      }
    : NEW;
  const [values, setValues] = useState(initial);
  // The web address follows the name until it's typed in itself.
  const [slugTyped, setSlugTyped] = useState(false);
  const [errors, setErrors] = useState<ServiceErrors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const change = (next: Partial<ServiceInput>) => {
    const followName = !service && !slugTyped && next.name !== undefined;
    setValues((v) => ({ ...v, ...next, ...(followName ? { slug: slugFor(next.name!) } : {}) }));
    // What's been changed is no longer wrong (until it's checked again).
    setErrors((e) => {
      const left: ServiceErrors = { ...e, form: undefined };
      for (const key of Object.keys(next)) delete left[key as keyof ServiceErrors];
      if (followName) delete left.slug;
      return left;
    });
    setDone(false);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = checkService(values, SERVICE_ICON_NAMES, { isNew: !service });
    setErrors(found);
    setDone(false);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const result = await (service ? saveService(service.id, values) : addService(values)).catch(() => ({
      errors: { form: "That didn't save. Check your connection and try again." } as ServiceErrors,
      id: undefined,
    }));
    setPending(false);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    if (service) {
      setDone(true);
      router.refresh();
    } else {
      // This page stays ready in the background: empty it for the next service.
      setValues(NEW);
      setSlugTyped(false);
      router.push("/admin/services");
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        label="Name"
        name="name"
        value={values.name}
        onChange={(e) => change({ name: e.target.value })}
        maxLength={60}
        autoComplete="off"
        error={errors.name}
        hint={service ? undefined : "As customers see it, like Aircon cleaning."}
      />
      {!service && (
        <TextField
          label="Web address"
          name="slug"
          value={values.slug}
          onChange={(e) => {
            setSlugTyped(true);
            change({ slug: e.target.value.toLowerCase() });
          }}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.slug}
          hint={`Its page: /services/${values.slug || "…"}. It can't be changed later.`}
        />
      )}
      <TextField
        label="Inspection fee (₱)"
        name="fee"
        value={values.fee}
        onChange={(e) => change({ fee: e.target.value })}
        inputMode="decimal"
        autoComplete="off"
        error={errors.fee}
        hint="Paid in cash after the visit, whether or not the repair goes ahead. Bookings already made keep their fee."
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-ink">Icon</legend>
        <div className="grid grid-cols-7 gap-1.5">
          {SERVICE_ICON_NAMES.map((name) => (
            <label key={name} className="relative">
              <input
                type="radio"
                name="icon"
                value={name}
                checked={values.icon === name}
                onChange={() => change({ icon: name })}
                aria-label={iconLabel(name)}
                className="peer absolute inset-0 appearance-none"
              />
              <span
                className={cn(
                  "pointer-events-none grid aspect-square place-items-center rounded-field border-2 border-line bg-white text-brand-navy",
                  "peer-checked:border-brand-navy peer-checked:bg-brand-navy peer-checked:text-white",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-navy peer-focus-visible:ring-offset-2",
                )}
              >
                <ServiceIcon name={name} className="size-5" />
              </span>
            </label>
          ))}
        </div>
        {errors.icon && <p className="text-sm text-danger">{errors.icon}</p>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Checkbox name="shown" checked={values.shown} onChange={(e) => change({ shown: e.target.checked })}>
          Customers can see and book it
        </Checkbox>
        <p className="pl-8 text-sm text-muted">
          A hidden service can&apos;t be booked or found. Bookings already made keep it, and technicians who offer it
          keep it for when it&apos;s back.
        </p>
      </div>

      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-field bg-brand-navy/5 px-4 py-3 text-sm text-brand-navy">
          {values.shown ? "Saved. Customers see the change now." : "Saved. It's hidden from customers now."}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : service ? "Save" : "Add service"}
      </Button>
    </form>
  );
}
