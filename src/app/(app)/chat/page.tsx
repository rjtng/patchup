import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <main>
      <PageHeader title="Chat" />
      <EmptyState icon={MessageCircle} title="No conversations yet">
        Messages with your technicians and PatchUp Support will show up here.
      </EmptyState>
    </main>
  );
}
