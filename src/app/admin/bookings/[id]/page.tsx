import { CalendarCheck, CalendarClock, Flag, Mail, MapPin, Phone, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingPhotos } from "@/components/bookings/booking-photos";
import { ChangeTime } from "@/components/bookings/change-time";
import { DetailRow } from "@/components/bookings/detail-row";
import { ReceiptLink } from "@/components/bookings/receipt-link";
import { QuoteItems } from "@/components/bookings/quote-items";
import { StatusChip } from "@/components/bookings/status-chip";
import { BookingTimeline } from "@/components/bookings/timeline";
import { LiveUpdates } from "@/components/live-updates";
import { Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { BOOKING_FILTERS, lateAt } from "@/lib/admin";
import { PHOTO_BUCKET } from "@/lib/booking-photos";
import {
  amountDue,
  CLASH_WINDOW_MS,
  dueParts,
  formatDateTime,
  formatDay,
  formatPeso,
  formatSchedule,
  fullAddress,
  isFinished,
  mapsLink,
  quoteItems,
  takenAt,
  UNDER_WAY,
} from "@/lib/bookings";
import { withSignedUrls } from "@/lib/documents";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/phone";
import { ADMIN_REASON, type ReportReason } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { ListLink } from "../../list-link";
import { AdminCancel } from "./admin-cancel";
import { AssignTechnician } from "./assign-technician";
import { HideReview } from "./hide-review";
import { RemoveMessage } from "./remove-message";
import { ResolveReport } from "./resolve-report";
import { SuspendCustomer } from "./suspend-customer";

export const metadata: Metadata = { title: "Booking" };

export default function AdminBookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <div className="px-6 pt-3">
              <ListLink href="/admin/bookings">All bookings</ListLink>
            </div>
            <CardsSkeleton count={4} />
          </>
        }
      >
        <BookingDetails params={params} />
      </Suspense>
    </main>
  );
}

const QUOTE_STATUS = { pending: "Waiting for the customer", approved: "Approved", declined: "Declined" };

