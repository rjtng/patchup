"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// An admin removes a chat message that breaks the rules (both sides then see
// "Removed by PatchUp"; what it said is kept), or puts it back.
export function RemoveMessage({ messageId, removed }: { messageId: string; removed: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    setPending(true);
    setFailed(false);
    const { error } = await createClient().rpc("set_message_removed", { message_id: messageId, removed: !removed });
    setPending(false);
    if (error) {
      setFailed(true);
      return;
    }
    router.refresh();
  };

  return (
    <span className="flex items-center gap-2">
      {failed && (
        <span role="alert" className="text-xs text-danger">
          Couldn&apos;t save. Try again.
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="-my-2 min-h-11 px-2 text-xs font-semibold text-brand-navy underline disabled:opacity-50"
      >
        {removed ? "Put back" : "Remove"}
      </button>
    </span>
  );
}
