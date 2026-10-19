"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

// The customer's review of a finished job (one per booking).
export function RateRepair({ bookingId, technicianName }: { bookingId: string; technicianName: string }) {
  const router = useRouter();
  const headingId = useId();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rating) {
      setError("Choose from 1 to 5 stars.");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("submit_review", { booking_id: bookingId, rating, comment: comment.trim() });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" || error.code === "42501" ? error.message : "That didn't go through. Check your connection and try again.");
      return;
    }
    router.refresh();
  };

  return (
    <form
      onSubmit={submit}
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm"
    >
      <div>
        <h2 id={headingId} className="text-base font-bold text-ink">
          How did it go?
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Rate {technicianName}. Your review shows on their profile with your first name, to help others choose.
        </p>
      </div>
      <fieldset>
        <legend className="sr-only">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer rounded-full p-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-navy"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <Star
                aria-hidden
                className={cn("size-10", n <= rating ? "fill-brand-yellow text-brand-yellow" : "text-line")}
              />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}, {LABELS[n].toLowerCase()}
              </span>
            </label>
          ))}
        </div>
        <p aria-hidden className="mt-1 h-5 text-sm font-semibold text-ink">
          {LABELS[rating]}
        </p>
      </fieldset>
      <TextAreaField
        label="Tell others about it (optional)"
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="On time? Tidy? Fixed for good?"
      />
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send review"}
      </Button>
    </form>
  );
}
