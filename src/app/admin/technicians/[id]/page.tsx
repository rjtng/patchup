import { Banknote, BriefcaseBusiness, CalendarClock, CalendarX, ChevronRight, Clock, FileText, Mail, MapPin, Phone, Star, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DetailRow } from "@/components/bookings/detail-row";
import { StatusChip } from "@/components/bookings/status-chip";
import { Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDay, formatPeso, formatSchedule } from "@/lib/bookings";
import { DOCUMENT_KINDS, documentLabel, formatSize, withSignedUrls, type DocumentKind } from "@/lib/documents";
import { jobsLabel, owedByTechnician } from "@/lib/payouts";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { hoursSummary, manilaDay, timeOffLabel } from "@/lib/working-hours";
import { ListLink } from "../../list-link";
import { VerificationChip } from "../../verification-chip";
import { VerificationActions } from "./verification-actions";

export const metadata: Metadata = { title: "Technician" };

export default function AdminTechnicianPage({ params }: PageProps<"/admin/technicians/[id]">) {
  return (
    <main className="pb-6">
      <div className="px-6 pt-3">
        <ListLink href="/admin/technicians">All technicians</ListLink>
      </div>
      <Suspense fallback={<CardsSkeleton count={3} />}>
        <TechnicianDetails params={params} />
      </Suspense>
    </main>
  );
}

