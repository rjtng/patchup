import { Bell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { LiveUpdates } from "@/components/live-updates";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// The bell in the Home and Jobs headers, with the number of unread
// notifications; it updates as they arrive.
export function NotificationBell() {
  return (
    <Suspense fallback={<BellLink unread={0} />}>
      <UnreadBell />
    </Suspense>
  );
}

async function UnreadBell() {
  if (!supabaseConfig()) return <BellLink unread={0} />; // no accounts without Supabase
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: unread } = await supabase.from("notifications").select("id").is("read_at", null).limit(100);
  return (
    <>
      {auth?.claims.sub && <LiveUpdates topics={[`user:${auth.claims.sub}`]} />}
      <BellLink unread={unread?.length ?? 0} />
    </>
  );
}

function BellLink({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative grid size-12 place-items-center rounded-full bg-white/15 hover:bg-white/25"
    >
      <Bell aria-hidden className="size-6" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
