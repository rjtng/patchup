import { BriefcaseBusiness, Clock, ShieldAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LiveUpdates } from "@/components/live-updates";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PushSettings } from "@/components/notifications/push-settings";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { isFinished } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityToggle } from "./availability-toggle";
import { JobCard, type Job } from "./job-card";
import { RefreshButton } from "@/components/ui/refresh-button";

export const metadata: Metadata = { title: "Jobs" };

// The technician's start screen: new requests to take, and their own jobs.
export default function JobsPage() {
  return (
    <main className="pb-6">
      <PageHeader
        title="Jobs"
        actions={
          <div className="flex gap-2">
            <NotificationBell />
            <RefreshButton />
          </div>
        }
      />
      <Suspense fallback={<CardsSkeleton />}>
        <JobBoard />
      </Suspense>
    </main>
  );
}

async function JobBoard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const me = auth?.claims.sub ?? "";
  const [{ data: profile, error: profileError }, { data: jobs, error }] = await Promise.all([
    supabase
      .from("technician_profiles")
      .select("verification_status, is_available, technician_services(category_id)")
      .eq("id", me)
      .maybeSingle(),
    // The access rules return this technician's own jobs plus the open
    // requests they could take (while they're taking jobs).
    supabase
      .from("bookings")
      .select("id, status, technician_id, category_id, appliance, scheduled_at, barangay, city, service_categories(name)")
      .order("scheduled_at"),
  ]);

  if (error || profileError) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t load your jobs. Refresh the page to try again.</p>;
  }
  if (!profile) {
    return (
      <EmptyState icon={BriefcaseBusiness} title="This isn't a technician account">
        Jobs are for PatchUp technicians. <Link href="/home" className="font-semibold text-brand-navy underline">Go to Home</Link>
      </EmptyState>
    );
  }

  const approved = profile.verification_status === "approved";
  const services = profile.technician_services.map((s) => s.category_id);
  const requests = jobs
    // Requests for them, and open ones they could take. (An admin's account
    // can read every booking, so this keeps to what a technician would see.)
    .filter(
      (j) =>
        j.status === "requested" &&
        (j.technician_id === me ||
          (j.technician_id === null && approved && profile.is_available && services.includes(j.category_id))),
    )
    // Jobs a customer asked this technician for come first.
    .sort((a, b) => Number(b.technician_id === me) - Number(a.technician_id === me));
  const active = jobs.filter((j) => j.technician_id === me && j.status !== "requested" && !isFinished(j.status));
  const done = jobs.filter((j) => j.technician_id === me && isFinished(j.status)).reverse();

  // Their own jobs, and new requests in their services while they're taking jobs.
  const topics = [
    `user:${me}`,
    ...(approved && profile.is_available ? services.map((id) => `requests:${id}`) : []),
  ];

  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <LiveUpdates topics={topics} />
      {profile.verification_status === "pending" && (
        <Notice icon={Clock} title="We're checking your account">
          You&apos;ll start getting requests once PatchUp approves it. Meanwhile, set up your{" "}
          <Link href="/profile" className="font-semibold text-brand-navy underline">work profile</Link>.
        </Notice>
      )}
      {(profile.verification_status === "rejected" || profile.verification_status === "suspended") && (
        <Notice icon={ShieldAlert} title="Your technician account isn't active">
          You can&apos;t take new jobs right now. Contact PatchUp support to find out why.
        </Notice>
      )}
      {approved && profile.technician_services.length === 0 && (
        <Notice icon={Wrench} title="Choose your services">
          Pick the services you offer in your{" "}
          <Link href="/profile" className="font-semibold text-brand-navy underline">work profile</Link> to start
          getting requests.
        </Notice>
      )}
      {approved && <AvailabilityToggle technicianId={me} available={profile.is_available} />}
      {approved && (
        <PushSettings variant="prompt">Get new requests on this phone, even when PatchUp is closed.</PushSettings>
      )}

      <JobSection title="New requests" jobs={requests} me={me}>
        {approved && profile.is_available
          ? "No new requests right now. Requests for your services show up here."
          : "Requests show up here while you're taking new jobs."}
      </JobSection>
      <JobSection title="Your jobs" jobs={active} me={me}>
        Jobs you accept show up here.
      </JobSection>
      {done.length > 0 && <JobSection title="Done" jobs={done} me={me} />}
    </div>
  );
}

function JobSection({
  title,
  jobs,
  me,
  children,
}: {
  title: string;
  jobs: Job[];
  me: string;
  children?: ReactNode; // shown when there are none
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {jobs.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} me={me} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">{children}</p>
      )}
    </section>
  );
}

function Notice({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3 rounded-card bg-brand-yellow/40 p-5 text-sm">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-navy" />
      <div>
        <h2 className="font-bold text-ink">{title}</h2>
        <p className="mt-1 leading-relaxed text-ink">{children}</p>
      </div>
    </section>
  );
}