async function TechnicianDetails({ params }: { params: PageProps<"/admin/technicians/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const [
    { data: rows },
    { data: phone },
    { data: documents },
    { data: jobs },
    { data: paybacks },
    { data: record },
    { data: hours },
    { data: timeOff },
  ] =
    await Promise.all([
    supabase.rpc("admin_technicians", { technician_id: id }),
    supabase.from("phone_numbers").select("phone").eq("user_id", id).maybeSingle(),
    supabase
      .from("technician_documents")
      .select("id, kind, file_name, content_type, size_bytes, uploaded_at, storage_path")
      .eq("technician_id", id)
      .order("uploaded_at"),
    supabase
      .from("bookings")
      .select("id, status, appliance, scheduled_at, service_categories(name)")
      .eq("technician_id", id)
      .order("scheduled_at", { ascending: false })
      .limit(20),
    supabase.rpc("paybacks", { technician: id }),
    supabase.rpc("last_minute_record", { person: id }).single(),
    supabase.from("technician_hours").select("weekday, first_visit, last_visit").eq("technician_id", id),
    supabase.from("technician_time_off").select("starts_on, ends_on").eq("technician_id", id).order("starts_on"),
  ]);
  const t = rows?.[0];
  if (!t) {
    return (
      <EmptyState icon={UserRound} title="Technician not found">
        They may have deleted their account.
      </EmptyState>
    );
  }
  const name = t.full_name || "This technician";
  // First-booking offers PatchUp hasn't paid them back yet.
  const owed = owedByTechnician(paybacks ?? [])[0];

  return (
    <div className="flex flex-col gap-4 px-6 pt-2">
      <section className="rounded-card bg-white p-5 shadow-sm">
        <VerificationChip status={t.verification_status} />
        <h2 className="mt-3 text-xl font-bold text-ink">{t.full_name || "No name yet"}</h2>
        <p className="text-sm text-muted">
          Signed up {formatDay(t.joined_at)}
          {t.verification_status === "approved" && t.verified_at && ` · approved ${formatDay(t.verified_at)}`}
        </p>
        {t.bio && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{t.bio}</p>}
      </section>

      <DocumentList name={name} documents={await withSignedUrls(supabase, documents ?? [])} />

      <VerificationActions technicianId={t.id} name={name} status={t.verification_status} />

      <section aria-label="Details" className="flex flex-col gap-4 rounded-card bg-white p-5 text-sm shadow-sm">
        <DetailRow icon={Mail} label="Email">
          {t.email ? (
            <a href={`mailto:${t.email}`} className="break-all font-semibold text-brand-navy underline">
              {t.email}
            </a>
          ) : (
            "None"
          )}
        </DetailRow>
        <DetailRow icon={Phone} label="Mobile">
          {phone ? (
            <a href={`tel:${phone.phone}`} className="font-semibold text-brand-navy underline">
              {formatPhone(phone.phone)}
            </a>
          ) : (
            "Not given"
          )}
        </DetailRow>
        <DetailRow icon={Wrench} label="Services">
          {t.services.length > 0 ? t.services.join(", ") : "None chosen yet"}
        </DetailRow>
        <DetailRow icon={MapPin} label="Works in">
          {t.city || "Not given yet"}
        </DetailRow>
        <DetailRow icon={Clock} label="Working hours">
          {hoursSummary(hours ?? []) ?? "Not set: any time"}
        </DetailRow>
        <DetailRow icon={CalendarX} label="Time off">
          {(timeOff ?? [])
            // Coming up: read once per request, after the data above.
            // eslint-disable-next-line react-hooks/purity
            .filter((t) => t.ends_on >= manilaDay(Date.now()))
            .map(timeOffLabel)
            .join(", ") || "None coming up"}
        </DetailRow>
        <DetailRow icon={CalendarClock} label="Experience">
          {t.years_experience == null ? "Not given yet" : t.years_experience === 1 ? "1 year" : `${t.years_experience} years`}
        </DetailRow>
        <DetailRow icon={Star} label="Reviews">
          {t.rating_count > 0 ? (
            <span className="flex flex-wrap items-center gap-2">
              <Stars rating={Number(t.rating_avg)} />
              {Number(t.rating_avg).toFixed(1)} · {t.rating_count === 1 ? "1 review" : `${t.rating_count} reviews`}
            </span>
          ) : (
            "None yet"
          )}
        </DetailRow>
        <DetailRow icon={BriefcaseBusiness} label="Jobs done">
          {t.jobs_completed}
          {t.verification_status === "approved" && (
            <span className="block text-muted">{t.is_available ? "Taking new jobs now" : "Not taking new jobs now"}</span>
          )}
        </DetailRow>
        {record && record.give_backs > 0 && (
          <DetailRow icon={CalendarX} label="Last-minute give-backs">
            <span className="font-semibold text-danger">
              {record.give_backs === 1 ? "1 job" : `${record.give_backs} jobs`} in the last 30 days
            </span>
            <span className="block text-muted">Given back less than 2 hours before the visit, or on the way</span>
          </DetailRow>
        )}
        {owed && (
          <DetailRow icon={Banknote} label="PatchUp owes them">
            {formatPeso(owed.amount)} for first-booking offers on {jobsLabel(owed.jobs.length)}
            <Link href="/admin/payouts" className="block w-fit font-semibold text-brand-navy underline">
              Pay it back
            </Link>
          </DetailRow>
        )}
      </section>

      {t.verification_status === "approved" && (
        <Link
          href={`/technicians/${t.id}?back=/admin/technicians/${t.id}`}
          className="text-sm font-semibold text-brand-navy underline"
        >
          See their profile as customers see it
        </Link>
      )}

      <section aria-label="Jobs" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-ink">Jobs</h2>
        {jobs && jobs.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/admin/bookings/${job.id}`}
                  className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">
                      {job.service_categories?.name}: {job.appliance}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{formatSchedule(job.scheduled_at)}</span>
                    <StatusChip status={job.status} className="mt-2" />
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">No jobs yet.</p>
        )}
      </section>
    </div>
  );
}

// What the technician sent to be checked: photos shown, PDFs linked.
function DocumentList({
  name,
  documents,
}: {
  name: string;
  documents: {
    id: string;
    kind: DocumentKind;
    file_name: string;
    content_type: string;
    size_bytes: number;
    uploaded_at: string;
    url: string | null;
  }[];
}) {
  const missing = DOCUMENT_KINDS.filter((k) => k.required && !documents.some((d) => d.kind === k.kind));
  return (
    <section aria-labelledby="documents" className="flex flex-col gap-3">
      <h2 id="documents" className="text-lg font-bold text-ink">
        Documents
      </h2>
      {missing.length > 0 && (
        <p className="rounded-card bg-brand-yellow/40 p-4 text-sm text-ink">
          {documents.length === 0 ? `${name} hasn't sent any documents yet.` : "Not sent yet:"}{" "}
          {missing.map((k) => k.label).join(" and ")}.
        </p>
      )}
      {documents.length > 0 && (
        <ul className="flex flex-col gap-3">
          {documents.map((d) => (
            <li key={d.id} className="rounded-card bg-white p-4 shadow-sm">
              <p className="font-bold text-ink">{documentLabel(d.kind)}</p>
              <p className="truncate text-sm text-muted">
                {d.file_name} · {formatSize(d.size_bytes)} · sent {formatDay(d.uploaded_at)}
              </p>
              {d.url && d.content_type.startsWith("image/") ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="mt-3 block">
                  {/* A private file behind a short-lived link: shown as is, not through Next's image optimizer (which would cache it). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={d.url}
                    alt={`${documentLabel(d.kind)} from ${name}`}
                    loading="lazy"
                    className="max-h-72 w-full rounded-field bg-surface object-contain"
                  />
                </a>
              ) : d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 font-semibold text-brand-navy underline">
                  <FileText aria-hidden className="size-5" />
                  Open the PDF
                </a>
              ) : (
                <p className="mt-2 text-sm text-danger">The file couldn&apos;t be opened. Refresh the page to try again.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
