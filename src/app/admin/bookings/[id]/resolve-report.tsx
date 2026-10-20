"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/text-field";
import { createClient } from "@/lib/supabase/client";

// An admin closes a report with what PatchUp did about it. The person who
// reported it gets the note, on the booking and as a notification.
export function ResolveReport({ reportId, reporterName }: { reportId: string; reporterName: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async () => {
    if (!note.trim()) {
      setError(`Say what PatchUp did about it, for ${reporterName}.`);
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await createClient().rpc("resolve_report", { report_id: reportId, note: note.trim() });
    setPending(false);
    if (error) {
      setError(error.code === "P0001" ? error.message : "We couldn't save it. Check your connection and try again.");
      return;
    }
    setNote("");
    router.refresh();
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <TextAreaField
        label="What PatchUp did"
        hint={`${reporterName} gets this.`}
        rows={3}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && (
        <p role="alert" className="rounded-field bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button onClick={resolve} disabled={pending}>
        {pending ? "Saving…" : "Mark as resolved"}
      </Button>
    </div>
  );
}
