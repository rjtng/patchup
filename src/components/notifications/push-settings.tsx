"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isIos, pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

const IOS_HINT =
  "On iPhone, add PatchUp to your Home Screen first (Share, then Add to Home Screen), then turn notifications on from there.";

/**
 * Phone notifications for this device. "settings" (Profile) always shows where
 * things stand; "prompt" (Jobs, a booking) only appears while they could be
 * turned on, with `children` saying why it's worth it.
 */
export function PushSettings({ variant, children }: { variant: "settings" | "prompt"; children?: string }) {
  const [state, setState] = useState<PushState | "checking">("checking");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState, () => setState("unavailable"));
  }, []);

  const turnOn = async () => {
    setPending(true);
    setMessage(null);
    try {
      const next = await turnOnPush();
      setState(next);
      if (next === "denied") setMessage("Notifications are blocked. Allow them for PatchUp in your browser's settings.");
    } catch {
      setMessage("We couldn't turn them on. Check your connection and try again.");
    }
    setPending(false);
  };
  const turnOff = async () => {
    setPending(true);
    setMessage(null);
    try {
      await turnOffPush();
      setState("off");
    } catch {
      setMessage("We couldn't turn them off. Check your connection and try again.");
    }
    setPending(false);
  };
  const sendTest = async () => {
    setPending(true);
    const { error } = await createClient().rpc("send_test_notification");
    setMessage(error ? (error.code === "P0001" ? error.message : "We couldn't send it. Try again.") : "Sent. It should arrive in a few seconds.");
    setPending(false);
  };

  const iosHint = state === "unsupported" && isIos();
  if (variant === "prompt" && state !== "off" && !iosHint) return null;

  const status: Record<typeof state, string> = {
    checking: "Checking…",
    unsupported: iosHint ? IOS_HINT : "This browser can't show notifications. Chrome, Edge and Firefox can.",
    denied: "Notifications are blocked for PatchUp in this browser's settings. Allow them there, then come back.",
    unavailable: "Phone notifications aren't available yet.",
    off: "Get updates on this phone, even when PatchUp is closed.",
    on: "On for this phone.",
  };

  return (
    <section aria-labelledby="push" className="flex gap-3 rounded-card bg-white p-5 shadow-sm">
      <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-navy" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h2 id="push" className="font-bold text-ink">
            Phone notifications
          </h2>
          <p className="mt-0.5 text-sm text-muted">{variant === "prompt" && children && !iosHint ? children : status[state]}</p>
        </div>
        {state === "off" && (
          <Button onClick={turnOn} disabled={pending}>
            {pending ? "Turning on…" : "Turn on"}
          </Button>
        )}
        {state === "on" && (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={sendTest} disabled={pending}>
              Send a test
            </Button>
            <Button variant="ghost" onClick={turnOff} disabled={pending}>
              Turn off
            </Button>
          </div>
        )}
        {message && (
          <p role="status" className="text-sm text-brand-navy">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
