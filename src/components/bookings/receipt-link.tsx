import Link from "next/link";
import { receiptNumber } from "@/lib/receipts";

// Under a done job's total: its receipt (see /receipts/[id]).
export function ReceiptLink({ bookingId, number }: { bookingId: string; number: number }) {
  return (
    <Link href={`/receipts/${bookingId}`} className="mt-1 block w-fit font-semibold text-brand-navy underline">
      Receipt {receiptNumber(number)}
    </Link>
  );
}
