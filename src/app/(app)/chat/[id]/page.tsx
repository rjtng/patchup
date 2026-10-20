import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { firstName } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";
import { ChatThread } from "./chat-thread";

export const metadata: Metadata = { title: "Chat" };

export default function ChatThreadPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense
        fallback={
          <>
            <PageHeader title="Chat" backHref="/chat" />
            <CardsSkeleton count={3} />
          </>
        }
      >
        <Conversation params={params} />
      </Suspense>
    </main>
  );
}

async function Conversation({ params }: { params: PageProps<"/chat/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims.sub ?? "";
  const [{ data: booking }, { data: newest }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, status, customer_id, technician_id, appliance, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), technician:profiles!bookings_technician_id_fkey(full_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, body, created_at, sender_id, removed_at")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const isCustomer = Boolean(booking) && booking?.customer_id === me;
  const isTechnician = Boolean(booking) && booking?.technician_id === me;
  if (!booking || (!isCustomer && !isTechnician)) {
    return (
      <>
        <PageHeader title="Chat" backHref="/chat" />
        <EmptyState icon={MessageCircle} title="This chat isn't available">
          It may be for a job that&apos;s no longer yours.{" "}
          <Link href="/chat" className="font-semibold text-brand-navy underline">
            Back to Chat
          </Link>
        </EmptyState>
      </>
    );
  }

  const name = (isCustomer ? booking.technician?.full_name : booking.customer?.full_name) || null;
  const otherName = name ?? (isCustomer ? "Your technician" : "PatchUp customer");
  const closed =
    booking.status === "cancelled"
      ? "This booking was cancelled, so the chat is closed."
      : !booking.technician_id
        ? "You can message your technician once one takes your booking."
        : null;

  return (
    <>
      <LiveUpdates topics={[`booking:${booking.id}`]} />
      <PageHeader title={otherName} backHref="/chat">
        <Link
          href={isCustomer ? `/bookings/${booking.id}` : `/jobs/${booking.id}`}
          className="text-sm font-semibold text-white/90 underline underline-offset-2"
        >
          {booking.service_categories?.name}: {booking.appliance}
        </Link>
      </PageHeader>
      <ChatThread
        bookingId={booking.id}
        me={me}
        // Anyone else in the chat (a technician who gave the job back) is labelled as such.
        otherId={isCustomer ? booking.technician_id : booking.customer_id}
        otherFirstName={name ? firstName(name) : isCustomer ? "your technician" : "the customer"}
        messages={(newest ?? []).slice().reverse()}
        closed={closed}
      />
    </>
  );
}
