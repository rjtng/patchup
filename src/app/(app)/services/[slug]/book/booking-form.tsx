"use client";

import type { PostgrestError } from "@supabase/supabase-js";
import { Home, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/text-field";
import { formatPeso, isSlotOpen, TIME_SLOTS, upcomingDays, visitTime } from "@/lib/bookings";
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

// A radio button styled as a chip. `relative` keeps the hidden input inside the
// chip, so the scrolling row of days can't widen the page.
const chip = (selected: boolean) =>
  cn(
    "relative rounded-field border-2 px-3 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-yellow has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40",
    selected ? "border-brand-navy bg-brand-navy text-white" : "cursor-pointer border-line bg-white text-ink hover:border-brand-navy/40",
  );

export function BookingForm({
  category,
  technician,
  technicianMissing,
  addresses: initialAddresses,
  discount,
  now,
}: {
  category: { id: string; name: string; inspection_fee: number };
  technician: { id: string; full_name: string } | null;
  technicianMissing: boolean;
  addresses: Address[];
  /** The first-booking offer, if this is their first booking. */
  discount: number;
  now: number;
}) {
  const router = useRouter();
  const days = upcomingDays(now);
  const [day, setDay] = useState(() => days.find((d) => d.open)?.value ?? days[0].value);
  const [slot, setSlot] = useState<string | null>(null);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressChoice, setAddressChoice] = useState(initialAddresses[0]?.id ?? NEW_ADDRESS);
  const [newPin, setNewPin] = useState<Point | null>(null); // for a new address
  const chosen = addresses.find((a) => a.id === addressChoice);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);

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
    if (!slot || !isSlotOpen(day, slot, Date.now())) next.when = "Pick a visit time.";
    if (newAddress) {
      if (!newAddress.street) next.street = "Enter the house number and street.";
      if (!newAddress.barangay) next.barangay = "Enter the barangay.";
      if (!newAddress.city) next.city = "Enter the city or municipality.";
      if (!newAddress.province) next.province = "Enter the province.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !slot) return;
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
      scheduled_at: visitTime(day, slot),
      ...(technician && { technician_id: technician.id }),
    });
    if (error) {
      setErrors({ form: bookingErrorMessage(error) });
      setPending(false);
      return;
    }
    router.push(`/bookings/${booking.id}`);
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
        <TextField name="appliance" label="Item" placeholder="e.g. Kitchen faucet, aircon, electric fan" error={errors.appliance} />
        <TextField name="brand" label="Brand (optional)" placeholder="e.g. Carrier, Samsung" />
        <TextAreaField
          name="problem"
          label="What's wrong?"
          placeholder="e.g. Water leaks under the sink whenever the tap is on."
          maxLength={2000}
          error={errors.problem}
        />
      </section>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 text-lg font-bold text-ink">When should the technician come?</legend>
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          {days.map((d) => (
            <label key={d.value} className={cn(chip(day === d.value), "flex min-w-16 shrink-0 flex-col")}>
              <input
                type="radio"
                name="day"
                value={d.value}
                aria-label={d.spoken}
                checked={day === d.value}
                disabled={!d.open}
                onChange={() => {
                  setDay(d.value);
                  if (slot && !isSlotOpen(d.value, slot, now)) setSlot(null);
                }}
                className="sr-only"
              />
              <span className={cn("text-xs font-medium", day === d.value ? "text-white/80" : "text-muted")}>{d.month}</span>
              {d.label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TIME_SLOTS.map((s) => (
            <label key={s.value} className={chip(slot === s.value)}>
              <input
                type="radio"
                name="slot"
                value={s.value}
                checked={slot === s.value}
                disabled={!isSlotOpen(day, s.value, now)}
                onChange={() => setSlot(s.value)}
                className="sr-only"
              />
              {s.label}
            </label>
          ))}
        </div>
        {errors.when && <p className="text-sm text-danger">{errors.when}</p>}
      </fieldset>

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
