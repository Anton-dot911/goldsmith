import { supabase } from "./supabase.ts";
import { newObjectId } from "./ulid.ts";
import {
  INPUTS_BUCKET,
  buildFileRef,
  extensionOf,
  inputObjectPath,
  parseFileRef,
} from "./file-ref.ts";

// Supabase Storage wire calls for file inputs (T4). The bucket is private; the
// browser uses the anon key and its access is confined by the storage.objects
// RLS policies scoped to this bucket (supabase/migrations/002_storage_inputs.sql).
// Uploaded bytes are pointed at by a file_ref on the example; previews go
// through short-lived signed URLs (the bucket is never public). The path/ref
// shape lives in lib/file-ref.ts so it stays testable without a network.

// Preview links live long enough to open a PDF/image and label it, short enough
// that a leaked URL expires quickly.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface UploadedInput {
  // The value stored as the example's `input`: {"file_ref": "storage://..."}.
  file_ref: string;
  // The original filename, kept for display alongside the preview.
  filename: string;
  // The bucket-relative object path, handy for callers that just uploaded.
  path: string;
}

// Ensure the private inputs bucket exists (T4: "create programmatically if
// absent"). Idempotent and best-effort: the bucket is normally provisioned by
// migration 002, so a browser anon key that lacks bucket-management rights will
// simply find it already present. Any error here is swallowed — the subsequent
// upload surfaces a real permission/quota problem with a clearer message.
export async function ensureInputsBucket(): Promise<void> {
  const { data } = await supabase.storage.getBucket(INPUTS_BUCKET);
  if (data !== null) {
    return;
  }
  await supabase.storage.createBucket(INPUTS_BUCKET, { public: false });
}

// Upload one input file for a dataset and return the file_ref to store on the
// example. The object name is a fresh ULID so two files with the same original
// name never collide; the extension is preserved for preview/type.
export async function uploadInputFile(datasetSlug: string, file: File): Promise<UploadedInput> {
  await ensureInputsBucket();
  const ext = extensionOf(file.name);
  const path = inputObjectPath(datasetSlug, newObjectId(), ext);
  const { error } = await supabase.storage.from(INPUTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error !== null) {
    throw new Error(`upload failed for ${file.name}: ${error.message}`);
  }
  return { file_ref: buildFileRef(path), filename: file.name, path };
}

// A signed, time-limited URL for a file_ref, for previewing a private object.
// Returns null when the ref is malformed or points at another bucket.
export async function signedUrlForRef(
  fileRef: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const parsed = parseFileRef(fileRef);
  if (parsed === null) {
    return null;
  }
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, expiresIn);
  if (error !== null || data === null) {
    throw new Error(`could not sign ${fileRef}: ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}
