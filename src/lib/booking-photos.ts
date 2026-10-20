import type { createClient } from "@/lib/supabase/client";

// Photos of the problem on a booking (see the booking-photos migration): up to
// three, in a private bucket, in a folder per booking.

export const PHOTO_BUCKET = "booking-photos";
/** A booking has up to this many (the database holds to it too). */
export const MAX_PHOTOS = 3;

type Supabase = ReturnType<typeof createClient>;

/**
 * A phone photo made small enough to send quickly on mobile data: a JPEG at
 * most 1600 px on its longer side. Null if the browser can't read it as a
 * picture.
 */
export async function shrinkPhoto(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

/** Adds photos to a booking: each file to the booking's folder, then to its list. Returns how many were added. */
export async function addBookingPhotos(supabase: Supabase, bookingId: string, photos: Blob[]) {
  let added = 0;
  for (const photo of photos) {
    const path = `${bookingId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photo, { contentType: "image/jpeg" });
    if (uploadError) continue;
    const { error } = await supabase.from("booking_photos").insert({ booking_id: bookingId, storage_path: path });
    if (error) {
      // Not on the list (three already, or the job's done): don't keep the file.
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      continue;
    }
    added++;
  }
  return added;
}

/** Takes a photo off its booking: from the list, then the file. */
export async function removeBookingPhoto(supabase: Supabase, photo: { id: string; storage_path: string }) {
  const { data, error } = await supabase.from("booking_photos").delete().eq("id", photo.id).select("id");
  if (error || data.length === 0) return false;
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  return true;
}
