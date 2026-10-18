"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { turnOffPush } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

// Signs out on this device only; the person stays signed in elsewhere. This
// device stops getting their phone notifications.
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logOut = async () => {
    setPending(true);
    await turnOffPush().catch(() => undefined);
    await createClient().auth.signOut({ scope: "local" });
    router.replace("/welcome");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={logOut}
      disabled={pending}
      className="flex h-14 w-full items-center gap-3 rounded-card bg-white px-5 font-semibold text-danger shadow-sm hover:bg-danger/5 disabled:opacity-50"
    >
      <LogOut aria-hidden className="size-5" />
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
