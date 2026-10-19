import type { Enums } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

// Technicians' documents for approval (see the technician-documents migration).

export type DocumentKind = Enums<"document_kind">;

/** The private Storage bucket; each technician's files are in a folder named after their id. */
export const DOCUMENT_BUCKET = "technician-documents";

// What the bucket accepts (the database and Storage check it too).
export const DOCUMENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_KINDS: { kind: DocumentKind; label: string; hint: string; required: boolean }[] = [
  {
    kind: "government_id",
    label: "Government ID",
    hint: "With your photo: PhilSys, UMID, driver's license, passport…",
    required: true,
  },
  { kind: "nbi_clearance", label: "NBI clearance", hint: "A recent one.", required: true },
  {
    kind: "certificate",
    label: "Certificates",
    hint: "Optional: TESDA NC II, or anything that shows your training or experience.",
    required: false,
  },
];

export const documentLabel = (kind: DocumentKind) => DOCUMENT_KINDS.find((k) => k.kind === kind)?.label ?? kind;

/** Whether the documents needed for approval are all in. */
export const hasRequiredDocuments = (kinds: DocumentKind[]) =>
  DOCUMENT_KINDS.every((k) => !k.required || kinds.includes(k.kind));

/** "850 KB", "2.4 MB" */
export function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where a new file goes: the technician's folder, under a fresh name (the file's own name is kept in the table). */
export const documentPath = (technicianId: string, contentType: string) =>
  `${technicianId}/${crypto.randomUUID()}.${DOCUMENT_TYPES[contentType]}`;

/** Adds a link to each document's file, good for an hour (the bucket is private). */
export async function withSignedUrls<T extends { storage_path: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documents: T[],
): Promise<(T & { url: string | null })[]> {
  if (documents.length === 0) return [];
  const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrls(
    documents.map((d) => d.storage_path),
    60 * 60,
  );
  return documents.map((d) => ({ ...d, url: data?.find((s) => s.path === d.storage_path)?.signedUrl ?? null }));
}
