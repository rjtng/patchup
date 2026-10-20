"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { turnOffPush } from "@/lib/push";
import { createClient } from "@/lib/supabase/client";

// Deleting the account: the database lists the person's files and lets them
// remove them (through Storage, so the files themselves go), then deletes the
// account once they're gone. Then this device signs out.
export function DeleteAccount() {
  const [understood, setUnderstood] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setPending(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: files, error: startError } = await supabase.rpc("start_account_deletion");
      if (startError) throw startError;
      for (const bucket of new Set(files.map((f) => f.bucket))) {
        const paths = files.filter((f) => f.bucket === bucket).map((f) => f.path);
        for (let i = 0; i < paths.length; i += 1000) {
          const { error: removeError } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 1000));
          if (removeError) throw removeError;
        }
      }
      await turnOffPush().catch(() => undefined);
      const { error: deleteError } = await supabase.rpc("delete_my_account");
      if (deleteError) throw deleteError;
    } catch (e) {
      const known = e && typeof e === "object" && "code" in e && e.code === "P0001" && "message" in e;
      setError(known ? String(e.message) : "We couldn't delete your account. Check your connection and try again.");
      setPending(false);
      return;
    }
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    // A full page load, so nothing of the account stays on screen.
    window.location.replace("/account-deleted");
  };

  return (
    <section aria-label="Delete my account" className="flex flex-col gap-4 rounded-card bg-white p-5 shadow-sm">
      <Checkbox checked={understood} onChange={(e) => setUnderstood(e.target.checked)}>
        I understand my account is deleted for good, and this can&apos;t be undone.
      </Checkbox>
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button variant="danger" onClick={remove} disabled={!understood || pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </section>
  );
}
