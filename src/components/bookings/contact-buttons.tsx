import { MessageCircle, Phone } from "lucide-react";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { firstName } from "@/lib/chat";

/**
 * Message the other side of a booking, and call them too while the job is
 * under way and they've given a mobile number (`phone`, which the access
 * rules only return then).
 */
export function ContactButtons({
  bookingId,
  name,
  phone,
  fallback,
}: {
  bookingId: string;
  name: string | null;
  phone: string | null;
  fallback: string; // "the customer", "your technician"
}) {
  const who = name ? firstName(name) : null;
  if (!phone) {
    return (
      <ButtonLink href={`/chat/${bookingId}`} variant="secondary">
        <MessageCircle aria-hidden className="size-5" />
        Message {who ?? fallback}
      </ButtonLink>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ButtonLink href={`/chat/${bookingId}`} variant="secondary">
        <MessageCircle aria-hidden className="size-5" />
        Message {who ?? fallback}
      </ButtonLink>
      <a href={`tel:${phone}`} className={buttonClasses("secondary")}>
        <Phone aria-hidden className="size-5" />
        Call {who ?? fallback}
      </a>
    </div>
  );
}
