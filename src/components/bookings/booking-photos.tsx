"use client";

import { Camera, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { addBookingPhotos, MAX_PHOTOS, removeBookingPhoto, shrinkPhoto } from "@/lib/booking-photos";
import { createClient } from "@/lib/supabase/client";

export type BookingPhoto = { id: string; storage_path: string; url: string | null };

/**
 * A booking's photos of the problem. Its customer adds and removes them until
 * the job is done (`editable`); the technician and admins see them.
 */
export function BookingPhotos({
  bookingId,
  photos,
  editable,
  intro,
}: {
  bookingId: string;
  photos: BookingPhoto[];
  editable: boolean;
  intro?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // "add", or a photo being removed
  const [error, setError] = useState<string | null>(null);
  if (!editable && photos.length === 0) return null;

  const add = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // so choosing the same photo again still counts
    const room = MAX_PHOTOS - photos.length;
    if (files.length === 0 || room <= 0) return;
    setBusy("add");
    setError(null);
    const shrunk = (await Promise.all(files.slice(0, room).map(shrinkPhoto))).filter((p): p is Blob => p !== null);
    const added = shrunk.length > 0 ? await addBookingPhotos(createClient(), bookingId, shrunk) : 0;
    setBusy(null);
    if (added < Math.min(files.length, room)) {
      setError(
        shrunk.length < Math.min(files.length, room)
          ? "Some of those couldn't be read as photos. Try a JPG or PNG."
          : "Some photos didn't upload. Check your connection and try again.",
      );
    } else if (files.length > room) {
      setError(`Only ${MAX_PHOTOS} photos fit, so the rest weren't added.`);
    }
    router.refresh();
  };

  const remove = async (photo: BookingPhoto) => {
    setBusy(photo.id);
    setError(null);
    const removed = await removeBookingPhoto(createClient(), photo);
    setBusy(null);
    if (!removed) setError("That photo couldn't be removed. Try again.");
    router.refresh();
  };

  return (
    <section aria-labelledby="photos" className="rounded-card bg-white p-5 shadow-sm">
      <h2 id="photos" className="text-base font-bold text-ink">
        Photos
      </h2>
      {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <li key={photo.id} className="relative">
            <a
              href={photo.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-label={`Photo ${i + 1}, full size`}
              className="block aspect-square overflow-hidden rounded-field bg-surface"
            >
              {photo.url && (
                // A private photo behind a short-lived link: shown as is, not through Next's image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.url} alt="" className="size-full object-cover" />
              )}
            </a>
            {editable && (
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => remove(photo)}
                disabled={busy !== null}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink disabled:opacity-50"
              >
                <X aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </li>
        ))}
        {editable && photos.length < MAX_PHOTOS && (
          <li>
            <label className="grid aspect-square cursor-pointer place-items-center rounded-field border-2 border-dashed border-line bg-white text-brand-navy has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-yellow">
              <span className="flex flex-col items-center gap-1 text-xs font-semibold">
                <Camera aria-hidden className="size-6" />
                {busy === "add" ? "Adding…" : "Add photo"}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                aria-label="Add photos"
                onChange={add}
                disabled={busy !== null}
                className="sr-only"
              />
            </label>
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
