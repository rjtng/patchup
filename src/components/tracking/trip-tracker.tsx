"use client";

import { Navigation } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveTopics } from "@/components/live-updates";
import { firstName } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { distanceKm, etaMinutes, formatAgo, formatDistance, STALE_AFTER_MS, type Point } from "@/lib/tracking";
import { TripMap } from "./trip-map";

export type TripLocation = Point & { accuracy: number | null; updated_at: string };

/**
 * The customer's view of a technician on the way: where they are on a map,
 * roughly how far and how long, and how fresh that is. Moves by itself as the
 * technician's phone shares new positions.
 */
export function TripTracker({
  bookingId,
  technicianName,
  destination,
  initial,
}: {
  bookingId: string;
  technicianName: string | null;
  destination: Point | null;
  initial: TripLocation | null;
}) {
  const [location, setLocation] = useState(initial);
  const [now, setNow] = useState<number | null>(null);
  const lastLoad = useRef(0);
  const name = technicianName ? firstName(technicianName) : "Your technician";

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    const { data, error } = await createClient()
      .from("technician_locations")
      .select("latitude, longitude, accuracy, updated_at")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (!error) setLocation(data);
  }, [bookingId]);

  useLiveTopics([`booking:${bookingId}`], load, ["location"]);

  // A clock for "updated 20 seconds ago", and a reload now and then in case a
  // live update was missed.
  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (Date.now() - lastLoad.current > 30_000) load();
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const age = location && now !== null ? now - new Date(location.updated_at).getTime() : null;
  const stale = age !== null && age > STALE_AFTER_MS;
  const km = location && destination ? distanceKm(location, destination) : null;

  return (
    <section aria-label={`${name} on the way`} className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy">
          <Navigation aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-ink">{name} is on the way</h2>
          {/* Announced when it changes; "updated … ago" isn't, it ticks every few seconds. */}
          <p aria-live="polite" className={cn("text-sm", location ? "font-semibold text-ink" : "text-muted")}>
            {!location
              ? `Waiting for ${technicianName ? `${name}'s` : "their"} location. It shows here once their phone shares it.`
              : km === null
                ? null
                : km < 0.15
                  ? "Almost there"
                  : `About ${etaMinutes(km)} min away · ${formatDistance(km)}`}
          </p>
          {age !== null && (
            <p className={cn("text-sm", stale ? "text-danger" : "text-muted")}>
              {stale
                ? `Last seen ${formatAgo(age)}. ${technicianName ? `${name}'s` : "Their"} phone may have lost signal.`
                : `Updated ${formatAgo(age)}`}
            </p>
          )}
        </div>
      </div>
      {(location || destination) && (
        <TripMap
          technician={location}
          destination={destination}
          initial={name.charAt(0).toUpperCase()}
          label={`Map of ${technicianName ? name : "your technician"} on the way to you`}
        />
      )}
      {location && !destination && (
        <p className="text-xs text-muted">
          Your address has no map pin, so there&apos;s no estimate. Next time, pin it when you book.
        </p>
      )}
    </section>
  );
}
