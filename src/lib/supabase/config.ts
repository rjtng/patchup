// The Supabase project the app talks to. Both values are public (every
// browser receives them); the database's access rules are what protect the
// data. Set them in .env.local for development and in the Vercel project
// settings for deployments (see .env.example).
export const MISSING_CONFIG =
  "Supabase isn't configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).";

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
