import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import exportSchema from "@spec/export.schema.json";
import exportHandler from "../export.ts";
import { makeAdmin } from "../lib/supabase-admin.ts";

// Live end-to-end check of the CI export endpoint: seed a dataset with an active
// and an inactive example, invoke the real handler (bearer auth + DB read +
// contract assembly), and validate the JSONL body. Opt-in:
//   GOLDSMITH_EXPORT=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     EXPORT_TOKEN=... pnpm --filter ./netlify/functions test
const enabled =
  process.env.GOLDSMITH_EXPORT === "1" &&
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  Boolean(process.env.EXPORT_TOKEN);

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validateLine = ajv.compile(exportSchema as AnySchema);

function ulid(): string {
  const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let s = "";
  for (let i = 0; i < 26; i++) s += chars[Math.floor(Math.random() * 32)];
  return `ex_${s}`;
}

describe.skipIf(!enabled)("export endpoint (live)", () => {
  let admin: SupabaseClient;
  let datasetId = "";
  let slug = "";

  beforeAll(async () => {
    admin = makeAdmin();
    slug = `export-live-${Date.now()}`;
    const ins = await admin
      .from("datasets")
      .insert({
        slug,
        title: "Export Live",
        preset: "qa",
        json_schema: { type: "object", properties: { answerable: { type: "boolean" } } },
      })
      .select("id")
      .single();
    if (ins.error !== null) throw new Error(ins.error.message);
    datasetId = ins.data.id as string;

    await admin.from("examples").insert([
      {
        id: ulid(),
        dataset_id: datasetId,
        version_added: 1,
        active: true,
        input: { question: "is the sky blue?" },
        expected: { answerable: true, answer: "yes" },
        tags: ["easy"],
        provenance: "human_only",
        revision: 1,
      },
      {
        id: ulid(),
        dataset_id: datasetId,
        version_added: 1,
        active: false, // deactivated — must NOT appear in export
        input: { question: "removed?" },
        expected: { answerable: false, answer: "" },
        tags: [],
        provenance: "human_only",
        revision: 1,
      },
    ]);
  });

  afterAll(async () => {
    if (datasetId !== "") await admin.from("datasets").delete().eq("id", datasetId);
  });

  const context = {} as never;

  it("rejects a missing/wrong bearer token", async () => {
    const req = new Request(`https://x/.netlify/functions/export?dataset=${slug}&version=1`);
    const res = await exportHandler(req, context);
    expect(res.status).toBe(401);
  });

  it("serves the active examples as valid JSONL with a correct token", async () => {
    const token = process.env.EXPORT_TOKEN as string;
    const req = new Request(`https://x/.netlify/functions/export?dataset=${slug}&version=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await exportHandler(req, context);
    expect(res.status).toBe(200);
    const body = await res.text();
    console.log("\n=== EXPORT LIVE ===");
    console.log(`GET /export?dataset=${slug}&version=1 -> ${res.status}`);
    console.log(body);

    const lines = body.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(1); // only the active example
    const parsed = JSON.parse(lines[0]!);
    expect(validateLine(parsed)).toBe(true);
    expect(parsed.dataset).toBe(slug);
    expect(parsed.dataset_version).toBe(1);
    expect(parsed.expected).toEqual({ answerable: true, answer: "yes" });
  });
});
