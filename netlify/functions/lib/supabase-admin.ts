import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPreset, type DatasetMeta, type FileContent, type MeterRecord } from "./draft.ts";
import type { ExampleForExport } from "./export-line.ts";

// Server-side Supabase client using the SERVICE ROLE key. This is the only place
// the service key is used, and it lives strictly in Netlify Functions (never the
// browser). It bypasses RLS by design: the function reads the dataset schema,
// signs storage URLs for file inputs, writes the `llm_calls` meter row (owner-
// only RLS), and serves the CI export — all server-side with the secret off the
// client (CLAUDE.md rule 5).

export function makeAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url === undefined || key === undefined) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function toDatasetMeta(row: Record<string, unknown>): DatasetMeta {
  const preset = row.preset;
  if (!isPreset(preset)) {
    throw new Error(`dataset has unknown preset: ${String(preset)}`);
  }
  return {
    id: String(row.id),
    slug: String(row.slug),
    preset,
    json_schema: (row.json_schema ?? {}) as Record<string, unknown>,
    current_version: Number(row.current_version),
  };
}

export async function loadDataset(admin: SupabaseClient, datasetId: string): Promise<DatasetMeta> {
  const { data, error } = await admin
    .from("datasets")
    .select("id, slug, preset, json_schema, current_version")
    .eq("id", datasetId)
    .single();
  if (error !== null || data === null) {
    throw new Error(`dataset ${datasetId} not found: ${error?.message ?? "no row"}`);
  }
  return toDatasetMeta(data);
}

export async function loadDatasetBySlug(
  admin: SupabaseClient,
  slug: string,
): Promise<DatasetMeta | null> {
  const { data, error } = await admin
    .from("datasets")
    .select("id, slug, preset, json_schema, current_version")
    .eq("slug", slug)
    .maybeSingle();
  if (error !== null || data === null) {
    return null;
  }
  return toDatasetMeta(data);
}

export async function loadExamplesForExport(
  admin: SupabaseClient,
  datasetId: string,
): Promise<ExampleForExport[]> {
  const { data, error } = await admin
    .from("examples")
    .select("id, input, expected, tags, provenance, active, version_added")
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: true });
  if (error !== null) {
    throw new Error(`could not load examples: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    input: r.input,
    expected: r.expected,
    tags: (r.tags ?? []) as string[],
    provenance: String(r.provenance),
    active: Boolean(r.active),
    version_added: Number(r.version_added),
  }));
}

const IMAGE_MEDIA: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function parseRef(fileRef: string): { bucket: string; path: string } {
  const scheme = "storage://";
  if (!fileRef.startsWith(scheme)) {
    throw new Error(`not a storage ref: ${fileRef}`);
  }
  const rest = fileRef.slice(scheme.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    throw new Error(`malformed storage ref: ${fileRef}`);
  }
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

// Fetch a file input server-side via a short-lived signed URL and shape it as a
// Claude content block. PDFs go as `document` (Claude reads them natively);
// known image types go as `image`. Anything else defaults to document so the
// model at least receives the bytes.
export async function fetchFile(admin: SupabaseClient, fileRef: string): Promise<FileContent> {
  const { bucket, path } = parseRef(fileRef);
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 120);
  if (error !== null || data === null) {
    throw new Error(`could not sign ${fileRef}: ${error?.message ?? "no url"}`);
  }
  const resp = await fetch(data.signedUrl);
  if (!resp.ok) {
    throw new Error(`fetch of ${fileRef} failed: HTTP ${resp.status}`);
  }
  const base64 = Buffer.from(await resp.arrayBuffer()).toString("base64");
  const ext = extensionOf(path);
  if (ext === "pdf") {
    return { kind: "document", media_type: "application/pdf", base64 };
  }
  const imageMedia = IMAGE_MEDIA[ext];
  if (imageMedia !== undefined) {
    return { kind: "image", media_type: imageMedia, base64 };
  }
  return { kind: "document", media_type: "application/pdf", base64 };
}

export async function meter(admin: SupabaseClient, record: MeterRecord): Promise<void> {
  const { error } = await admin.from("llm_calls").insert({
    // `ts` (the call timestamp) is NOT NULL with no default in the shared
    // meter-dev schema — the client sets it (inserted_at has its own default).
    ts: new Date().toISOString(),
    project: record.project,
    component: record.component,
    model: record.model,
    tokens_in: record.tokens_in,
    tokens_out: record.tokens_out,
    cost_usd: record.cost_usd,
    latency_ms: record.latency_ms,
    status: record.status,
    error_type: record.error_type,
    request_id: record.request_id,
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}
