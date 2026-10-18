import { BriefcaseBusiness, CircleUserRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { PushSettings } from "@/components/notifications/push-settings";
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
      .select("bio, city, years_experience, verification_status, technician_services(category_id)")
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
    <WorkProfileForm
      technicianId={claims.sub}
      name={profile?.full_name ?? ""}
      work={work}
      services={work.technician_services.map((s) => s.category_id)}
      categories={categories ?? []}
    />
  );
}
