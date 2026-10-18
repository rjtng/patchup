import { CircleUserRound } from "lucide-react";
import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <main>
      <PageHeader title="Profile" />
      <EmptyState icon={CircleUserRound} title="Your profile">
        Your details, saved addresses, booking history and settings will live here.
      </EmptyState>
      <div className="px-6">
        <LogoutButton />
      </div>
    </main>
  );
}
