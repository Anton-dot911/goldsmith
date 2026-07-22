// Pure, DOM-free helpers for the file-input convention (T4). A file input is
// stored on an example as {"file_ref": "storage://goldsmith-inputs/<dataset>/
// <ulid>.<ext>"} — the extraction preset's file convention (docs/PLAN.md). The
// bytes live in a private Supabase Storage bucket; the file_ref is the stable
// pointer, previewed through short-lived signed URLs. Kept separate from
// lib/storage.ts (the Supabase wire calls) so the ref/path shape is
// unit-testable without a network.

// The single private bucket all input files land in. Created by migration
// 002_storage_inputs.sql (and, as a convenience, ensured at runtime).
export const INPUTS_BUCKET = "goldsmith-inputs";

// file_ref scheme prefix. Not a real URL scheme — a portable pointer the
// consumer repos resolve against their own Storage credentials.
export const STORAGE_SCHEME = "storage://";

export interface FileRefInput {
  file_ref: string;
}

export interface ParsedRef {
  bucket: string;
  path: string;
}

// The lowercased, alnum-only extension of a filename ("Rahunok.PDF" -> "pdf"),
// or "" when there is none. Used for the object name's suffix so previews can
// pick a renderer (pdf vs image) and downloads keep a sensible type.
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return "";
  }
  return filename
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// The object path within the bucket: "<dataset-slug>/<ulid>.<ext>". The slug is
// already URL-safe (lib/slug.ts) and the ulid is Crockford base32, so the path
// needs no further escaping. A missing extension yields just "<dataset>/<ulid>".
export function inputObjectPath(datasetSlug: string, objectId: string, ext: string): string {
  const base = `${datasetSlug}/${objectId}`;
  return ext === "" ? base : `${base}.${ext}`;
}

// Assemble a file_ref from a bucket-relative path. Defaults to the inputs
// bucket (the only bucket T4 writes).
export function buildFileRef(path: string, bucket: string = INPUTS_BUCKET): string {
  return `${STORAGE_SCHEME}${bucket}/${path}`;
}

// Split a file_ref back into { bucket, path }, or null if it is not a
// storage:// ref with a non-empty bucket and path. Used to resolve a signed URL
// and to render the filename.
export function parseFileRef(ref: string): ParsedRef | null {
  if (!ref.startsWith(STORAGE_SCHEME)) {
    return null;
  }
  const rest = ref.slice(STORAGE_SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (path === "") {
    return null;
  }
  return { bucket, path };
}

// Whether an example's input is a file input ({"file_ref": "..."}). The label
// page renders these as a preview + filename rather than an editable textarea.
export function isFileRefInput(input: unknown): input is FileRefInput {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    typeof (input as Record<string, unknown>).file_ref === "string"
  );
}

// The last path segment of a file_ref (the object's name), for display.
export function fileNameFromRef(ref: string): string | null {
  const parsed = parseFileRef(ref);
  if (parsed === null) {
    return null;
  }
  const segments = parsed.path.split("/");
  return segments[segments.length - 1] ?? null;
}
