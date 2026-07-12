import { PRESETS } from "@goldsmith/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { presetSchemaText } from "../src/lib/schema.ts";
import { slugify } from "../src/lib/slug.ts";

// Acceptance run for the T1 DoD: create one dataset of each preset through the
// app's real create path against live Supabase. Opt-in via GOLDSMITH_ACCEPTANCE=1.
//
// It drives the exact logic the "Create dataset" button runs — slugify(title),
// presetSchemaText(preset), and createDataset() from src/lib/datasets.ts (which
// uses the app's src/lib/supabase.ts client) — just without React rendering the
// form. VITE_SUPABASE_* is stubbed before the dynamic import so supabase.ts
// reads it at module load, exactly as the browser bundle does.
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const enabled = process.env.GOLDSMITH_ACCEPTANCE === "1" && Boolean(url) && Boolean(anonKey);
const stamp = Date.now();

describe.skipIf(!enabled)("acceptance: create a dataset of each preset (live app path)", () => {
  let createDataset: (typeof import("../src/lib/datasets.ts"))["createDataset"];
  const createdIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv("VITE_SUPABASE_URL", url as string);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", anonKey as string);
    ({ createDataset } = await import("../src/lib/datasets.ts"));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
  });

  for (const preset of PRESETS) {
    it(`creates a ${preset} dataset`, async () => {
      // Exactly what the dialog assembles from its fields.
      const title = `Acceptance ${preset} ${stamp}`;
      const input = {
        title,
        slug: slugify(title),
        preset,
        json_schema: JSON.parse(presetSchemaText(preset)) as Record<string, unknown>,
      };
      const row = await createDataset(input);
      createdIds.push(row.id);

      expect(row.slug).toBe(`acceptance-${preset}-${stamp}`);
      expect(row.preset).toBe(preset);
      expect(row.current_version).toBe(1);
      expect(row.json_schema).toEqual(input.json_schema);
    });
  }

  it("lists the freshly created rows back through the app", async () => {
    const { listDatasets } = await import("../src/lib/datasets.ts");
    const all = await listDatasets();
    const mine = all.filter((d) => d.title.includes(`${stamp}`));
    expect(mine).toHaveLength(PRESETS.length);
  });
});
