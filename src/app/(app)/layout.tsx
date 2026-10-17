import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";

// Layout for the five main tabs: page content plus the bottom navigation.
// TODO: once auth is wired up, redirect signed-out visitors to /login here.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <BottomNav />
    </div>
  );
}
