import { BriefcaseBusiness, ChevronRight, CircleUserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { PushSettings } from "@/components/notifications/push-settings";
import { Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { isTechnician } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { WorkProfileForm } from "./work-profile-form";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <main className="pb-6">
      <PageHeader title="Profile" />
      <Suspense fallback={<CardsSkeleton count={2} />}>
        <ProfileDetails />
      </Suspense>
      <div className="flex flex-col gap-4 px-6 pt-6">
        <PushSettings variant="settings" />
        <LogoutButton />
      </div>
    </main>
  );
}

async function ProfileDetails() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims || !isTechnician(claims)) {
    return (
      <EmptyState icon={CircleUserRound} title="Your profile">
        Your details, saved addresses, booking history and settings will live here.
      </EmptyState>
    );
  }

  const [{ data: profile }, { data: work }, { data: categories }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", claims.sub).maybeSingle(),
    supabase
      .from("technician_profiles")
      .select("bio, city, years_experience, verification_status, rating_avg, rating_count, technician_services(category_id)")
      .eq("id", claims.sub)
      .maybeSingle(),
    supabase.from("service_categories").select("id, name").order("sort_order"),
  ]);
  if (!work) {
    return (
      <EmptyState icon={BriefcaseBusiness} title="This isn't a technician account">
        Your technician details will show here once your account is set up as a technician.
      </EmptyState>
    );
  }

  return (
    <>
      <Link
        href={`/technicians/${claims.sub}?back=/profile`}
        className="mx-6 mt-6 flex items-center gap-4 rounded-card bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Your reviews</span>
          {work.rating_count > 0 ? (
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink">
              <Stars rating={work.rating_avg} />
              {work.rating_avg.toFixed(1)} · {work.rating_count === 1 ? "1 review" : `${work.rating_count} reviews`}
            </span>
          ) : (
            <span className="mt-0.5 block text-sm text-muted">None yet. Customers rate each job once it&apos;s done.</span>
          )}
          <span className="mt-1 block text-sm text-muted">See your profile as customers see it</span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </Link>
      <WorkProfileForm
        technicianId={claims.sub}
        name={profile?.full_name ?? ""}
        work={work}
        services={work.technician_services.map((s) => s.category_id)}
        categories={categories ?? []}
      />
    </>
  );
}
