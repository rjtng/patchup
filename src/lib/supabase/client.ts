import { createBrowserClient } from "@supabase/ssr";
import { MISSING_CONFIG, supabaseConfig } from "./config";
import type { Database } from "./database.types";

// Supabase client for code running in the browser (the sign-in forms, etc.).
// The session is stored in cookies, so the proxy sees it on every request.
export function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error(MISSING_CONFIG);
  return createBrowserClient<Database>(config.url, config.key);
}
