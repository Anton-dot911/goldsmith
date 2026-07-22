import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftExpected } from "../lib/draft.ts";
import { makeRealDeps } from "../lib/deps.ts";
import { makeAdmin } from "../lib/supabase-admin.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

// @llm real-model smoke: one text input and one uploaded-PDF (RahunokFopPDF)
// file_ref, exercised end-to-end against Anthropic + Supabase. Opt-in so the
// default `pnpm test` and CI stay offline:
//   GOLDSMITH_LLM=1 ANTHROPIC_API_KEY=... (or METER_ANTHROPIC_API_KEY)
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter ./netlify/functions test
const enabled =
  process.env.GOLDSMITH_LLM === "1" &&
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.METER_ANTHROPIC_API_KEY);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

// An invoice-shaped extraction schema (a stand-in for a real DocFlow schema).
const INVOICE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    invoice_number: { type: "string" },
    issue_date: { type: "string", format: "date" },
    total_amount: { type: "number" },
    currency: { type: "string" },
    seller_name: { type: "string" },
  },
  required: ["invoice_number", "total_amount"],
  additionalProperties: true,
};

const INVOICE_TEXT =
  "Рахунок-фактура № 2024-0042 від 15.03.2024\n" +
  "Постачальник: ФОП Іваненко Іван Іванович\n" +
  "Послуги з розробки програмного забезпечення\n" +
  "Сума до сплати: 12500.00 грн";

async function latestMeterRow(admin: SupabaseClient): Promise<unknown> {
  const { data } = await admin
    .from("llm_calls")
    .select(
      "id, project, component, model, tokens_in, tokens_out, cost_usd, latency_ms, status, request_id",
    )
    .eq("project", "goldsmith")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

describe.skipIf(!enabled)("ai-draft @llm smoke", () => {
  let admin: SupabaseClient;
  let datasetId = "";
  let slug = "";
  let fileRef = "";
  const objectPath = () => `${slug}/rahunok.pdf`;

  beforeAll(async () => {
    admin = makeAdmin();
    slug = `llm-smoke-${Date.now()}`;
    const ins = await admin
      .from("datasets")
      .insert({ slug, title: "LLM Smoke", preset: "extraction", json_schema: INVOICE_SCHEMA })
      .select("id")
      .single();
    if (ins.error !== null) {
      throw new Error(`dataset setup failed: ${ins.error.message}`);
    }
    datasetId = ins.data.id as string;

    const pdf = readFileSync(join(REPO_ROOT, "data/source-templates/RahunokFopPDF.pdf"));
    const up = await admin.storage
      .from("goldsmith-inputs")
      .upload(objectPath(), pdf, { contentType: "application/pdf", upsert: true });
    if (up.error !== null) {
      throw new Error(`pdf upload failed: ${up.error.message}`);
    }
    fileRef = `storage://goldsmith-inputs/${objectPath()}`;
  });

  afterAll(async () => {
    if (datasetId !== "") {
      await admin.from("datasets").delete().eq("id", datasetId);
    }
    if (slug !== "") {
      await admin.storage.from("goldsmith-inputs").remove([objectPath()]);
    }
  });

  it("drafts an expected from a TEXT input", async () => {
    const out = await draftExpected(
      { dataset_id: datasetId, input: { text: INVOICE_TEXT } },
      makeRealDeps(),
    );
    console.log("\n=== TEXT SMOKE ===");
    console.log("draft response:", JSON.stringify(out, null, 2));
    console.log("llm_calls row:", JSON.stringify(await latestMeterRow(admin)));
    expect(typeof out.draft).toBe("object");
    expect(out.draft).not.toBeNull();
    expect(out.draft).toHaveProperty("invoice_number");
    expect(out.draft).toHaveProperty("total_amount");
    expect(out.model).toBeTruthy();
  }, 120_000);

  it("drafts an expected from the RahunokFopPDF file_ref", async () => {
    const out = await draftExpected(
      { dataset_id: datasetId, input: { file_ref: fileRef } },
      makeRealDeps(),
    );
    console.log("\n=== PDF (file_ref) SMOKE ===");
    console.log("file_ref:", fileRef);
    console.log("draft response:", JSON.stringify(out, null, 2));
    console.log("llm_calls row:", JSON.stringify(await latestMeterRow(admin)));
    expect(typeof out.draft).toBe("object");
    expect(out.draft).not.toBeNull();
    expect(out.draft).toHaveProperty("invoice_number");
    expect(out.model).toBeTruthy();
  }, 120_000);
});
