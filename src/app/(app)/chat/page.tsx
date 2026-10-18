import { ChevronRight, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatLastMessage } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { isTechnician } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Chat" />
      <Suspense fallback={<CardsSkeleton />}>
        <Conversations />
      </Suspense>
    </main>
  );
}

// One conversation per booking: the customer and the technician doing it.
async function Conversations() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims.sub ?? "";
  const { data: chats, error } = await supabase.rpc("chat_conversations");
  const live = <LiveUpdates topics={[`user:${me}`]} />;

  if (error) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load your chats. Refresh the page to try again.</p>;
  }
  if (chats.length === 0) {
    return (
      <>
        {live}
        <EmptyState icon={MessageCircle} title="No conversations yet">
          {isTechnician(auth?.claims)
            ? "Once you take a job, you can message the customer here."
            : "Once a technician takes your booking, you can message them here."}
        </EmptyState>
      </>
    );
  }

  // Read once per request, after the data above, for "today or not".
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="px-6 pt-6">
      {live}
      <ul className="flex flex-col gap-3">
        {chats.map((c) => (
          <li key={c.booking_id}>
            <Link
              href={`/chat/${c.booking_id}`}
              className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-lg font-bold text-brand-navy"
              >
                {c.other_name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-bold text-ink">{c.other_name}</span>
                  {c.last_at && <span className="shrink-0 text-xs text-muted">{formatLastMessage(c.last_at, now)}</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {c.category}: {c.appliance}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span
                    className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "font-semibold text-ink" : "text-muted")}
                  >
                    {c.last_body ? `${c.last_from_me ? "You: " : ""}${c.last_body}` : "No messages yet. Say hello!"}
                  </span>
                  {c.unread > 0 && (
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-brand-yellow px-1.5 text-xs font-bold text-ink">
                      {c.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
