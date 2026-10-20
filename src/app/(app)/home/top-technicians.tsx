import { Star } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/people/avatar";
import { profilePhotos } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/server";

// The best-rated technicians taking jobs, those in the customer's city first
// (the city of the address they added last; see top_technicians).
export async function TopTechnicians() {
  const supabase = await createClient();
  const { data: address } = await supabase
    .from("addresses")
    .select("city")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: technicians } = await supabase.rpc("top_technicians", {
    near_city: address?.city || undefined,
    max_results: 10,
  });
  if (!technicians?.length) return null;
  const photos = await profilePhotos(
    supabase,
    technicians.map((t) => t.id),
  );

  return (
    <section aria-labelledby="top-technicians" className="mt-6">
      <h2 id="top-technicians" className="px-6 text-lg font-bold text-ink">
        Top technicians
      </h2>
      {address?.city && <p className="px-6 text-sm text-muted">Starting with those in {address.city}</p>}
      <ul className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-2 [scrollbar-width:none]">
        {technicians.map((t) => {
          const name = t.full_name || "PatchUp technician";
          return (
            <li key={t.id} className="w-64 shrink-0 snap-start">
              <Link
                href={`/technicians/${t.id}?back=/home`}
                className="flex h-full items-center gap-3 rounded-card bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <Avatar name={name} photo={photos.get(t.id)} className="size-16 rounded-xl text-2xl" />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink">{name}</span>
                  <span className="block truncate text-xs text-muted">{t.services.join(", ")}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-ink">
                    {t.rating_count > 0 ? (
                      <>
                        <Star aria-hidden className="size-4 fill-brand-yellow text-brand-yellow" />
                        {Number(t.rating_avg).toFixed(1)} (
                        {t.rating_count === 1 ? "1 review" : `${t.rating_count} reviews`})
                      </>
                    ) : (
                      "New on PatchUp"
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
