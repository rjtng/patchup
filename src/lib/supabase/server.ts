import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { MISSING_CONFIG, supabaseConfig } from "./config";
import type { Database } from "./database.types";

// Supabase client for Server Components, acting as the signed-in person (so
// the database's access rules apply). Reading cookies makes a component
// request-time only, so render it inside <Suspense>.
export async function createClient() {
  // Cookies first: while prerendering, this is where the component stops, so a
  // build without the Supabase settings (like CI's) still succeeds.
  const cookieStore = await cookies();
  const config = supabaseConfig();
  if (!config) throw new Error(MISSING_CONFIG);

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}
