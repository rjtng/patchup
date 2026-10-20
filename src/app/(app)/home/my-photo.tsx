import Link from "next/link";
import { Avatar } from "@/components/people/avatar";
import { profilePhotos } from "@/lib/profile-photos";
import { createClient } from "@/lib/supabase/server";

// The signed-in person's photo (or initial), the way to their Profile.
export async function MyPhoto() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const me = data?.claims.sub;
  if (!me) return <MyPhotoPlaceholder />;
  const name = data.claims.user_metadata?.full_name;
  const photos = await profilePhotos(supabase, [me]);
  return (
    <Link href="/profile" aria-label="Your profile" className="shrink-0 rounded-full">
      <Avatar
        name={typeof name === "string" && name.trim() ? name : "?"}
        photo={photos.get(me)}
        className="border-2 border-white/80 bg-white/20 text-white"
      />
    </Link>
  );
}

export const MyPhotoPlaceholder = () => <span className="size-12 shrink-0 rounded-full bg-white/15" />;
