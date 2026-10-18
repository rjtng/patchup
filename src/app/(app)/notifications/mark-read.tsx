"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Seeing the list counts as reading it. The ones that were new stay marked
// until the list next loads, so they're easy to spot this time.
export function MarkRead({ unread }: { unread: string }) {
  useEffect(() => {
    if (unread) createClient().rpc("mark_notifications_read").then(() => undefined);
  }, [unread]);
  return null;
}
