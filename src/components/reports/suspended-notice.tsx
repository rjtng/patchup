import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { LEGAL } from "@/lib/legal";
import type { createClient } from "@/lib/supabase/server";

/** The signed-in person's suspension, if PatchUp suspended them (see set_customer_suspended). */
export async function mySuspension(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims.sub;
  if (!me) return null;
  const { data } = await supabase.from("account_suspensions").select("reason").eq("user_id", me).maybeSingle();
  return data;
}

// What a suspended customer sees on Home, and instead of the booking form:
// they can't book new repairs until it's lifted. Their bookings go on.
export function SuspendedNotice({ reason, className }: { reason: string; className?: string }) {
  return (
    <section aria-labelledby="suspended" className={cn("flex gap-3 rounded-card bg-danger/5 p-5 text-sm", className)}>
      <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
      <div>
        <h2 id="suspended" className="font-bold text-ink">
          Your account is suspended
        </h2>
        <p className="mt-1 leading-relaxed text-ink">
          You can&apos;t book new repairs for now.{reason && ` ${reason}`} Bookings you already have go on as planned.
          Write to {LEGAL.email} to sort it out.
        </p>
      </div>
    </section>
  );
}