async function BookingDetails({ params }: { params: PageProps<"/admin/bookings/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, status, customer_id, technician_id, category_id, created_at, appliance, brand, problem, scheduled_at, street, barangay, city, province, landmark, latitude, longitude, inspection_fee, discount, final_amount, cancel_reason, service_categories(name), customer:profiles!bookings_customer_id_fkey(full_name), technician:profiles!bookings_technician_id_fkey(full_name), booking_events(id, event, note, created_at, last_minute), quotes(id, items, total, note, status, created_at), reviews(rating, comment, hidden_at), booking_photos(id, storage_path, created_at), receipts(number), reports(id, reason, details, created_at, resolved_at, resolution, reporter_id, reporter:profiles!reports_reporter_id_fkey(full_name))",
    )
    .eq("id", id)
    .order("id", { referencedTable: "booking_events" })
    .order("created_at", { referencedTable: "quotes" })
    .order("created_at", { referencedTable: "booking_photos" })
    .order("created_at", { referencedTable: "reports" })
    .maybeSingle();
  if (!booking) {
    return (
      <>
        <div className="px-6 pt-3">
          <ListLink href="/admin/bookings">All bookings</ListLink>
        </div>
        <EmptyState icon={CalendarCheck} title="Booking not found" />
      </>
    );
  }

  const people = [booking.customer_id, booking.technician_id].filter((p): p is string => p !== null);
  const [
    { data: emails },
    { data: phones },
    { data: technicians },
    { data: messages },
    { data: suspension },
    { data: record },
  ] = await Promise.all([
    supabase.rpc("admin_emails", { user_ids: people }),
    supabase.from("phone_numbers").select("user_id, phone").in("user_id", people),
    // Who could do it: approved technicians in this service (also for a job whose technician hasn't set off).
    booking.status === "requested" || booking.status === "accepted"
      ? supabase
          .from("technician_profiles")
          .select("id, city, is_available, rating_avg, rating_count, profiles(full_name), technician_services!inner(category_id)")
          .eq("technician_services.category_id", booking.category_id)
          .eq("verification_status", "approved")
      : Promise.resolve({ data: null }),
    // The chat, for looking into a reported problem (and removing what breaks the rules).
    supabase
      .from("messages")
      .select("id, body, created_at, sender_id, removed_at, sender:profiles!messages_sender_id_fkey(full_name)")
      .eq("booking_id", booking.id)
      .order("created_at"),
    supabase.from("account_suspensions").select("reason, suspended_at").eq("user_id", booking.customer_id).maybeSingle(),
    supabase.rpc("last_minute_record", { person: booking.customer_id }).single(),
  ]);
  const emailOf = (userId: string | null) => emails?.find((e) => e.id === userId)?.email ?? null;
  const phoneOf = (userId: string | null) => phones?.find((p) => p.user_id === userId)?.phone ?? null;
  const list = BOOKING_FILTERS.find((f) => (f.statuses as readonly string[]).includes(booking.status))?.value ?? "open";
  const due = amountDue(booking);
  const photos = await withSignedUrls(supabase, booking.booking_photos, PHOTO_BUCKET);
  const movable = booking.status === "requested" || booking.status === "accepted";
  const visit = Date.parse(booking.scheduled_at);
  const [{ data: clashing }, { data: busy }] = await Promise.all([
    // Who could do it but has another job within two hours (they can't be given this one).
    technicians?.length
      ? supabase
          .from("bookings")
          .select("technician_id")
          .in("technician_id", technicians.map((t) => t.id))
          .in("status", UNDER_WAY)
          .neq("id", booking.id)
          .gt("scheduled_at", new Date(visit - CLASH_WINDOW_MS).toISOString())
          .lt("scheduled_at", new Date(visit + CLASH_WINDOW_MS).toISOString())
      : Promise.resolve({ data: [] }),
    // Moving the visit: when its technician is taken besides this visit.
    movable && booking.technician_id
      ? supabase.rpc("busy_times", { technician: booking.technician_id, except_booking: booking.id })
      : Promise.resolve({ data: [] }),
  ]);
  const customerName = booking.customer?.full_name || "The customer";
  const roleOf = (userId: string) => (userId === booking.customer_id ? "customer" : "technician");
  const technicianName = booking.technician?.full_name || null;
  // A technician who hasn't set off by now: read once per request, after the data above.
  const late =
    booking.status === "accepted" &&
    // eslint-disable-next-line react-hooks/purity
    Date.now() >= lateAt(Date.parse(booking.scheduled_at), takenAt(booking));

  return (
    <div className="flex flex-col gap-4 px-6">
      <div className="pt-3">
        <ListLink href={`/admin/bookings?show=${list}`}>All bookings</ListLink>
      </div>
      <LiveUpdates topics={[`booking:${booking.id}`]} />
      <section className="rounded-card bg-white p-5 shadow-sm">
        <StatusChip status={booking.status} />
        <h2 className="mt-3 text-xl font-bold text-ink">
          {booking.service_categories?.name}: {booking.appliance}
        </h2>
        {booking.brand && <p className="text-sm text-muted">{booking.brand}</p>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{booking.problem}</p>
      </section>

      {booking.reports.length > 0 && (
        <section aria-labelledby="reports" className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
          <h2 id="reports" className="flex items-center gap-2 text-base font-bold text-ink">
            <Flag aria-hidden className="size-5 text-danger" />
            Reported problems
          </h2>
          {booking.reports.map((report) => {
            const reporter = report.reporter?.full_name || `The ${roleOf(report.reporter_id)}`;
            return (
              <article
                key={report.id}
                aria-label={`Report from ${reporter}`}
                className="border-t border-line pt-4 text-sm first-of-type:border-t-0 first-of-type:pt-0"
              >
                <p className="font-semibold text-ink">{ADMIN_REASON[report.reason as ReportReason] ?? report.reason}</p>
                <p className="text-muted">
                  {reporter} ({roleOf(report.reporter_id)}), {formatDateTime(report.created_at)}
                </p>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-ink">{report.details}</p>
                {report.resolved_at ? (
                  <p className="mt-3 rounded-field bg-brand-navy/5 px-4 py-3 text-ink">
                    <span className="font-semibold">Resolved {formatDay(report.resolved_at)}: </span>
                    {report.resolution}
                  </p>
                ) : (
                  <ResolveReport reportId={report.id} reporterName={reporter} />
                )}
              </article>
            );
          })}
        </section>
      )}

      <BookingPhotos bookingId={booking.id} photos={photos} editable={false} intro="From the customer." />

      {(booking.status === "requested" || booking.status === "accepted") && technicians && (
        <AssignTechnician
          bookingId={booking.id}
          category={booking.service_categories?.name ?? "this service"}
          askedFor={booking.status === "requested" ? booking.technician_id : null}
          current={
            booking.status === "accepted" && booking.technician_id
              ? {
                  id: booking.technician_id,
                  name: technicianName ?? "The technician",
                  late,
                }
              : null
          }
          technicians={technicians
            .map((t) => ({
              id: t.id,
              name: t.profiles?.full_name || "No name yet",
              city: t.city,
              available: t.is_available,
              rating: Number(t.rating_avg),
              reviews: t.rating_count,
              busy: Boolean(clashing?.some((c) => c.technician_id === t.id)),
            }))
            // Those free then first, then those taking jobs, then the best rated.
            .sort(
              (a, b) =>
                Number(a.busy) - Number(b.busy) || Number(b.available) - Number(a.available) || b.rating - a.rating,
            )}
        />
      )}

      <section aria-label="People" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={UserRound} label="Customer">
          {customerName}
          {suspension && <span className="block font-semibold text-danger">Suspended</span>}
          {record && record.cancellations > 0 && (
            <span className="block text-danger">
              {record.cancellations === 1 ? "1 last-minute cancellation" : `${record.cancellations} last-minute cancellations`}{" "}
              in 30 days
              {record.booking_paused_until && `; can't book until ${formatDateTime(record.booking_paused_until)}`}
            </span>
          )}
          <Email address={emailOf(booking.customer_id)} />
          <PhoneNumber phone={phoneOf(booking.customer_id)} />
        </DetailRow>
        <DetailRow icon={Wrench} label={booking.status === "requested" && booking.technician_id ? "Asked for" : "Technician"}>
          {booking.technician_id ? (
            <>
              <Link href={`/admin/technicians/${booking.technician_id}`} className="font-semibold text-brand-navy underline">
                {technicianName ?? "No name yet"}
              </Link>
              <Email address={emailOf(booking.technician_id)} />
              <PhoneNumber phone={phoneOf(booking.technician_id)} />
            </>
          ) : (
            "Nobody yet"
          )}
        </DetailRow>
      </section>

      <section aria-label="Details" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={CalendarClock} label="Visit">
          {formatSchedule(booking.scheduled_at)}
        </DetailRow>
        <DetailRow icon={MapPin} label="Address">
          {fullAddress(booking)}
          {booking.landmark && <span className="block text-muted">{booking.landmark}</span>}
          <a
            href={mapsLink(booking)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block w-fit font-semibold text-brand-navy underline"
          >
            Open in Maps
          </a>
        </DetailRow>
        <DetailRow
          icon={Wrench}
          label={
            booking.final_amount != null ? "Total paid" : due.repair > 0 || due.discount > 0 ? "To pay" : "Inspection fee"
          }
        >
          {formatPeso(booking.final_amount ?? due.total)}
          <span className="block text-muted">
            {due.repair > 0 || due.discount > 0 ? `${dueParts(due)}, in cash` : "In cash"}
          </span>
          {booking.receipts && <ReceiptLink bookingId={booking.id} number={booking.receipts.number} />}
        </DetailRow>
      </section>

      {booking.quotes.map((quote) => (
        <section key={quote.id} aria-label="Quote" className="rounded-card bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Repair quote</h2>
            <span className="text-xs font-semibold text-muted">{QUOTE_STATUS[quote.status]}</span>
          </div>
          <QuoteItems items={quoteItems(quote.items)} total={quote.total} />
          {quote.note && <p className="mt-3 whitespace-pre-line text-sm text-muted">{quote.note}</p>}
        </section>
      ))}

      {booking.reviews && (
        <section aria-label="Review" className="flex flex-col gap-2 rounded-card bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-ink">The customer&apos;s review</h2>
          <Stars rating={booking.reviews.rating} />
          {booking.reviews.comment && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{booking.reviews.comment}</p>
          )}
          {booking.reviews.hidden_at && (
            <p className="text-sm font-semibold text-danger">
              Hidden since {formatDay(booking.reviews.hidden_at)}: only the customer and admins see it.
            </p>
          )}
          <div className="mt-2">
            <HideReview bookingId={booking.id} hidden={Boolean(booking.reviews.hidden_at)} customerName={customerName} />
          </div>
        </section>
      )}

      {messages && messages.length > 0 && (
        <section aria-label="Chat" className="rounded-card bg-white p-5 shadow-sm">
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-base font-bold text-ink">
              Read the chat ({messages.length === 1 ? "1 message" : `${messages.length} messages`})
            </summary>
            <p className="mt-1 text-sm text-muted">
              Read it when looking into a reported problem. Removing a message replaces it with &ldquo;Removed by
              PatchUp&rdquo; for both sides.
            </p>
            <ol className="mt-3 flex flex-col divide-y divide-line text-sm">
              {messages.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-ink">
                      {m.sender?.full_name || "No name"} ({roleOf(m.sender_id)})
                    </span>
                    <RemoveMessage messageId={m.id} removed={Boolean(m.removed_at)} />
                  </div>
                  <p className="text-xs text-muted">{formatDateTime(m.created_at)}</p>
                  <p className={cn("mt-1 whitespace-pre-line leading-relaxed", m.removed_at ? "italic text-muted" : "text-ink")}>
                    {m.body}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}

      {movable && (
        <ChangeTime
          bookingId={booking.id}
          current={booking.scheduled_at}
          technicianName={technicianName}
          busy={busy ?? []}
          // Read once per request, after the data above, so the times offered start from now.
          // eslint-disable-next-line react-hooks/purity
          now={Date.now()}
          admin
        />
      )}

      <BookingTimeline events={booking.booking_events} />

      <SuspendCustomer customerId={booking.customer_id} name={customerName} suspension={suspension} />

      {!isFinished(booking.status) && <AdminCancel bookingId={booking.id} />}
    </div>
  );
}

function Email({ address }: { address: string | null }) {
  if (!address) return null;
  return (
    <a href={`mailto:${address}`} className="flex w-fit items-center gap-1.5 break-all text-brand-navy underline">
      <Mail aria-hidden className="size-4 shrink-0" />
      {address}
    </a>
  );
}

function PhoneNumber({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a href={`tel:${phone}`} className="flex w-fit items-center gap-1.5 text-brand-navy underline">
      <Phone aria-hidden className="size-4 shrink-0" />
      {formatPhone(phone)}
    </a>
  );
}
