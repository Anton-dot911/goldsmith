import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

// Integration test against the real Supabase project. Opt-in: it only runs
// when GOLDSMITH_INTEGRATION=1 and the anon credentials are present, so the
// default `pnpm test` (and CI) stay offline and green. Run it with:
//   GOLDSMITH_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//     pnpm --filter ./web test
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const enabled = process.env.GOLDSMITH_INTEGRATION === "1" && Boolean(url) && Boolean(anonKey);

describe.skipIf(!enabled)("datasets (live Supabase, anon key + RLS)", () => {
  const supabase = createClient(url as string, anonKey as string);
  const slug = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let createdId: string | null = null;

  afterAll(async () => {
    if (createdId !== null) {
      await supabase.from("datasets").delete().eq("id", createdId);
    }
  });

  it("creates a dataset and reads the row back", async () => {
    const insert = await supabase
      .from("datasets")
      .insert({
        slug,
        title: "Integration Test",
        preset: "qa",
        json_schema: { type: "object", properties: { answerable: { type: "boolean" } } },
      })
      .select("id, slug, preset, current_version")
      .single();

    expect(insert.error).toBeNull();
    expect(insert.data).not.toBeNull();
    createdId = insert.data?.id ?? null;
    expect(insert.data?.slug).toBe(slug);
    expect(insert.data?.preset).toBe("qa");
    // DDL default.
    expect(insert.data?.current_version).toBe(1);

    const read = await supabase.from("datasets").select("id, slug").eq("slug", slug).single();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(createdId);
  });

  it("confines the anon key: meter tables in the shared project stay hidden", async () => {
    // llm_calls has owner-only RLS; the anon key sees zero rows, never an error
    // — that is the confinement. If RLS were off, this would leak Meter data.
    const { data, error } = await supabase.from("llm_calls").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
