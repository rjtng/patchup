"use client";

import { CircleCheck, FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { CHIP_TONES } from "@/components/bookings/status-chip";
import { buttonClasses } from "@/components/ui/button";
import { formatDay } from "@/lib/bookings";
import { cn } from "@/lib/cn";
import {
  DOCUMENT_BUCKET,
  DOCUMENT_KINDS,
  DOCUMENT_TYPES,
  documentPath,
  formatSize,
  MAX_DOCUMENT_BYTES,
  type DocumentKind,
} from "@/lib/documents";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type SentDocument = {
  id: string;
  kind: DocumentKind;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  storage_path: string;
  url: string | null;
};

const INTRO: Record<Enums<"verification_status">, string> = {
  pending: "Send these so PatchUp can check and approve you. Only PatchUp sees them.",
  rejected: "Only PatchUp sees these. If they asked for new ones, send them here.",
  approved: "PatchUp checked these when approving you. Add newer ones when they're renewed.",
  suspended: "Only PatchUp sees these.",
};

/**
 * A technician's documents for approval: their government ID, NBI clearance
 * and certificates. Files go to a private bucket that only they and admins can
 * read. Until they're approved, they can remove a file (to send a clearer one).
 */
export function Documents({
  technicianId,
  status,
  documents,
}: {
  technicianId: string;
  status: Enums<"verification_status">;
  documents: SentDocument[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // a kind being uploaded, or a document being removed
  const [message, setMessage] = useState<{ kind: DocumentKind; text: string; error: boolean } | null>(null);
  const canRemove = status === "pending" || status === "rejected";

  const upload = async (kind: DocumentKind, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still counts
    if (!file) return;
    if (!DOCUMENT_TYPES[file.type]) {
      setMessage({ kind, text: "Send a photo (JPG, PNG or WebP) or a PDF.", error: true });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setMessage({ kind, text: "That file is over 10 MB. Try a smaller photo, or a screenshot of it.", error: true });
      return;
    }
    setBusy(kind);
    setMessage(null);
    const supabase = createClient();
    const path = documentPath(technicianId, file.type);
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(path, file, { contentType: file.type });
    const { error } = uploadError
      ? { error: uploadError }
      : await supabase.from("technician_documents").insert({
          kind,
          storage_path: path,
          file_name: file.name.slice(0, 200) || "document",
          content_type: file.type,
          size_bytes: file.size,
        });
    if (error && !uploadError) await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    setBusy(null);
    if (error) {
      setMessage({ kind, text: "We couldn't send it. Check your connection and try again.", error: true });
      return;
    }
    setMessage({ kind, text: `Sent ${file.name}.`, error: false });
    router.refresh();
  };

  const remove = async (document: SentDocument) => {
    setBusy(document.id);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.from("technician_documents").delete().eq("id", document.id).select("id");
    if (!error && data.length > 0) await supabase.storage.from(DOCUMENT_BUCKET).remove([document.storage_path]);
    setBusy(null);
    if (error || data.length === 0) {
      setMessage({ kind: document.kind, text: "We couldn't remove it. Refresh the page and try again.", error: true });
      return;
    }
    setMessage({ kind: document.kind, text: `Removed ${document.file_name}.`, error: false });
    router.refresh();
  };

  return (
    <section id="documents" aria-labelledby="documents-title" className="flex scroll-mt-4 flex-col gap-3 px-6 pt-6">
      <div>
        <h2 id="documents-title" className="text-lg font-bold text-ink">
          Documents for approval
        </h2>
        <p className="mt-1 text-sm text-muted">{INTRO[status]}</p>
      </div>
      {DOCUMENT_KINDS.map(({ kind, label, hint, required }) => {
        const sent = documents.filter((d) => d.kind === kind);
        return (
          <section key={kind} aria-label={label} className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink">{label}</h3>
                <p className="text-sm text-muted">{hint}</p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                  sent.length > 0 ? CHIP_TONES.active : required ? CHIP_TONES.waiting : CHIP_TONES.done,
                )}
              >
                {sent.length > 0 ? "Sent" : required ? "Needed" : "Optional"}
              </span>
            </div>
            {sent.length > 0 && (
              <ul className="flex flex-col gap-2">
                {sent.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 text-sm">
                    <FileText aria-hidden className="size-5 shrink-0 text-brand-navy" />
                    <span className="min-w-0 flex-1">
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-brand-navy underline">
                          {d.file_name}
                        </a>
                      ) : (
                        <span className="block truncate font-semibold text-ink">{d.file_name}</span>
                      )}
                      <span className="block text-muted">
                        {formatSize(d.size_bytes)} · sent {formatDay(d.uploaded_at)}
                      </span>
                    </span>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => remove(d)}
                        disabled={busy !== null}
                        aria-label={`Remove ${d.file_name}`}
                        className="shrink-0 rounded-full px-3 py-2 font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"
                      >
                        {busy === d.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {message?.kind === kind && (
              <p
                role={message.error ? "alert" : "status"}
                className={cn("flex items-center gap-2 text-sm", message.error ? "text-danger" : "font-semibold text-brand-navy")}
              >
                {!message.error && <CircleCheck aria-hidden className="size-4" />}
                {message.text}
              </p>
            )}
            {/* The file input is the control (keyboard and screen readers reach it); the label is how it looks. */}
            <label
              className={buttonClasses(
                "secondary",
                cn(
                  "h-12 cursor-pointer text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-yellow",
                  busy !== null && "pointer-events-none opacity-50",
                ),
              )}
            >
              <input
                type="file"
                accept={Object.keys(DOCUMENT_TYPES).join(",")}
                onChange={(e) => upload(kind, e)}
                disabled={busy !== null}
                className="sr-only"
              />
              <Upload aria-hidden className="size-5" />
              {busy === kind ? "Sending…" : sent.length > 0 ? `Add another ${kind === "certificate" ? "certificate" : "file"}` : `Send your ${label.toLowerCase()}`}
            </label>
          </section>
        );
      })}
      <p className="text-xs text-muted">Photos (JPG, PNG, WebP) or PDFs, up to 10 MB each.</p>
    </section>
  );
}
