"use client";

import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CancelConfirm, lastMinuteNow, type CancelCheck } from "@/components/bookings/cancel-booking";
import { cn } from "@/lib/cn";

const pill =
  "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold";

// A coming visit's Call (once the technician has given a number), Chat and
// Cancel (which asks first, warning at the last minute).
export function VisitActions({
  bookingId,
  who,
  phone,
  check,
}: {
  bookingId: string;
  who: string;
  phone: string | null;
  check: CancelCheck;
}) {
  const [confirming, setConfirming] = useState<{ lastMinute?: CancelCheck } | null>(null);
  if (confirming) {
    return (
      <CancelConfirm bookingId={bookingId} lastMinute={confirming.lastMinute} onClose={() => setConfirming(null)} />
    );
  }

  return (
    <div className="flex gap-2">
      {phone && (
        <a
          href={`tel:${phone}`}
          aria-label={`Call ${who}`}
          className={cn(pill, "border-brand-navy text-brand-navy hover:bg-surface")}
        >
          <Phone aria-hidden className="size-4" />
          Call
        </a>
      )}
      <Link
        href={`/chat/${bookingId}`}
        aria-label={`Message ${who}`}
        className={cn(pill, "border-brand-navy text-brand-navy hover:bg-surface")}
      >
        <MessageCircle aria-hidden className="size-4" />
        Chat
      </Link>
      <button
        type="button"
        onClick={() => setConfirming({ lastMinute: lastMinuteNow(check) })}
        aria-label="Cancel booking"
        className={cn(pill, "border-danger text-danger hover:bg-danger/5")}
      >
        Cancel
      </button>
    </div>
  );
}
