import { CalendarCheck, MapPin, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/people/avatar";
import { ReviewItem, Stars } from "@/components/reviews/stars";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatDay } from "@/lib/bookings";
import { firstName } from "@/lib/chat";
import { profilePhotos } from "@/lib/profile-photos";
import { isTechnician } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technician" };

// Where the back arrow goes: the screen that linked here, if it's one of ours.
function backHref(back: string | string[] | undefined) {
  if (typeof back !== "string") return "/home";
  if (/^\/(home|services|bookings|jobs|profile|admin|track)(\/[\w-]+)*$/.test(back)) return back;
  // Back to a search, with what was searched for.
  if (/^\/search(\?q=[^#]*)?$/.test(back)) return back;
  return "/home";
}

export default function TechnicianPage({ params, searchParams }: PageProps<"/technicians/[id]">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <PageHeader title="Technician" backHref="/home" />
            <CardsSkeleton count={3} />
          </>
        }
      >
        <TechnicianProfile params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// What customers see about a technician before and after booking them: who
// they are, what they fix, and their reviews.
async function TechnicianProfile({
  params,
  searchParams,
}: {
  params: PageProps<"/technicians/[id]">["params"];
  searchParams: PageProps<"/technicians/[id]">["searchParams"];
}) {
  const [{ id }, { back }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: auth }, { data: technician }, { data: reviews }, photos] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from("technician_profiles")
      .select(
        "id, bio, city, years_experience, rating_avg, rating_count, is_available, profiles(full_name), technician_services(service_categories(name, slug, is_active, sort_order))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("reviews")
      .select("booking_id, rating, comment, customer_name, created_at")
      .eq("technician_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    profilePhotos(supabase, [id]),
  ]);
  const backTo = backHref(back);

  if (!technician) {
    return (
      <>
        <PageHeader title="Technician" backHref={backTo} />
        <EmptyState icon={UserRound} title="This technician isn't listed">
          They may not be taking bookings on PatchUp right now.
        </EmptyState>
      </>
    );
  }

  const name = technician.profiles?.full_name || "PatchUp technician";
  const me = auth?.claims.sub;
  const isSelf = me === technician.id;
  // Customers can book them from here, for any service they offer.
  const canBook = !isSelf && !isTechnician(auth?.claims) && technician.is_available;
  const services = technician.technician_services
    .flatMap((s) => (s.service_categories?.is_active ? [s.service_categories] : []))
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <PageHeader title={name} backHref={backTo} />
      <div className="flex flex-col gap-4 px-6 pt-6">
        {isSelf && (
          <p className="rounded-card bg-brand-navy/5 p-4 text-sm text-brand-navy">
            This is how customers see your profile. Edit it on{" "}
            <Link href="/profile" className="font-semibold underline">
              Profile
            </Link>
            .
          </p>
        )}

        <section aria-label="About" className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <Avatar name={name} photo={photos.get(technician.id)} className="size-16 text-2xl" />
            <div className="min-w-0">
              {technician.rating_count > 0 ? (
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <Stars rating={technician.rating_avg} />
                  <span>
                    <span className="font-bold">{technician.rating_avg.toFixed(1)}</span> ·{" "}
                    {technician.rating_count === 1 ? "1 review" : `${technician.rating_count} reviews`}
                  </span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-ink">New on PatchUp</p>
              )}
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
                {technician.years_experience != null && <span>{technician.years_experience} yrs experience</span>}
                {technician.city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="size-4" />
                    {technician.city}
                  </span>
                )}
              </p>
            </div>
          </div>
          {technician.bio && <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{technician.bio}</p>}
          {services.length > 0 && (
            <ul aria-label="Services" className="flex flex-wrap gap-2">
              {services.map((s) => (
                <li key={s.slug} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink">
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canBook && services.length > 0 && (
          <section aria-label="Book" className="flex flex-col gap-2">
            {services.map((s) => (
              <Link
                key={s.slug}
                href={`/services/${s.slug}/book?technician=${technician.id}`}
                className="flex items-center gap-3 rounded-card bg-brand-navy p-4 font-semibold text-white shadow-sm hover:bg-brand-navy-dark"
              >
                <CalendarCheck aria-hidden className="size-5 shrink-0" />
                Book {firstName(name)} for {s.name.toLowerCase()}
              </Link>
            ))}
          </section>
        )}
        {!isSelf && !technician.is_available && (
          <p className="rounded-card bg-white p-4 text-sm text-muted shadow-sm">
            {firstName(name)} isn&apos;t taking new bookings right now.
          </p>
        )}

        <section aria-labelledby="reviews" className="flex flex-col gap-3">
          <h2 id="reviews" className="mt-2 text-lg font-bold text-ink">
            Reviews
          </h2>
          {!reviews || reviews.length === 0 ? (
            <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">No reviews yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reviews.map((r) => (
                <li key={r.booking_id} className="rounded-card bg-white p-5 shadow-sm">
                  <ReviewItem
                    rating={r.rating}
                    comment={r.comment}
                    by={r.customer_name || "PatchUp customer"}
                    date={formatDay(r.created_at)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
