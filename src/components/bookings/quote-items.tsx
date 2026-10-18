import { formatPeso, type QuoteItem } from "@/lib/bookings";

// A quote's lines and total.
export function QuoteItems({ items, total }: { items: QuoteItem[]; total: number }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between gap-4">
          <dt className="text-ink">{item.description}</dt>
          <dd className="shrink-0 text-ink">{formatPeso(item.amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-line pt-2 font-bold">
        <dt className="text-ink">Repair total</dt>
        <dd className="shrink-0 text-ink">{formatPeso(total)}</dd>
      </div>
    </dl>
  );
}
