"use client";

import { LocateFixed, MapPinCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { locationErrorMessage, type Point } from "@/lib/tracking";

/**
 * Puts the address on the map with the phone's location, for customers who
 * are there now: the technician finds it more easily, and the customer sees
 * how far away the technician is on the way. `onPin` returns an error to show,
 * if saving it failed.
 */
export function PinAddress({ pinned, onPin }: { pinned: boolean; onPin: (point: Point) => Promise<string | null> }) {
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pinned) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
        <MapPinCheck aria-hidden className="size-5" />
        Pinned on the map
      </p>
    );
  }

  const pinHere = () => {
    if (!("geolocation" in navigator)) {
      setError("This browser can't tell where you are.");
      return;
    }
    setFinding(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setError(await onPin({ latitude: coords.latitude, longitude: coords.longitude }));
        setFinding(false);
      },
      (e) => {
        setError(locationErrorMessage(e));
        setFinding(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={pinHere} disabled={finding}>
        <LocateFixed aria-hidden className="size-5" />
        {finding ? "Finding you…" : "Pin it with my current location"}
      </Button>
      <p className="text-sm text-muted">
        Optional, if you&apos;re there now. It helps the technician find you, and shows you how far away they are on
        the way.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
