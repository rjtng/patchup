"use client";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { distanceKm, formatAgo, locationErrorMessage, type Point } from "@/lib/tracking";

type State = "checking" | "ask" | "sharing" | "blocked" | "unsupported";

// How often the position goes to the customer: every 10 seconds at most
// (sooner after a move of 50 m), and at least every 30 seconds while
// standing still, so they can tell the phone is still sharing.
const MIN_GAP_MS = 10_000;
const MOVED_M = 50;
const KEEPALIVE_MS = 30_000;

async function startingState(): Promise<State> {
  if (!("geolocation" in navigator)) return "unsupported";
  try {
    const { state } = await navigator.permissions.query({ name: "geolocation" });
    return state === "granted" ? "sharing" : state === "denied" ? "blocked" : "ask";
  } catch {
    return "ask"; // no Permissions API: ask with the button
  }
}

/**
 * On the technician's job page while they're on the way: shares their phone's
 * location with the customer until they mark that they've arrived (the page
 * then stops showing this, which stops it). Keeps the screen on, since phones
 * stop sharing a location from pages in the background.
 */
export function LocationSharing({ bookingId, customerName }: { bookingId: string; customerName: string }) {
  const [state, setState] = useState<State>("checking");
  const [problem, setProblem] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    startingState().then((s) => current && setState(s));
    return () => {
      current = false;
    };
  }, []);

  const last = useRef<{ point: Point; accuracy: number | null; sentAt: number } | null>(null);
  useEffect(() => {
    if (state !== "sharing") return;
    const supabase = createClient();
    let stopped = false;

    const send = async (point: Point, accuracy: number | null) => {
      last.current = { point, accuracy, sentAt: Date.now() };
      const { error } = await supabase.rpc("share_location", { booking_id: bookingId, ...point, accuracy: accuracy ?? undefined });
      if (stopped) return;
      if (error) setProblem("Your location isn't reaching the customer. Check your connection.");
      else {
        setProblem(null);
        setSentAt(Date.now());
      }
    };

    let watch = 0;
    let restart: ReturnType<typeof setTimeout> | undefined;
    const watchPosition = () => {
      watch = navigator.geolocation.watchPosition(
        ({ coords }) => {
          const point = { latitude: coords.latitude, longitude: coords.longitude };
          const previous = last.current;
          const gap = previous ? Date.now() - previous.sentAt : Infinity;
          const moved = previous ? distanceKm(previous.point, point) * 1000 : Infinity;
          if (gap >= MIN_GAP_MS || (moved >= MOVED_M && gap >= 3000)) send(point, Math.round(coords.accuracy));
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setState("blocked");
            return;
          }
          setProblem(locationErrorMessage(error));
          // Some phones stop sending positions after an error: watch again.
          clearTimeout(restart);
          restart = setTimeout(() => {
            navigator.geolocation.clearWatch(watch);
            watchPosition();
          }, 3000);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
      );
    };
    watchPosition();
    const keepalive = setInterval(() => {
      const previous = last.current;
      if (previous && Date.now() - previous.sentAt >= KEEPALIVE_MS) send(previous.point, previous.accuracy);
      setNow(Date.now());
    }, 5000);

    // Keep the screen on while sharing (and again after coming back to the app).
    let lock: WakeLockSentinel | null = null;
    const keepAwake = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock.request("screen").then(
        (l) => {
          if (stopped) l.release().catch(() => {});
          else lock = l;
        },
        () => {}, // not allowed now (battery saver, say): sharing still works
      );
    };
    keepAwake();
    document.addEventListener("visibilitychange", keepAwake);

    return () => {
      stopped = true;
      clearTimeout(restart);
      navigator.geolocation.clearWatch(watch);
      clearInterval(keepalive);
      document.removeEventListener("visibilitychange", keepAwake);
      lock?.release().catch(() => {});
    };
  }, [state, bookingId]);

  const askAndShare = () =>
    navigator.geolocation.getCurrentPosition(
      () => setState("sharing"),
      (error) => (error.code === error.PERMISSION_DENIED ? setState("blocked") : setProblem(locationErrorMessage(error))),
      { enableHighAccuracy: true, timeout: 30_000 },
    );

  if (state === "checking") return null;
  return (
    <section aria-label="Your location" className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy">
          <MapPin aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          {state === "sharing" ? (
            <>
              <h2 className="font-bold text-ink">Sharing your location with {customerName}</h2>
              <p className="text-sm text-muted">
                Keep this screen open while you travel. {customerName} sees you on a map until you tap I&apos;ve
                arrived.
              </p>
              <p role="status" className="mt-1 text-sm text-muted">
                {sentAt === null ? "Finding your location…" : `Sent ${formatAgo((now ?? sentAt) - sentAt)}`}
              </p>
            </>
          ) : state === "ask" ? (
            <>
              <h2 className="font-bold text-ink">Let {customerName} follow you on a map</h2>
              <p className="text-sm text-muted">Only while you&apos;re on the way. It stops when you arrive.</p>
            </>
          ) : state === "blocked" ? (
            <>
              <h2 className="font-bold text-ink">Location is blocked</h2>
              <p className="text-sm text-muted">
                Allow location for PatchUp in this browser&apos;s settings, so {customerName} can see you&apos;re on
                the way.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-bold text-ink">Can&apos;t share your location</h2>
              <p className="text-sm text-muted">This browser can&apos;t share where you are. Message {customerName} instead.</p>
            </>
          )}
          {problem && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {problem}
            </p>
          )}
        </div>
      </div>
      {state === "ask" && <Button onClick={askAndShare}>Share my location</Button>}
    </section>
  );
}
