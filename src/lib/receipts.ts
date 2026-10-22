import { quoteItems } from "@/lib/bookings";
import type { Json } from "@/lib/supabase/database.types";

// Receipts: every job marked done gets a number, in order (see the receipts
// migration), and a page its customer, its technician and admins can print or
// save as a PDF.

/** "PU-000123" */
export const receiptNumber = (number: number) => `PU-${String(number).padStart(6, "0")}`;

export type ReceiptLine = { label: string; amount: number };

/**
 * What a done job's receipt lists: the inspection fee (none on a return
 * visit under warranty) and each approved repair item, then the first-booking
 * offer as it was taken off. Together they come to what was paid
 * (final_amount, as complete_booking worked it out).
 */
export function receiptLines(booking: {
  inspection_fee: number;
  final_amount: number;
  return_of: string | null;
  quotes: { status: string; items: Json; total: number }[];
}) {
  const approved = booking.quotes.filter((q) => q.status === "approved");
  const lines: ReceiptLine[] = [
    {
      label: booking.return_of ? "Inspection fee: none, return visit under warranty" : "Inspection fee",
      amount: booking.inspection_fee,
    },
    ...approved.flatMap((q) => quoteItems(q.items).map((item) => ({ label: item.description, amount: item.amount }))),
  ];
  const before = booking.inspection_fee + approved.reduce((sum, q) => sum + q.total, 0);
  return { lines, offer: Math.max(before - booking.final_amount, 0), total: booking.final_amount };
}
