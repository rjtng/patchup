"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import { Camera, Home, MapPin, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/text-field";
import {
  firstFreeDay,
  radioChip as chip,
  slotFree,
  VisitTimePicker,
  type VisitChoice,
} from "@/components/bookings/visit-time-picker";
import { addBookingPhotos, MAX_PHOTOS, shrinkPhoto } from "@/lib/booking-photos";
import { formatPeso, visitTime } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import type { Point } from "@/lib/tracking";
import { PinAddress } from "@/components/addresses/pin-address";

type Address = {
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
type Field = "appliance" | "problem" | "when" | "street" | "barangay" | "city" | "province" | "form";

const NEW_ADDRESS = "new";

// Messages raised by the booking functions are written for people; anything
// else (a dropped connection, say) gets a general one.
function bookingErrorMessage(error: PostgrestError) {
  if (error.code === "P0001" || error.code === "42501") return error.message;
  return "We couldn't book that. Check your connection and try again.";
}

export function BookingForm({
  category,
  technician,
  technicianMissing,
  addresses: initialAddresses,
  discount,
  initial,
  busy,
  now,
}: {
  category: { id: string; name: string; inspection_fee: number };
  technician: { id: string; full_name: string } | null;
  technicianMissing: boolean;
  addresses: Address[];
  /** The first-booking offer, if this is their first booking. */
  discount: number;
  /** Booking again: what they wrote last time, and the saved address it was at. */
  initial?: { appliance: string; brand: string; problem: string; addressId?: string } | null;
  /** When the chosen technician is taken (their jobs' times, ISO): those times can't be picked. */
  busy: string[];
  now: number;
}) {
  const router = useRouter();
  const [busyAt] = useState(() => busy.map((t) => Date.parse(t)));
  const [when, setWhen] = useState<VisitChoice>(() => ({ day: firstFreeDay(now, busyAt), slot: null }));
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressChoice, setAddressChoice] = useState(initial?.addressId ?? initialAddresses[0]?.id ?? NEW_ADDRESS);
  const [newPin, setNewPin] = useState<Point | null>(null); // for a new address
  const chosen = addresses.find((a) => a.id === addressChoice);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  // Photos of the problem, made small as they're chosen; sent once the booking is made.
  const [photos, setPhotos] = useState<{ blob: Blob; preview: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const choosePhotos = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, MAX_PHOTOS - photos.length);
    e.target.value = "";
    const shrunk = (await Promise.all(files.map(shrinkPhoto))).filter((b): b is Blob => b !== null);
    setPhotoError(shrunk.length < files.length ? "Some of those couldn't be read as photos. Try a JPG or PNG." : null);
    setPhotos((list) => [...list, ...shrunk.map((blob) => ({ blob, preview: URL.createObjectURL(blob) }))].slice(0, MAX_PHOTOS));
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (name: string) => String(data.get(name) ?? "").trim();
    const appliance = get("appliance");
    const problem = get("problem");
    const newAddress =
      addressChoice === NEW_ADDRESS
        ? {
            label: get("label") || "Home",
            street: get("street"),
            barangay: get("barangay"),
            city: get("city"),
            province: get("province"),
            landmark: get("landmark"),
            ...newPin,
          }
        : null;

    const next: typeof errors = {};
    if (!appliance) next.appliance = "Say what needs fixing.";
    if (!problem) next.problem = "Describe the problem so the technician comes prepared.";
    if (!when.slot || !slotFree(when.day, when.slot, Date.now(), busyAt)) next.when = "Pick a visit time.";
    if (newAddress) {
      if (!newAddress.street) next.street = "Enter the house number and street.";
      if (!newAddress.barangay) next.barangay = "Enter the barangay.";
      if (!newAddress.city) next.city = "Enter the city or municipality.";
      if (!newAddress.province) next.province = "Enter the province.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !when.slot) return;
    setPending(true);

    const supabase = createClient();
    let addressId = addressChoice;
    if (newAddress) {
      const { data: saved, error } = await supabase.from("addresses").insert(newAddress).select("*").single();
      if (error) {
        setErrors({ form: "We couldn't save that address. Check it and try again." });
        setPending(false);
        return;
      }
      // Keep it as a saved address, so trying again doesn't save it twice.
      setAddresses((list) => [...list, saved]);
      setAddressChoice(saved.id);
      addressId = saved.id;
    }

    const { data: booking, error } = await supabase.rpc("create_booking", {
      category_id: category.id,
      address_id: addressId,
      appliance,
      brand: get("brand"),
      problem,
      scheduled_at: visitTime(when.day, when.slot),
      ...(technician && { technician_id: technician.id }),
    });
    if (error) {
      setErrors({ form: bookingErrorMessage(error) });
      setPending(false);
      return;
    }
    const added = photos.length > 0 ? await addBookingPhotos(supabase, booking.id, photos.map((p) => p.blob)) : 0;
    // This page stays ready in the background: its photos aren't for the next booking.
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    router.push(`/bookings/${booking.id}${added < photos.length ? "?photos=failed" : ""}`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8 px-6 pt-6">
      {technicianMissing && (
        <p role="status" className="rounded-field bg-brand-navy/5 px-4 py-3 text-sm text-brand-navy">
          That technician isn&apos;t taking bookings right now, so your request will go to every available
          technician.
        </p>
      )}

      <section aria-labelledby="what" className="flex flex-col gap-5">
        <h2 id="what" className="text-lg font-bold text-ink">
          What needs fixing?
        </h2>
        {initial && <p className="text-sm text-muted">Filled in from your last booking. Change anything you need.</p>}
        <TextField
          name="appliance"
          label="Item"
          placeholder="e.g. Kitchen faucet, aircon, electric fan"
          defaultValue={initial?.appliance}
          error={errors.appliance}
        />
        <TextField name="brand" label="Brand (optional)" placeholder="e.g. Carrier, Samsung" defaultValue={initial?.brand} />
        <TextAreaField
          name="problem"
          label="What's wrong?"
          placeholder="e.g. Water leaks under the sink whenever the tap is on."
          maxLength={2000}
          defaultValue={initial?.problem}
          error={errors.problem}
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-ink">Photos (optional)</p>
          <p className="text-sm text-muted">Up to {MAX_PHOTOS}, so the technician sees the problem before coming.</p>
          <ul className="mt-1.5 grid grid-cols-3 gap-2">
            {photos.map((photo, i) => (
              <li key={photo.preview} className="relative aspect-square overflow-hidden rounded-field bg-surface">
                {/* A photo still on the phone (a local preview), so no image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => {
                    URL.revokeObjectURL(photo.preview);
                    setPhotos((list) => list.filter((p) => p !== photo));
                  }}
                  className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink"
                >
                  <X aria-hidden className="size-4" strokeWidth={2.5} />
                </button>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li>
                <label className="grid aspect-square cursor-pointer place-items-center rounded-field border-2 border-dashed border-line bg-white text-brand-navy has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-yellow">
                  <span className="flex flex-col items-center gap-1 text-xs font-semibold">
                    <Camera aria-hidden className="size-6" />
                    Add photo
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    aria-label="Add photos"
                    onChange={choosePhotos}
                    className="sr-only"
                  />
                </label>
              </li>
            )}
          </ul>
          {photoError && <p className="text-sm text-danger">{photoError}</p>}
        </div>
      </section>

      <VisitTimePicker
        legend="When should the technician come?"
        value={when}
        onChange={setWhen}
        now={now}
        busy={busyAt}
        error={errors.when}
      />

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 text-lg font-bold text-ink">Where?</legend>
        {addresses.map((a) => (
          <label key={a.id} className={cn(chip(addressChoice === a.id), "flex items-start gap-3 text-left")}>
            <input
              type="radio"
              name="address"
              value={a.id}
              checked={addressChoice === a.id}
              onChange={() => setAddressChoice(a.id)}
              className="sr-only"
            />
            <Home aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              <span className="block">{a.label}</span>
              <span className={cn("block font-normal", addressChoice === a.id ? "text-white/85" : "text-muted")}>
                {a.street}, {a.barangay}, {a.city}
              </span>
            </span>
          </label>
        ))}
        {addresses.length > 0 && (
          <label className={cn(chip(addressChoice === NEW_ADDRESS), "flex items-center gap-3 text-left")}>
            <input
              type="radio"
              name="address"
              value={NEW_ADDRESS}
              checked={addressChoice === NEW_ADDRESS}
              onChange={() => setAddressChoice(NEW_ADDRESS)}
              className="sr-only"
            />
            <MapPin aria-hidden className="size-5 shrink-0" />
            A new address
          </label>
        )}
        {addressChoice === NEW_ADDRESS && (
          <div className="flex flex-col gap-4">
            <TextField name="label" label="Name this place" placeholder="Home" />
            <TextField
              name="street"
              label="House no., street, building"
              placeholder="e.g. 12 Mabini St"
              autoComplete="address-line1"
              error={errors.street}
            />
            <TextField name="barangay" label="Barangay" placeholder="e.g. San Antonio" error={errors.barangay} />
            <TextField
              name="city"
              label="City or municipality"
              placeholder="e.g. Pasig"
              autoComplete="address-level2"
              error={errors.city}
            />
            <TextField
              name="province"
              label="Province"
              placeholder="e.g. Metro Manila"
              autoComplete="address-level1"
              error={errors.province}
            />
            <TextField
              name="landmark"
              label="Landmark (optional)"
              placeholder="e.g. Blue gate beside the sari-sari store"
            />
          </div>
        )}
        {addressChoice === NEW_ADDRESS ? (
          <PinAddress
            pinned={newPin !== null}
            onPin={async (point) => {
              setNewPin(point);
              return null;
            }}
          />
        ) : (
          chosen && (
            <PinAddress
              key={chosen.id}
              pinned={chosen.latitude != null}
              onPin={async (point) => {
                const { error } = await createClient().from("addresses").update(point).eq("id", chosen.id);
                if (error) return "We couldn't save the pin. Try again.";
                setAddresses((list) => list.map((a) => (a.id === chosen.id ? { ...a, ...point } : a)));
                return null;
              }}
            />
          )
        )}
      </fieldset>

      <section aria-label="Summary" className="rounded-card bg-white p-5 text-sm shadow-sm">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Technician</dt>
            <dd className="text-right font-semibold text-ink">{technician?.full_name || "First available"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Inspection fee</dt>
            <dd className="font-semibold text-ink">{formatPeso(category.inspection_fee)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">First-booking offer</dt>
              <dd className="font-semibold text-ink">−{formatPeso(discount)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-muted">
          {discount > 0 && `As it's your first booking, ${formatPeso(discount)} is taken off what you pay. `}
          Pay in cash after the visit. The technician tells you the price of the repair before starting,
          and you decide whether to go ahead.
        </p>
      </section>

      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Booking…" : "Book repair"}
      </Button>
    </form>
  );
}
