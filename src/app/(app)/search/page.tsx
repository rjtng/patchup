import { Search } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Search" };

// TODO: read the ?q= search term and query services, shops and technicians.
export default function SearchPage() {
  return (
    <main>
      <PageHeader title="Search" backHref="/home" />
      <EmptyState icon={Search} title="Search is coming soon">
        You&apos;ll be able to find services, repair shops and technicians here.
      </EmptyState>
    </main>
  );
}
