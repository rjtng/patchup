import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Track" };

export default function TrackPage() {
  return (
    <main>
      <PageHeader title="Track" />
      <EmptyState icon={MapPin} title="Nothing to track right now">
        When a technician is on the way, you&apos;ll see their status, ETA and location here.
      </EmptyState>
    </main>
  );
}
