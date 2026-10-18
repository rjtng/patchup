import { Suspense, type ReactNode } from "react";
import { BottomNav, BottomNavFallback } from "@/components/layout/bottom-nav";
import { isTechnician } from "@/lib/roles";
import { supabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Layout for the main tabs: page content plus the bottom navigation.
// Only signed-in people get here: the proxy (src/proxy.ts) sends everyone
// else to Log in.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <Suspense fallback={<BottomNavFallback />}>
        <Nav />
      </Suspense>
    </div>
  );
}

// Technicians and customers have different tabs.
async function Nav() {
  if (!supabaseConfig()) return <BottomNav technician={false} />; // no accounts without Supabase
  const { data } = await (await createClient()).auth.getClaims();
  return <BottomNav technician={isTechnician(data?.claims)} userId={data?.claims.sub} />;
}
