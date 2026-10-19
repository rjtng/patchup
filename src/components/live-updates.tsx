"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// The database announces changes on Realtime topics (see
// supabase/migrations/*_live_updates.sql): "booking_changed", "notification"
// when someone gets a new one, "message" in a booking's chat, and "location"
// while the technician is on the way.
const EVENTS = ["booking_changed", "notification", "message", "location"];

// What a screen reloads for by default. The location changes every few
// seconds during a trip and only the map needs it (see TripTracker).
const SCREEN_EVENTS = ["booking_changed", "notification", "message"];

// One channel per topic, shared by everything on the page that follows it
// (say, the bell and the list it sits on), and kept for a moment after the
// last follower leaves so moving between pages doesn't rejoin. Listeners get
// the event, or null after rejoining a dropped connection (anything may
// have been missed).
type Listener = (event: string | null) => void;
type Follow = { channel: RealtimeChannel; listeners: Set<Listener>; leave?: ReturnType<typeof setTimeout> };
const follows = new Map<string, Follow>();

function follow(supabase: SupabaseClient, topic: string, listener: Listener) {
  let entry = follows.get(topic);
  if (!entry) {
    const listeners = new Set<Listener>();
    const notify = (event: string | null) => listeners.forEach((l) => l(event));
    let joins = 0;
    let channel = supabase.channel(topic, { config: { private: true } });
    for (const event of EVENTS) channel = channel.on("broadcast", { event }, () => notify(event));
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && joins++ > 0) notify(null);
    });
    entry = { channel, listeners };
    follows.set(topic, entry);
  }
  clearTimeout(entry.leave);
  entry.listeners.add(listener);

  const followed = entry;
  return () => {
    followed.listeners.delete(listener);
    if (followed.listeners.size > 0) return;
    followed.leave = setTimeout(() => {
      follows.delete(topic);
      supabase.removeChannel(followed.channel);
    }, 2000);
  };
}

let auth: Promise<void> | undefined;

/**
 * Calls `onChange` (once for a burst) when one of these topics hears of one
 * of `events`, and when the app comes back to the foreground, since phones
 * pause pages in the background.
 */
export function useLiveTopics(topics: string[], onChange: () => void, events: string[] = SCREEN_EVENTS) {
  const key = topics.join(" ");
  const eventKey = events.join(" ");
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const leaves: (() => void)[] = [];
    const wanted = new Set(eventKey.split(" "));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // One change is often announced on several topics: react once.
    const changed = (event: string | null = null) => {
      if (event !== null && !wanted.has(event)) return;
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 250);
    };

    // Private topics need the signed-in person's token.
    auth ??= supabase.realtime.setAuth();
    auth.then(() => {
      if (stopped) return;
      for (const topic of key.split(" ")) leaves.push(follow(supabase, topic, changed));
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") changed();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      leaves.forEach((leave) => leave());
    };
  }, [key, eventKey]);
}

/**
 * Keeps a screen current: when one of these topics hears of a change, the
 * screen reloads its data from the server, through the usual access rules.
 * Renders nothing.
 */
export function LiveUpdates({ topics }: { topics: string[] }) {
  const router = useRouter();
  const key = topics.join(" ");
  useLiveTopics(topics, () => router.refresh());

  // Coming back to a screen Next.js kept from earlier (it keeps this
  // component, hidden, while you're elsewhere): it may have missed changes.
  // A screen that has just loaded is already current.
  const shownBefore = useRef(false);
  useEffect(() => {
    if (!key) return;
    const missed = shownBefore.current;
    shownBefore.current = true;
    if (!missed) return;
    const timer = setTimeout(() => router.refresh(), 250);
    return () => clearTimeout(timer);
  }, [key, router]);

  return null;
}
