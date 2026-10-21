"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { firstFreeDay, slotFree, VisitTimePicker, type VisitChoice } from "@/components/bookings/visit-time-picker";
import { Button } from "@/components/ui/button";
import { LAST_MINUTE_MS, TIME_SLOTS, TIME_ZONE, visitTime } from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";
import type { WorkingDay } from "@/lib/working-hours";

// Moving a visit to another time, until the technician sets off (see
// reschedule_booking). Times when the technician is taken can't be picked.
// Once a technician has a customer's visit, they move it at most twice, to
// times at least 2 hours away (see the booking limits migration).
export function ChangeTime({
  bookingId,
  current,
  technicianName,
  busy,
  now,
  admin = false,
  movesLeft,
  blocked = null,
  hours = [],
}: {
  bookingId: string;
  /** The visit time now (ISO). */
  current: string;
  /** Who has the job (or was asked for), if anyone. */
  technicianName: string | null;
  /** When they're taken, besides this visit (ISO). */
  busy: string[];
  now: number;
  admin?: boolean;
  /** A customer's visit a technician has (or was asked for): how many more times they can move it. */
  movesLeft?: number;
  /** Why it can't move now, if it can't. */
  blocked?: string | null;
  /** The technician's working hours, when the customer moves it: it moves only within them. */
  hours?: WorkingDay[];
}) {
  const router = useRouter();
  const [busyAt] = useState(() => busy.map((t) => Date.parse(t)));
  const lead = movesLeft === undefined ? undefined : LAST_MINUTE_MS;
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<VisitChoice>(() => {
    // Start on the visit's own day (in Manila), if another time is free that day.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(current));
    const free = TIME_SLOTS.some(
      (s) =>
        Date.parse(visitTime(day, s.value)) !== Date.parse(current) &&
        slotFree(day, s.value, now, { busy: busyAt, lead, hours }),
    );
    return { day: free ? day : firstFreeDay(now, { busy: busyAt, lead, hours }), slot: null };
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (blocked) {
    return (
      <p className="flex gap-3 rounded-card bg-white p-5 text-sm text-muted shadow-sm">
        <CalendarClock aria-hidden className="size-5 shrink-0 text-brand-navy" />
        {blocked}
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarClock aria-hidden className="size-5" />
        Change time
      </Button>
    );
  }

  const save = async () => {
    if (!when.slot) return;
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("reschedule_booking", {
      booking_id: bookingId,
      scheduled_at: visitTime(when.day, when.slot),
    });
    setPending(false);
    if (error) {
      setError(
        error.code === "P0001" || error.code === "42501"
          ? error.message
          : "We couldn't change it. Check your connection and try again.",
      );
      router.refresh();
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const who = technicianName ? firstName(technicianName) : null;
  return (
    <section aria-label="Change the visit time" className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
      <VisitTimePicker
        legend="New visit time"
        value={when}
        onChange={setWhen}
        now={now}
        busy={busyAt}
        current={current}
        lead={lead}
        hours={hours}
        inset="card"
      />
      <p className="text-sm text-muted">
        {who
          ? `${who} is told${admin ? ", and so is the customer" : ""}. If the new time doesn't work for them, they give the job back and another technician can take it.`
          : admin
            ? "The customer is told, and technicians see the new time."
            : "Technicians see the new time."}
        {movesLeft === 1
          ? " This is the last time you can change it."
          : movesLeft !== undefined && " You can change the time twice in all, to a time at least 2 hours away."}
      </p>
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </Button>
        <Button onClick={save} disabled={pending || !when.slot}>
          {pending ? "Saving…" : "Save new time"}
        </Button>
      </div>
    </section>
  );
}
