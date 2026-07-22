// @vitest-environment node
// Storage uploads (multipart/Blob) and signed-URL fetches need real Node
// networking; the suite's default jsdom environment hangs on them.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INPUTS_BUCKET,
  buildFileRef,
  extensionOf,
  inputObjectPath,
  parseFileRef,
} from "../src/lib/file-ref.ts";
import { newExampleId, newObjectId } from "../src/lib/ulid.ts";

// Live Storage round-trip for file inputs (T4). Opt-in like the other
// integration tests:
//   GOLDSMITH_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//     pnpm --filter ./web test storage.integration
//
// It exercises the real path the app performs: upload a small file to the
// private goldsmith-inputs bucket -> create an unlabeled example row whose input
// is {"file_ref": "storage://..."} -> fetch a signed URL and read the bytes
// back. Requires the storage policies from supabase/migrations/002 to be applied
// for the anon key (the service-role key bypasses RLS).
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
const enabled = process.env.GOLDSMITH_INTEGRATION === "1" && Boolean(url) && Boolean(key);

describe.skipIf(!enabled)("file input storage round-trip (live Supabase)", () => {
  let supabase: SupabaseClient;
  const slug = `it-storage-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let datasetId: string | null = null;
  let objectPath: string | null = null;

  const jsonSchema = {
    type: "object",
    properties: { invoice_number: { type: "string" } },
    required: ["invoice_number"],
    additionalProperties: true,
  };

  beforeAll(async () => {
    supabase = createClient(url as string, key as string);
    // Ensure the bucket (idempotent; ignore "already exists").
    await supabase.storage.createBucket(INPUTS_BUCKET, { public: false });
    const { data, error } = await supabase
      .from("datasets")
      .insert({ slug, title: "Storage IT", preset: "extraction", json_schema: jsonSchema })
      .select("id, current_version")
      .single();
    expect(error).toBeNull();
    datasetId = data?.id ?? null;
  }, 30000);

  afterAll(async () => {
    if (objectPath !== null) {
      await supabase.storage.from(INPUTS_BUCKET).remove([objectPath]);
    }
    if (datasetId !== null) {
      await supabase.from("datasets").delete().eq("id", datasetId);
    }
  });

  it("upload -> unlabeled row with file_ref -> signed URL fetch succeeds", async () => {
    // A tiny file. The bucket-path convention comes from the same helpers the
    // app uses.
    const ext = extensionOf("sample.txt");
    objectPath = inputObjectPath(slug, newObjectId(), ext);
    const body = new Blob([`goldsmith t4 ${slug}`], { type: "text/plain" });

    const uploaded = await supabase.storage.from(INPUTS_BUCKET).upload(objectPath, body, {
      contentType: "text/plain",
      upsert: false,
    });
    expect(uploaded.error).toBeNull();
    console.log("[IT] uploaded object:", objectPath);

    const fileRef = buildFileRef(objectPath);
    expect(parseFileRef(fileRef)).toEqual({ bucket: INPUTS_BUCKET, path: objectPath });

    // Create the unlabeled example row (expected null, inactive).
    const created = await supabase
      .from("examples")
      .insert({
        id: newExampleId(),
        dataset_id: datasetId,
        version_added: 1,
        input: { file_ref: fileRef },
        expected: {},
        active: false,
        tags: [],
        provenance: "human_only",
      })
      .select("id, input, expected, active, provenance")
      .single();
    expect(created.error).toBeNull();
    expect(created.data?.active).toBe(false);
    expect((created.data?.input as { file_ref: string }).file_ref).toBe(fileRef);
    console.log("[IT] example row:", JSON.stringify(created.data));

    // Sign + fetch: the private object is readable through the signed URL.
    const signed = await supabase.storage.from(INPUTS_BUCKET).createSignedUrl(objectPath, 60);
    expect(signed.error).toBeNull();
    expect(signed.data?.signedUrl).toBeTruthy();
    console.log("[IT] signed URL:", signed.data?.signedUrl);

    const res = await fetch(signed.data?.signedUrl as string);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(`goldsmith t4 ${slug}`);
    console.log("[IT] fetched bytes match:", text);
  }, 30000);
});
