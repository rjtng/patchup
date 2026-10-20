import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Profile photos (see the profile_photos migration): one per person, in a
// private bucket, in a folder per person. profiles.avatar_url holds the path
// of their current one; whoever can see the profile can see it.

export const AVATAR_BUCKET = "avatars";

/**
 * A photo made into a small square JPEG (the middle of it, at most 512 px),
 * for a profile. Null if the browser can't read it as a picture.
 */
export async function squarePhoto(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(512, side);
    canvas
      .getContext("2d")
      ?.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

/**
 * Links to these people's photos (those who have one, and whose profile the
 * signed-in person can see), good for an hour: person id → link.
 */
export async function profilePhotos(
  supabase: SupabaseClient<Database>,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const { data: profiles } = await supabase.from("profiles").select("id, avatar_url").in("id", wanted);
  const paths = (profiles ?? []).flatMap((p) => (p.avatar_url ? [{ id: p.id, path: p.avatar_url }] : []));
  if (paths.length === 0) return new Map();
  const { data: links } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(
    paths.map((p) => p.path),
    60 * 60,
  );
  return new Map(
    paths.flatMap(({ id, path }) => {
      const url = links?.find((l) => l.path === path)?.signedUrl;
      return url ? [[id, url] as const] : [];
    }),
  );
}
