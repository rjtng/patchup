import { ChevronRight, Star, Wrench, Zap } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPeso } from "@/lib/bookings";
import { createClient } from "@/lib/supabase/server";

// Who can take a job in this category: any available technician (an open
// request), or one the customer picks.
export async function TechnicianChoices({ slug }: { slug: string }) {
  const supabase = await createClient();
  const { data: category } = await supabase
    .from("service_categories")
    .select("id, name, inspection_fee")
    .eq("slug", slug)
    .maybeSingle();

  if (!category) {
    return (
      <EmptyState icon={Wrench} title="Coming soon">
        You&apos;ll be able to book this service soon.
      </EmptyState>
    );
  }

  const { data: technicians, error } = await supabase
    .from("technician_profiles")
    .select("id, bio, city, years_experience, rating_avg, rating_count, profiles(full_name), technician_services!inner(category_id)")
    .eq("technician_services.category_id", category.id)
    .eq("verification_status", "approved")
    .eq("is_available", true)
    .order("rating_avg", { ascending: false });

  const service = category.name.toLowerCase();

  return (
    <section className="flex flex-col gap-4 px-6 pt-6">
      <p className="text-sm leading-relaxed text-muted">
        <span className="font-semibold text-ink">{formatPeso(category.inspection_fee)} inspection fee</span>, paid
        in cash after the visit. The technician checks the problem and tells you the price of the repair
        before starting.
      </p>

      <Link
        href={`/services/${slug}/book`}
        className="flex items-center gap-4 rounded-card bg-brand-navy p-5 text-white shadow-sm hover:bg-brand-navy-dark"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15">
          <Zap aria-hidden className="size-6" />
        </span>
        <span className="flex-1">
          <span className="block font-bold">First available technician</span>
          <span className="block text-sm text-white/85">
            Your request goes to every available {service} technician.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-6 shrink-0" />
      </Link>

      <h2 className="mt-2 text-lg font-bold text-ink">Or choose a technician</h2>
      {error ? (
        <p className="text-sm text-danger">We couldn&apos;t load the technicians. Refresh the page to try again.</p>
      ) : technicians.length === 0 ? (
        <p className="rounded-card bg-white p-5 text-sm leading-relaxed text-muted shadow-sm">
          No {service} technicians are listed yet. Book the first available technician above and
          we&apos;ll match you with one.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {technicians.map((t) => {
            const name = t.profiles?.full_name || "PatchUp technician";
            return (
              <li key={t.id}>
                <Link
                  href={`/services/${slug}/book?technician=${t.id}`}
                  className="flex gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-lg font-bold text-brand-navy"
                  >
                    {name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                      {t.rating_count > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Star aria-hidden className="size-4 fill-brand-yellow text-brand-yellow" />
                          {t.rating_avg.toFixed(1)} ({t.rating_count})
                        </span>
                      ) : (
                        <span>New on PatchUp</span>
                      )}
                      {t.years_experience != null && <span>{t.years_experience} yrs experience</span>}
                      {t.city && <span>{t.city}</span>}
                    </span>
                    {t.bio && <span className="mt-1 line-clamp-2 block text-sm text-ink">{t.bio}</span>}
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 self-center text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
