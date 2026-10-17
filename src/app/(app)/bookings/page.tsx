import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Bookings" };

export default function BookingsPage() {
  return (
    <main>
      <PageHeader title="Bookings" />
      <EmptyState icon={CalendarCheck} title="No bookings yet">
        Your upcoming and past repairs will be listed here.
      </EmptyState>
      <div className="px-6">
        <ButtonLink href="/home">Find a service</ButtonLink>
      </div>
    </main>
  );
}
