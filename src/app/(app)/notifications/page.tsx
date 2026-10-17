import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <main>
      <PageHeader title="Notifications" backHref="/home" />
      <EmptyState icon={Bell} title="You're all caught up">
        Booking updates, technician arrivals and offers will appear here.
      </EmptyState>
    </main>
  );
}
