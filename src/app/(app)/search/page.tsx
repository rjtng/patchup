import { ChevronRight, SearchX, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/people/avatar";
import { ServiceIcon } from "@/components/services/service-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { profilePhotos } from "@/lib/profile-photos";
import { parseSearch, SEARCH_IDEAS } from "@/lib/search";
import { getServiceCategories } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { SearchBox } from "./search-box";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="pb-6">
      <Suspense
        fallback={
          <>
            <Header query="" />
            <CardsSkeleton count={3} />
          </>
        }
      >
        <Search searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Header({ query }: { query: string }) {
  return (
    <PageHeader title="Search" backHref="/home">
      <SearchBox query={query} />
    </PageHeader>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  return (
    <>
      <Header query={query} />
      {query ? (
        <Suspense key={query} fallback={<CardsSkeleton count={3} />}>
          <Results query={query} />
        </Suspense>
      ) : (
        <Ideas />
      )}
    </>
  );
}

// Services the search is about, and the approved technicians it finds.
async function Results({ query }: { query: string }) {
  const categories = await getServiceCategories();
  const { services: slugs, terms } = parseSearch(query, categories);
  const services = categories.filter((c) => slugs.includes(c.slug));
  const supabase = await createClient();
  const { data: technicians, error } =
    slugs.length > 0 || terms.length > 0
      ? await supabase.rpc("search_technicians", { terms, service_slugs: slugs, max_results: 30 })
      : { data: [], error: null };
  const photos = await profilePhotos(supabase, (technicians ?? []).map((t) => t.id));
  const back = encodeURIComponent(`/search?q=${encodeURIComponent(query)}`);

  if (error) {
    return <p className="px-6 pt-6 text-sm text-danger">We couldn&apos;t search right now. Check your connection and try again.</p>;
  }
  if (services.length === 0 && technicians.length === 0) {
    return (
      <>
        <p role="status" className="sr-only">
          Nothing found
        </p>
        <EmptyState icon={SearchX} title={`Nothing found for “${query}”`}>
          Try a service (plumbing, aircon, electrician…), a technician&apos;s name, or a city.
        </EmptyState>
        <Ideas />
      </>
    );
  }

  const found = [
    services.length > 0 && `${services.length} ${services.length === 1 ? "service" : "services"}`,
    `${technicians.length} ${technicians.length === 1 ? "technician" : "technicians"}`,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <p role="status" className="sr-only">
        Found {found}
      </p>
      {services.length > 0 && (
        <section aria-labelledby="found-services" className="flex flex-col gap-3">
          <h2 id="found-services" className="text-lg font-bold text-ink">
            Services
          </h2>
          <ul className="flex flex-col gap-3">
            {services.map(({ slug, name, icon }) => (
              <li key={slug}>
                <Link
                  href={`/services/${slug}`}
                  className="flex items-center gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-navy/10 text-brand-navy">
                    <ServiceIcon name={icon} className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{name}</span>
                    <span className="block text-sm text-muted">Book the first available technician, or choose one</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="found-technicians" className="flex flex-col gap-3">
        <h2 id="found-technicians" className="text-lg font-bold text-ink">
          Technicians
        </h2>
        {technicians.length === 0 ? (
          <p className="rounded-card bg-white p-5 text-sm text-muted shadow-sm">
            No technicians match that. Book the service above, and the first available technician takes it.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {technicians.map((t) => {
              const name = t.full_name || "PatchUp technician";
              return (
                <li key={t.id}>
                  <Link
                    href={`/technicians/${t.id}?back=${back}`}
                    className="flex gap-4 rounded-card bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <Avatar name={name} photo={photos.get(t.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                        {t.rating_count > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Star aria-hidden className="size-4 fill-brand-yellow text-brand-yellow" />
                            {Number(t.rating_avg).toFixed(1)} ({t.rating_count})
                          </span>
                        ) : (
                          <span>New on PatchUp</span>
                        )}
                        {t.city && <span>{t.city}</span>}
                      </span>
                      {t.services.length > 0 && <span className="block truncate text-sm text-ink">{t.services.join(", ")}</span>}
                      <span
                        className={cn(
                          "mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                          t.is_available ? "bg-brand-navy/10 text-brand-navy" : "bg-surface text-muted",
                        )}
                      >
                        {t.is_available ? "Taking jobs" : "Not taking jobs right now"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 self-center text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// Before anything is typed (or when nothing matches): searches to try, and the services.
async function Ideas() {
  const services = await getServiceCategories();
  return (
    <div className="flex flex-col gap-6 px-6 pt-6">
      <section aria-labelledby="ideas" className="flex flex-col gap-3">
        <h2 id="ideas" className="text-lg font-bold text-ink">
          Try
        </h2>
        <ul className="flex flex-wrap gap-2">
          {SEARCH_IDEAS.map((idea) => (
            <li key={idea}>
              <Link
                href={`/search?q=${encodeURIComponent(idea)}`}
                className="inline-flex h-10 items-center rounded-full border-2 border-line bg-white px-4 text-sm font-semibold text-ink hover:border-brand-navy"
              >
                {idea}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="all-services" className="flex flex-col gap-3">
        <h2 id="all-services" className="text-lg font-bold text-ink">
          All services
        </h2>
        <ul className="grid grid-cols-4 gap-3">
          {services.map(({ slug, name, icon }) => (
            <li key={slug}>
              <Link
                href={`/services/${slug}`}
                className="flex h-full flex-col items-center gap-2 rounded-card bg-white px-1 py-3 text-center text-xs font-semibold text-ink shadow-sm transition-shadow hover:shadow-md"
              >
                <ServiceIcon name={icon} className="size-8 text-brand-navy" strokeWidth={1.75} />
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
