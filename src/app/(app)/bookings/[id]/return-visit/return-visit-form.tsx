"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { firstFreeDay, slotFree, VisitTimePicker, type VisitChoice } from "@/components/bookings/visit-time-picker";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/text-field";
import { formatDay, TIME_SLOTS, upcomingDays, visitTime } from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";
import { scheduleNote, type TimeOff, type WorkingDay } from "@/lib/working-hours";

type Field = "problem" | "when" | "form";

// What's wrong now, and when to come: the return visit goes to the technician
// who did the repair, at the same address, with no inspection fee.
export function ReturnVisitForm({
  repair,
  until,
  technician,
  busy,
  hours,
  timeOff,
  now,
}: {
  repair: { id: string; what: string; doneAt: string; where: string; by: string | null };
  /** When the warranty ends (ms). */
  until: number;
  /** Who it goes to: the technician who did the repair, or nobody yet if they can't take jobs now (PatchUp finds someone). */
  technician: { id: string; full_name: string } | null;
  /** When they're taken (ISO), work and are off: those times can't be picked. */
  busy: string[];
  hours: WorkingDay[];
  timeOff: TimeOff[];
  now: number;
}) {
  const router = useRouter();
  const [busyAt] = useState(() => busy.map((t) => Date.parse(t)));
  const [when, setWhen] = useState<VisitChoice>(() => ({
    day: firstFreeDay(now, { busy: busyAt, hours, timeOff }),
    slot: null,
  }));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  const name = technician?.full_name ? firstName(technician.full_name) : null;
  const note = name && scheduleNote(name, hours, timeOff);
  // On holiday, or fully booked: no time to pick for now.
  const [noTime] = useState(
    () =>
      !upcomingDays(now).some((d) =>
        TIME_SLOTS.some((s) => slotFree(d.value, s.value, now, { busy: busyAt, hours, timeOff })),
      ),
  );
  // A field's message goes once it's changed.
  const clear = (field: Field) => setErrors((list) => (list[field] ? { ...list, [field]: undefined } : list));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = String(new FormData(e.currentTarget).get("problem") ?? "").trim();
    const next: typeof errors = {};
    if (!problem) next.problem = "Say what's wrong now, so the technician comes prepared.";
    if (!when.slot || !slotFree(when.day, when.slot, Date.now(), { busy: busyAt, hours, timeOff }))
      next.when = "Pick a visit time.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !when.slot) return;
    setPending(true);
    const { data: booking, error } = await createClient().rpc("request_return_visit", {
      booking_id: repair.id,
      problem,
      scheduled_at: visitTime(when.day, when.slot),
    });
    if (error) {
      setErrors({
        form:
          error.code === "P0001" || error.code === "42501"
            ? error.message
            : "We couldn't send that. Check your connection and try again.",
      });
      setPending(false);
      return;
    }
    router.push(`/bookings/${booking.id}`);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8 px-6 pt-6">
      <section aria-labelledby="what" className="flex flex-col gap-5">
        <div>
          <h2 id="what" className="text-lg font-bold text-ink">
            What needs another look?
          </h2>
          <p className="mt-1 text-sm text-muted">
            {repair.what}, repaired {formatDay(repair.doneAt)}. The warranty runs until{" "}
            {formatDay(new Date(until).toISOString())}.
          </p>
        </div>
        <TextAreaField
          name="problem"
          label="What's wrong now?"
          placeholder="e.g. It's leaking under the sink again."
          maxLength={2000}
          onChange={() => clear("problem")}
          error={errors.problem}
        />
      </section>

      <VisitTimePicker
        legend={`When should ${name ?? "the technician"} come?`}
        value={when}
        onChange={(value) => {
          setWhen(value);
          clear("when");
        }}
        now={now}
        busy={busyAt}
        hours={hours}
        timeOff={timeOff}
        error={errors.when}
      />
      {note && <p className="-mt-3 text-sm text-muted">{note}</p>}
      {noTime && (
        <p role="status" className="-mt-3 rounded-field bg-brand-navy/5 px-4 py-3 text-sm text-brand-navy">
          {name ?? "The technician"} has no free time in the next two weeks. To get it sorted sooner, report a problem
          on the booking, and PatchUp will help.
        </p>
      )}

      <section aria-label="Summary" className="rounded-card bg-white p-5 text-sm shadow-sm">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Technician</dt>
            <dd className="text-right font-semibold text-ink">{technician?.full_name || "PatchUp finds one"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Where</dt>
            <dd className="text-right font-semibold text-ink">{repair.where}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Inspection fee</dt>
            <dd className="font-semibold text-ink">Free</dd>
          </div>
        </dl>
        <p className="mt-3 text-muted">
          {technician
            ? `${name ?? "The technician"} fixes the same problem at no charge for the work.`
            : `${repair.by ? firstName(repair.by) : "The technician who did it"} can't take jobs now, so PatchUp sends another technician, at no charge for the work.`}{" "}
          If it needs new parts, they&apos;re quoted first, and you decide.
        </p>
      </section>

      {errors.form && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {errors.form}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Ask for a return visit"}
      </Button>
    </form>
  );
}
