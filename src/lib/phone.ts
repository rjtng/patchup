import type { createClient } from "@/lib/supabase/client";

// Philippine mobile numbers. People type them many ways ("0917 123 4567",
// "+63 917-123-4567", "9171234567"); the database keeps one: "+639171234567".

/** The stored form of a mobile number, or null if it isn't one. */
export function normalizePhone(input: string) {
  const digits = input.replace(/[\s().-]/g, "");
  const match = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return match ? `+63${match[1]}` : null;
}

/** "+639171234567" -> "0917 123 4567", how people in the Philippines write it. */
export function formatPhone(phone: string) {
  const local = `0${phone.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/**
 * Saves the signed-in person's number (null removes it). Returns whether it
 * worked.
 */
export async function saveMyPhone(supabase: ReturnType<typeof createClient>, userId: string, phone: string | null) {
  if (phone === null) {
    const { error } = await supabase.from("phone_numbers").delete().eq("user_id", userId);
    return !error;
  }
  const { data: updated, error } = await supabase.from("phone_numbers").update({ phone }).eq("user_id", userId).select("user_id");
  if (error) return false;
  if (updated.length > 0) return true;
  const { error: insertError } = await supabase.from("phone_numbers").insert({ phone });
  return !insertError;
}
