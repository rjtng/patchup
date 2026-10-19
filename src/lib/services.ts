import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

// The services customers book (service_categories), as Home, All services and
// Search list them. They're read from the database so a service can be
// renamed, reordered, hidden or added there without changing the app.

export type ServiceCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  inspection_fee: number;
};

/**
 * The services that can be booked, in order. Cached and shared by every
 * page: a change in the database shows within a minute or two.
 */
export async function getServiceCategories(): Promise<ServiceCategory[]> {
  "use cache";
  cacheLife("minutes");

  const config = supabaseConfig();
  // A build without the Supabase settings (like CI's) has no services to list.
  if (!config) return [];
  // Anyone may read the services, so this asks as a visitor (no cookies), which lets it be cached.
  const supabase = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("service_categories")
    .select("id, slug, name, icon, inspection_fee")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  // Failing keeps the last list (or fails the build) rather than showing none.
  if (error) throw new Error(`Couldn't load the services: ${error.message}`);
  return data;
}

export async function getCategory(slug: string) {
  return (await getServiceCategories()).find((c) => c.slug === slug);
}

/**
 * The service pages to build ahead. A page needs at least one; without the
 * Supabase settings that one is simply not found.
 */
export async function serviceParams() {
  const categories = await getServiceCategories();
  return categories.length > 0 ? categories.map(({ slug }) => ({ slug })) : [{ slug: "plumbing" }];
}
