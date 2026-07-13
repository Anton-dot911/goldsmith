import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newExampleId } from "../src/lib/ulid.ts";

// Integration test against the real Supabase project: an example's full
// lifecycle create -> edit (new revision) -> deactivate, exercised through the
// same wire shape the app uses. Opt-in like datasets.integration.test.ts:
//   GOLDSMITH_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//     pnpm --filter ./web test examples.integration
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const enabled = process.env.GOLDSMITH_INTEGRATION === "1" && Boolean(url) && Boolean(anonKey);

describe.skipIf(!enabled)("examples lifecycle (live Supabase, anon key + RLS)", () => {
  let supabase: SupabaseClient;
  const slug = `it-ex-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let datasetId: string | null = null;
  const exampleId = newExampleId();

  // A tiny dataset schema: `label` (string) required.
  const jsonSchema = {
    type: "object",
    properties: { label: { type: "string" } },
    required: ["label"],
    additionalProperties: false,
  };

  beforeAll(async () => {
    supabase = createClient(url as string, anonKey as string);
    const { data, error } = await supabase
      .from("datasets")
      .insert({ slug, title: "Examples IT", preset: "classification", json_schema: jsonSchema })
      .select("id, current_version")
      .single();
    expect(error).toBeNull();
    datasetId = data?.id ?? null;
    expect(data?.current_version).toBe(1);
  });

  afterAll(async () => {
    // Deleting the dataset cascades to its examples (FK on delete cascade).
    if (datasetId !== null) {
      await supabase.from("datasets").delete().eq("id", datasetId);
    }
  });

  it("create -> edit -> deactivate keeps one row per id and never deletes", async () => {
    // CREATE (revision 1, active, human_only).
    const created = await supabase
      .from("examples")
      .insert({
        id: exampleId,
        dataset_id: datasetId,
        version_added: 1,
        input: { text: "hello" },
        expected: { label: "greeting" },
        tags: ["scan"],
        provenance: "human_only",
      })
      .select("id, revision, active, provenance, expected, version_added")
      .single();
    expect(created.error).toBeNull();
    expect(created.data?.id).toBe(exampleId);
    expect(created.data?.revision).toBe(1);
    expect(created.data?.active).toBe(true);
    expect(created.data?.provenance).toBe("human_only");
    expect(created.data?.version_added).toBe(1);
    console.log("[IT] created:", JSON.stringify(created.data));

    // EDIT -> new revision of the SAME id (revision 2, expected replaced).
    const edited = await supabase
      .from("examples")
      .update({
        expected: { label: "salutation" },
        revision: 2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", exampleId)
      .select("id, revision, active, expected")
      .single();
    expect(edited.error).toBeNull();
    expect(edited.data?.id).toBe(exampleId);
    expect(edited.data?.revision).toBe(2);
    expect(edited.data?.expected).toEqual({ label: "salutation" });
    console.log("[IT] edited:", JSON.stringify(edited.data));

    // DEACTIVATE -> active=false, row still present.
    const deactivated = await supabase
      .from("examples")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", exampleId)
      .select("id, revision, active")
      .single();
    expect(deactivated.error).toBeNull();
    expect(deactivated.data?.active).toBe(false);
    expect(deactivated.data?.revision).toBe(2);
    console.log("[IT] deactivated:", JSON.stringify(deactivated.data));

    // The row is excluded from the active list but NOT deleted.
    const activeList = await supabase
      .from("examples")
      .select("id")
      .eq("dataset_id", datasetId)
      .eq("active", true);
    expect(activeList.error).toBeNull();
    expect((activeList.data ?? []).some((r) => r.id === exampleId)).toBe(false);

    const stillThere = await supabase
      .from("examples")
      .select("id, active, revision")
      .eq("id", exampleId)
      .single();
    expect(stillThere.error).toBeNull();
    expect(stillThere.data?.id).toBe(exampleId);
    console.log("[IT] final row:", JSON.stringify(stillThere.data));
  });
});
