"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PinPicker } from "@/components/addresses/pin-picker";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { createClient } from "@/lib/supabase/client";
import { pin, type Point } from "@/lib/tracking";

export type SavedAddress = {
  id: string;
  label: string;
  street: string;
  barangay: string;
  city: string;
  province: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
};
type Field = "street" | "barangay" | "city" | "province" | "form";

/** Adds a saved address, or edits (and deletes) one. */
export function AddressForm({ address }: { address?: SavedAddress }) {
  const router = useRouter();
  const [point, setPoint] = useState<Point | null>(address ? pin(address) : null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const get = (name: string) => String(data.get(name) ?? "").trim();
    const values = {
      label: get("label") || "Home",
      street: get("street"),
      barangay: get("barangay"),
      city: get("city"),
      province: get("province"),
      landmark: get("landmark"),
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    };

    const next: typeof errors = {};
    if (!values.street) next.street = "Enter the house number and street.";
    if (!values.barangay) next.barangay = "Enter the barangay.";
    if (!values.city) next.city = "Enter the city or municipality.";
    if (!values.province) next.province = "Enter the province.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const supabase = createClient();
    const { error } = address
      ? await supabase.from("addresses").update(values).eq("id", address.id)
      : await supabase.from("addresses").insert(values);
    setPending(false);
    if (error) {
      setErrors({ form: "We couldn't save the address. Check your connection and try again." });
      return;
    }
    // This screen is kept for a while after leaving it: start the next new address empty.
    if (!address) {
      form.reset();
      setPoint(null);
    }
    router.push("/profile");
  };

  return (
    <form
      onSubmit={onSubmit}
      // A field's message goes once it's being fixed.
      onChange={(e) => {
        const { name } = e.target as EventTarget & { name?: string };
        if (name && name in errors) setErrors((current) => ({ ...current, [name]: undefined }));
      }}
      noValidate
      className="flex flex-col gap-6 px-6 pt-6"
    >
      <section aria-label="Address" className="flex flex-col gap-4">
        <TextField name="label" label="Name this place" placeholder="e.g. Home, Office, Lola's house" defaultValue={address?.label} maxLength={40} />
        <TextField
          name="street"
          label="House no., street, building"
          placeholder="e.g. 12 Mabini St"
          autoComplete="address-line1"
          defaultValue={address?.street}
          maxLength={200}
          error={errors.street}
        />
        <TextField name="barangay" label="Barangay" placeholder="e.g. San Antonio" defaultValue={address?.barangay} maxLength={100} error={errors.barangay} />
        <TextField
          name="city"
          label="City or municipality"
          placeholder="e.g. Pasig"
          autoComplete="address-level2"
          defaultValue={address?.city}
          maxLength={100}
          error={errors.city}
        />
        <TextField
          name="province"
          label="Province"
          placeholder="e.g. Metro Manila"
          autoComplete="address-level1"
          defaultValue={address?.province}
          maxLength={100}
          error={errors.province}
        />
        <TextField
          name="landmark"
          label="Landmark (optional)"
          placeholder="e.g. Blue gate beside the sari-sari store"
          defaultValue={address?.landmark}
          maxLength={200}
        />
      </section>

      <section aria-labelledby="pin" className="flex flex-col gap-2">
        <h2 id="pin" className="text-lg font-bold text-ink">
          Map pin (optional)
        </h2>
        <p className="text-sm text-muted">
          Helps the technician find the place, and shows you how far away they are on the way.
        </p>
        <PinPicker value={point} onChange={setPoint} />
      </section>

      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : address ? "Save changes" : "Save address"}
      </Button>
      {address && <DeleteAddress id={address.id} />}
    </form>
  );
}

// Deleting asks first. Bookings keep their own copy of the address, so past
// and coming bookings aren't affected.
function DeleteAddress({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setPending(true);
    setError(null);
    const { error } = await createClient().from("addresses").delete().eq("id", id);
    setPending(false);
    if (error) {
      setError("We couldn't delete it. Check your connection and try again.");
      return;
    }
    router.push("/profile");
  };

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete address
      </Button>
    );
  }
  return (
    <div role="group" aria-label="Delete this address?" className="rounded-card bg-white p-5 shadow-sm">
      <p className="font-semibold text-ink">Delete this address?</p>
      <p className="mt-1 text-sm text-muted">Your bookings keep their address.</p>
      {error && (
        <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
        <Button variant="danger" onClick={remove} disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
      </div>
    </div>
  );
}
