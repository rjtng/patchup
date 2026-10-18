"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/text-field";
import { formatPeso } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/client";

type Row = { key: number; description: string; amount: string };
type RowErrors = { description?: string; amount?: string };

const MAX_ITEMS = 30; // send_quote's limit
const MAX_AMOUNT = 1_000_000;

/** "1,250.50" -> 1250.5; null if it isn't a price. */
function parseAmount(text: string) {
  const cleaned = text.replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  return amount <= MAX_AMOUNT ? amount : null;
}

// After diagnosing: the price of the repair, item by item, for the customer to approve.
export function QuoteForm({ jobId, inspectionFee }: { jobId: string; inspectionFee: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([{ key: 0, description: "", amount: "" }]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const update = (key: number, change: Partial<Row>) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...change } : row)));
  const total = rows.reduce((sum, row) => sum + (parseAmount(row.amount) ?? 0), 0);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Record<number, RowErrors> = {};
    for (const row of rows) {
      const rowErrors: RowErrors = {};
      if (!row.description.trim()) rowErrors.description = "Say what you'll do.";
      if (parseAmount(row.amount) === null) rowErrors.amount = "Enter a price, e.g. 850.";
      if (rowErrors.description || rowErrors.amount) next[row.key] = rowErrors;
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const { error } = await createClient().rpc("send_quote", {
      booking_id: jobId,
      items: rows.map((row) => ({ description: row.description.trim(), amount: parseAmount(row.amount) ?? 0 })),
      note: note.trim(),
    });
    setPending(false);
    if (error) {
      setFormError(error.code === "P0001" || error.code === "42501" ? error.message : "We couldn't send it. Check your connection and try again.");
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="quote" className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
      <div>
        <h2 id="quote" className="text-base font-bold text-ink">
          Quote the repair
        </h2>
        <p className="mt-1 text-sm text-muted">The customer approves it before you start.</p>
      </div>

      {rows.map((row, i) => (
        <fieldset key={row.key} className="flex min-w-0 flex-col gap-3 border-t border-line pt-4 first-of-type:border-t-0 first-of-type:pt-0">
          <legend className="sr-only">Item {i + 1}</legend>
          <div className="flex items-end gap-2">
            <TextField
              label={`Item ${i + 1}`}
              placeholder="e.g. Replace the faucet cartridge"
              value={row.description}
              onChange={(e) => update(row.key, { description: e.target.value })}
              maxLength={200}
              error={errors[row.key]?.description}
              className="flex-1"
            />
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                className="mb-1 grid size-12 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger"
              >
                <X aria-hidden className="size-5" />
              </button>
            )}
          </div>
          <TextField
            label={`Price of item ${i + 1} (₱)`}
            placeholder="e.g. 850"
            inputMode="decimal"
            value={row.amount}
            onChange={(e) => update(row.key, { amount: e.target.value })}
            error={errors[row.key]?.amount}
          />
        </fieldset>
      ))}

      {rows.length < MAX_ITEMS && (
        <Button
          variant="ghost"
          onClick={() =>
            setRows((list) => [...list, { key: Math.max(...list.map((r) => r.key)) + 1, description: "", amount: "" }])
          }
        >
          <Plus aria-hidden className="size-5" />
          Add item
        </Button>
      )}

      <TextAreaField
        label="Note for the customer (optional)"
        placeholder="e.g. Parts are original Samsung; 30-day warranty on the work."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={3}
      />

      <dl className="flex flex-col gap-1 rounded-field bg-surface p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Repair</dt>
          <dd className="text-ink">{formatPeso(total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Inspection fee</dt>
          <dd className="text-ink">{formatPeso(inspectionFee)}</dd>
        </div>
        <div className="flex justify-between gap-4 font-bold">
          <dt className="text-ink">Customer pays</dt>
          <dd className="text-ink">{formatPeso(total + inspectionFee)}</dd>
        </div>
      </dl>

      {formError && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send quote"}
      </Button>
    </form>
  );
}
