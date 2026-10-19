import { BriefcaseBusiness, CalendarClock, ChevronRight, Mail, MapPin, Star, UserRound, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DetailRow } from "@/components/bookings/detail-row";
import { StatusChip } from "@/components/bookings/status-chip";
import { Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDay, formatSchedule } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";
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
  const [{ data: rows }, { data: jobs }] = await Promise.all([
    supabase.rpc("admin_technicians", { technician_id: id }),
    supabase
      .from("bookings")
      .select("id, status, appliance, scheduled_at, service_categories(name)")
      .eq("technician_id", id)
      .order("scheduled_at", { ascending: false })
      .limit(20),
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
        <DetailRow icon={Wrench} label="Services">
          {t.services.length > 0 ? t.services.join(", ") : "None chosen yet"}
        </DetailRow>
        <DetailRow icon={MapPin} label="Works in">
          {t.city || "Not given yet"}
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
