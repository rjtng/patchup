import { Suspense, type ReactNode } from "react";
import { BottomNav, BottomNavFallback } from "@/components/layout/bottom-nav";

// Layout for the five main tabs: page content plus the bottom navigation.
// Only signed-in people get here: the proxy (src/proxy.ts) sends everyone
// else to Log in.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <Suspense fallback={<BottomNavFallback />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
