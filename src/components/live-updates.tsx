"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Topics this browser has followed before: coming back to one (a page Next.js
// kept from earlier) may have missed changes in between.
const followed = new Set<string>();

/**
 * Keeps a screen current. The database announces booking changes on Realtime
 * topics (see supabase/migrations/*_live_updates.sql); when one of these topics
 * hears of a change, the screen reloads its data from the server, through the
 * usual access rules. Renders nothing.
 */
export function LiveUpdates({ topics }: { topics: string[] }) {
  const router = useRouter();
  const key = topics.join(" ");

  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // One change is often announced on several topics: reload once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const returning = followed.has(key);
    followed.add(key);

    // Private topics need the signed-in person's token.
    supabase.realtime.setAuth().then(() => {
      if (stopped) return;
      for (const topic of key.split(" ")) {
        let joins = 0;
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: "booking_changed" }, refresh)
          .subscribe((status) => {
            if (status !== "SUBSCRIBED") return;
            // Rejoining after a dropped connection, or back on a kept page: catch up.
            if (joins++ > 0 || returning) refresh();
          });
        channels.push(channel);
      }
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
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [key, router]);

  return null;
}
