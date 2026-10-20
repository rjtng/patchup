import { BriefcaseBusiness, ChevronRight, MapPin, MapPinCheck, Plus, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { PageHeader } from "@/components/layout/page-header";
import { PushSettings } from "@/components/notifications/push-settings";
import { Stars } from "@/components/reviews/stars";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/admin";
import { withSignedUrls } from "@/lib/documents";
import { formatPeso } from "@/lib/bookings";
import { owedByTechnician } from "@/lib/payouts";
import { isTechnician } from "@/lib/roles";
import { getServiceCategories } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { DetailsForm } from "./details-form";
import { Documents } from "./documents";
import { WorkProfileForm } from "./work-profile-form";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <main className="pb-6">
      <PageHeader title="Profile" />
      <Suspense>
        <AdminLink />
      </Suspense>
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
  if (!claims) return null;
  if (!isTechnician(claims)) return <CustomerProfile userId={claims.sub} email={claims.email ?? ""} />;

  const [{ data: profile }, { data: phone }, { data: documents }, { data: work }, categories, { data: paybacks }] =
    await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", claims.sub).maybeSingle(),
    supabase.from("phone_numbers").select("phone").eq("user_id", claims.sub).maybeSingle(),
    supabase
      .from("technician_documents")
      .select("id, kind, file_name, size_bytes, uploaded_at, storage_path")
      .eq("technician_id", claims.sub)
      .order("uploaded_at"),
    supabase
      .from("technician_profiles")
      .select("bio, city, years_experience, verification_status, rating_avg, rating_count, technician_services(category_id)")
      .eq("id", claims.sub)
      .maybeSingle(),
    getServiceCategories(),
    supabase.rpc("paybacks"),
  ]);
  if (!work) {
    return (
      <EmptyState icon={BriefcaseBusiness} title="This isn't a technician account">
        Your technician details will show here once your account is set up as a technician.
      </EmptyState>
    );
  }

  const documentsSection = (
    <Documents
      technicianId={claims.sub}
      status={work.verification_status}
      documents={await withSignedUrls(supabase, documents ?? [])}
    />
  );
  // First-booking offers PatchUp hasn't paid back yet.
  const owed = owedByTechnician(paybacks ?? [])[0]?.amount ?? 0;
  // Until they're approved, sending documents is the thing to do.
  const documentsFirst = work.verification_status === "pending" || work.verification_status === "rejected";

  return (
    <>
      {documentsFirst && documentsSection}
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
      <Link
        href="/profile/earnings"
        className="mx-6 mt-4 flex items-center gap-4 rounded-card bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Earnings</span>
          <span className="mt-0.5 block text-sm text-muted">
            {owed > 0
              ? `PatchUp owes you ${formatPeso(owed)} for first-booking offers`
              : "Your jobs, cash collected and payments from PatchUp"}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      </Link>
      <WorkProfileForm
        technicianId={claims.sub}
        name={profile?.full_name ?? ""}
        phone={phone?.phone ?? null}
        work={work}
        // Only the services that can be booked: one that's hidden stays theirs, for when it's back.
        services={work.technician_services
          .map((s) => s.category_id)
          .filter((id) => categories.some((c) => c.id === id))}
        categories={categories.map(({ id, name }) => ({ id, name }))}
      />
      {!documentsFirst && documentsSection}
    </>
  );
}

// A customer's details and saved addresses.
async function CustomerProfile({ userId, email }: { userId: string; email: string }) {
  const supabase = await createClient();
  const [{ data: profile }, { data: phone }, { data: addresses, error }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("phone_numbers").select("phone").eq("user_id", userId).maybeSingle(),
    supabase.from("addresses").select("id, label, street, barangay, city, landmark, latitude").order("created_at"),
  ]);

  return (
    <>
      <DetailsForm userId={userId} name={profile?.full_name ?? ""} email={email} phone={phone?.phone ?? null} />
      <section aria-labelledby="addresses" className="flex flex-col gap-3 px-6 pt-8">
        <div>
          <h2 id="addresses" className="text-lg font-bold text-ink">
            Saved addresses
          </h2>
          <p className="mt-1 text-sm text-muted">Pick one when you book.</p>
        </div>
        {error ? (
          <p className="text-sm text-danger">We couldn&apos;t load your addresses. Refresh the page to try again.</p>
        ) : addresses.length === 0 ? (
          <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
            None yet. Add one now, or when you book.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {addresses.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/profile/addresses/${a.id}`}
                  className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{a.label}</span>
                    <span className="block text-sm text-ink">
                      {a.street}, {a.barangay}, {a.city}
                    </span>
                    {a.landmark && <span className="block text-sm text-muted">{a.landmark}</span>}
                    <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                      {a.latitude != null ? (
                        <>
                          <MapPinCheck aria-hidden className="size-4 text-brand-navy" />
                          Pinned on the map
                        </>
                      ) : (
                        <>
                          <MapPin aria-hidden className="size-4" />
                          No map pin
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ButtonLink href="/profile/addresses/new" variant="secondary">
          <Plus aria-hidden className="size-5" />
          Add an address
        </ButtonLink>
      </section>
    </>
  );
}

// For the people who run PatchUp: the way into the admin screens.
async function AdminLink() {
  if (!(await isAdmin(await createClient()))) return null;
  return (
    <Link
      href="/admin"
      className="mx-6 mt-6 flex items-center gap-4 rounded-card bg-brand-navy p-5 text-white shadow-sm hover:bg-brand-navy-dark"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15">
        <ShieldCheck aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Admin</span>
        <span className="block text-sm text-white/85">Approve technicians, assign and cancel bookings</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0" />
    </Link>
  );
}
