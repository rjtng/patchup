import { CircleUserRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
        {/* TODO: sign out with Supabase Auth before redirecting. */}
        <Link
          href="/welcome"
          className="flex h-14 items-center gap-3 rounded-card bg-white px-5 font-semibold text-danger shadow-sm hover:bg-danger/5"
        >
          <LogOut aria-hidden className="size-5" />
          Log out
        </Link>
      </div>
    </main>
  );
}
