import type { createClient } from "@/lib/supabase/client";

/**
 * Saves the signed-in person's name. Returns whether it worked. The greeting
 * on Home reads the name from the session's account details (no lookup), so
 * those are updated too, and the session renewed to carry them.
 */
export async function saveMyName(supabase: ReturnType<typeof createClient>, userId: string, fullName: string) {
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (error) return false;
  const { error: accountError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (!accountError) await supabase.auth.refreshSession();
  return true;
}
