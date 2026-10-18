"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// The database announces changes on Realtime topics (see
// supabase/migrations/*_live_updates.sql): "booking_changed", and
// "notification" when someone gets a new one.
const EVENTS = ["booking_changed", "notification"];

// One channel per topic, shared by everything on the page that follows it
// (say, the bell and the list it sits on), and kept for a moment after the
// last follower leaves so moving between pages doesn't rejoin.
type Follow = { channel: RealtimeChannel; listeners: Set<() => void>; leave?: ReturnType<typeof setTimeout> };
const follows = new Map<string, Follow>();

function follow(supabase: SupabaseClient, topic: string, listener: () => void) {
  let entry = follows.get(topic);
  if (!entry) {
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((l) => l());
    let joins = 0;
    let channel = supabase.channel(topic, { config: { private: true } });
    for (const event of EVENTS) channel = channel.on("broadcast", { event }, notify);
    channel.subscribe((status) => {
      // Rejoining after a dropped connection: catch up on anything missed.
      if (status === "SUBSCRIBED" && joins++ > 0) notify();
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

// Topics this browser has followed before: coming back to one (a page Next.js
// kept from earlier) may have missed changes in between.
const followedBefore = new Set<string>();
let auth: Promise<void> | undefined;

/**
 * Keeps a screen current: when one of these topics hears of a change, the
 * screen reloads its data from the server, through the usual access rules.
 * Renders nothing.
 */
export function LiveUpdates({ topics }: { topics: string[] }) {
  const router = useRouter();
  const key = topics.join(" ");

  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const leaves: (() => void)[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // One change is often announced on several topics: reload once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    if (followedBefore.has(key)) refresh();
    followedBefore.add(key);

    // Private topics need the signed-in person's token.
    auth ??= supabase.realtime.setAuth();
    auth.then(() => {
      if (stopped) return;
      for (const topic of key.split(" ")) leaves.push(follow(supabase, topic, refresh));
    });

    // Phones pause pages in the background; catch up when the app is opened again.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      leaves.forEach((leave) => leave());
    };
  }, [key, router]);

  return null;
}
