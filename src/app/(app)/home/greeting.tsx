"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Hi, Ana" once the signed-in person's name (given at sign-up) is known.
export function Greeting() {
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getClaims()
      .then(({ data }) => {
        const fullName = data?.claims.user_metadata?.full_name;
        if (typeof fullName === "string" && fullName.trim()) setFirstName(fullName.trim().split(/\s+/)[0]);
      });
  }, []);

  return <>{firstName ? `Hi, ${firstName}` : "Welcome to PatchUp"}</>;
}
