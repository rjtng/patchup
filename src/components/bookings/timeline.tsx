import { EVENT_LABELS, formatSchedule, LAST_MINUTE_LABELS } from "@/lib/bookings";

type BookingEvent = { id: number; event: string; note: string | null; created_at: string; last_minute?: boolean };

// A booking's steps so far, oldest first.
export function BookingTimeline({ events }: { events: BookingEvent[] }) {
  return (
    <section aria-labelledby="timeline" className="rounded-card bg-white p-5 shadow-sm">
      <h2 id="timeline" className="text-base font-bold text-ink">
        Timeline
      </h2>
      <ol className="mt-3 flex flex-col gap-3 border-l-2 border-line pl-4">
        {events.map((e) => (
          <li key={e.id} className="relative text-sm">
            <span aria-hidden className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-brand-navy" />
            <span className="block font-semibold text-ink">
              {(e.last_minute && LAST_MINUTE_LABELS[e.event]) || EVENT_LABELS[e.event] || e.event}
            </span>
            <span className="block text-muted">{formatSchedule(e.created_at)}</span>
            {e.note && <span className="block text-ink">{e.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
