import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** A rating as five stars, filled up to the nearest whole star; read out as "4.5 out of 5 stars". */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("size-4", n <= filled ? "fill-brand-yellow text-brand-yellow" : "fill-line text-line")}
        />
      ))}
      <span className="sr-only">
        {Number.isInteger(rating) ? rating : rating.toFixed(1)} out of 5 stars
      </span>
    </span>
  );
}

/** One review: stars, what they said, who and when. */
export function ReviewItem({
  rating,
  comment,
  by,
  date,
}: {
  rating: number;
  comment: string;
  by: string;
  date: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Stars rating={rating} />
      {comment && <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{comment}</p>}
      <p className="text-xs text-muted">
        {by} · {date}
      </p>
    </div>
  );
}
