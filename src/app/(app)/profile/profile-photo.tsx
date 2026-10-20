"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/people/avatar";
import { AVATAR_BUCKET, squarePhoto } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/client";

// Adding, changing or removing your profile photo. The new one is uploaded
// first, then made current; the old file goes after.
export function ProfilePhoto({
  userId,
  name,
  photo,
  technician,
}: {
  userId: string;
  name: string;
  photo: string | null;
  technician: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPath = async () =>
    (await createClient().from("profiles").select("avatar_url").eq("id", userId).maybeSingle()).data?.avatar_url ??
    null;

  const upload = async (file: File) => {
    setPending("upload");
    setError(null);
    const square = await squarePhoto(file);
    if (!square) {
      setPending(null);
      setError("We couldn't read that picture. Try a JPG or PNG photo.");
      return;
    }
    const supabase = createClient();
    const old = await currentPath();
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, square, { contentType: "image/jpeg" });
    const { error: saveError } = uploadError
      ? { error: uploadError }
      : await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
    if (saveError) {
      if (!uploadError) await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      setPending(null);
      setError("We couldn't save your photo. Check your connection and try again.");
      return;
    }
    if (old) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
    setPending(null);
    router.refresh();
  };

  const remove = async () => {
    setPending("remove");
    setError(null);
    const supabase = createClient();
    const old = await currentPath();
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) {
      setPending(null);
      setError("We couldn't remove your photo. Check your connection and try again.");
      return;
    }
    if (old) await supabase.storage.from(AVATAR_BUCKET).remove([old]);
    setPending(null);
    router.refresh();
  };

  return (
    <section aria-labelledby="photo" className="mx-6 mt-6 rounded-card bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} photo={photo} className="size-20 text-3xl" />
        <div className="min-w-0 flex-1">
          <h2 id="photo" className="font-bold text-ink">
            Your photo
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {technician
              ? "Customers see it on your profile and when you're coming."
              : "Your technicians see it, so they know who to look for."}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          ref={input}
          type="file"
          accept="image/*"
          aria-label="Choose a photo"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending !== null}
          className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-brand-navy px-4 text-sm font-semibold text-brand-navy hover:bg-surface disabled:opacity-50"
        >
          <Camera aria-hidden className="size-4" />
          {pending === "upload" ? "Saving…" : photo ? "Change photo" : "Add a photo"}
        </button>
        {photo && (
          <button
            type="button"
            onClick={remove}
            disabled={pending !== null}
            className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"
          >
            {pending === "remove" ? "Removing…" : "Remove photo"}
          </button>
        )}
      </div>
    </section>
  );
}
