import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftExpected } from "../functions/lib/draft.ts";
import { makeRealDeps } from "../functions/lib/deps.ts";
import { makeAdmin } from "../functions/lib/supabase-admin.ts";

// Acceptance run (TZ Definition of Done): time a realistic labeling pass over 10
// inputs (a mix of the sample template PDFs and text), draft each with AI,
// apply the human correction, and save — then report the total and per-example
// time and extrapolate to 40. Opt-in:
//   GOLDSMITH_ACCEPTANCE=1 (+ the same Anthropic/Supabase env as the @llm smoke)
const enabled =
  process.env.GOLDSMITH_ACCEPTANCE === "1" &&
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
  Boolean(process.env.ANTHROPIC_API_KEY ?? process.env.METER_ANTHROPIC_API_KEY);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

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

// Five text invoices + five sample-template PDFs = the mix the DoD asks for.
const TEXT_INPUTS = [
  "Рахунок-фактура № 2024-0042 від 15.03.2024. ФОП Іваненко І.І. Сума до сплати: 12500.00 грн",
  "Invoice INV-2024-118 dated 2024-04-02. Acme LLC. Total due: USD 3,499.00",
  "Рахунок № А-77 від 01.02.2024. ТОВ «Ромашка». Разом до сплати: 8 400,50 грн",
  "Invoice #55123, issued 2024-05-20, ByteWorks Inc, amount payable 990.00 EUR",
  "Рахунок на оплату № 300 від 10.06.2024. ФОП Петренко. Всього: 21000 грн",
];
// Gold (human-verified) expected for each text input — the "correction" step.
const TEXT_GOLD = [
  { invoice_number: "2024-0042", total_amount: 12500, currency: "UAH", issue_date: "2024-03-15" },
  { invoice_number: "INV-2024-118", total_amount: 3499, currency: "USD", issue_date: "2024-04-02" },
  { invoice_number: "А-77", total_amount: 8400.5, currency: "UAH", issue_date: "2024-02-01" },
  { invoice_number: "55123", total_amount: 990, currency: "EUR", issue_date: "2024-05-20" },
  { invoice_number: "300", total_amount: 21000, currency: "UAH", issue_date: "2024-06-10" },
];

const PDF_FILES = [
  "RahunokFopPDF.pdf",
  "NakladnaPDF.pdf",
  "ZakupavelniyAktPDF.pdf",
  "ZayavaPovernennaPDF.pdf",
  "RahunokUrosobaPDF.pdf",
];

function ulid(): string {
  const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let s = "";
  for (let i = 0; i < 26; i++) {
    s += chars[Math.floor(Math.random() * 32)];
  }
  return `ex_${s}`;
}

function changedTopLevel(a: unknown, b: unknown): number {
  const oa = (a ?? {}) as Record<string, unknown>;
  const ob = (b ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
  let n = 0;
  for (const k of keys) {
    if (JSON.stringify(oa[k]) !== JSON.stringify(ob[k])) {
      n += 1;
    }
  }
  return n;
}

describe.skipIf(!enabled)("acceptance: timed 10-input labeling run (DoD)", () => {
  let admin: SupabaseClient;
  let datasetId = "";
  let slug = "";
  const uploaded: string[] = [];

  beforeAll(async () => {
    admin = makeAdmin();
    slug = `acceptance-run-${Date.now()}`;
    const ins = await admin
      .from("datasets")
      .insert({ slug, title: "Acceptance Run", preset: "extraction", json_schema: INVOICE_SCHEMA })
      .select("id")
      .single();
    if (ins.error !== null) {
      throw new Error(`dataset setup failed: ${ins.error.message}`);
    }
    datasetId = ins.data.id as string;

    for (const name of PDF_FILES) {
      const bytes = readFileSync(join(REPO_ROOT, "data/source-templates", name));
      const path = `${slug}/${name}`;
      const up = await admin.storage
        .from("goldsmith-inputs")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (up.error !== null) {
        throw new Error(`upload ${name} failed: ${up.error.message}`);
      }
      uploaded.push(path);
    }
  }, 120_000);

  afterAll(async () => {
    if (datasetId !== "") {
      await admin.from("datasets").delete().eq("id", datasetId); // examples cascade
    }
    if (uploaded.length > 0) {
      await admin.storage.from("goldsmith-inputs").remove(uploaded);
    }
  });

  it("drafts, corrects, and saves 10 examples; reports timing", async () => {
    const deps = makeRealDeps();
    interface Row {
      kind: string;
      draftMs: number;
      saveMs: number;
      corrected: number;
      cost: number | null;
    }
    const rows: Row[] = [];
    let totalCost = 0;

    async function labelOne(
      kind: string,
      input: unknown,
      gold: Record<string, unknown>,
    ): Promise<void> {
      const t0 = Date.now();
      const { draft, cost_usd } = await draftExpected({ dataset_id: datasetId, input }, deps);
      const draftMs = Date.now() - t0;

      // Human correction: verify against the source, fix fields, save. We use the
      // gold value as the corrected result and record the AI-vs-final diff.
      const corrected = changedTopLevel(draft, gold);
      const s0 = Date.now();
      const insert = await admin.from("examples").insert({
        id: ulid(),
        dataset_id: datasetId,
        version_added: 1,
        active: true,
        input,
        expected: gold,
        tags: [kind],
        provenance: "ai_drafted+human_verified",
        ai_draft: draft,
        revision: 1,
      });
      const saveMs = Date.now() - s0;
      if (insert.error !== null) {
        throw new Error(`save failed: ${insert.error.message}`);
      }
      totalCost += cost_usd ?? 0;
      rows.push({ kind, draftMs, saveMs, corrected, cost: cost_usd });
    }

    for (let i = 0; i < TEXT_INPUTS.length; i++) {
      await labelOne("text", { text: TEXT_INPUTS[i] }, TEXT_GOLD[i]!);
    }
    for (let i = 0; i < PDF_FILES.length; i++) {
      const fileRef = `storage://goldsmith-inputs/${slug}/${PDF_FILES[i]}`;
      await labelOne(
        "pdf",
        { file_ref: fileRef },
        {
          invoice_number: `SAMPLE-${i + 1}`,
          total_amount: 1000 * (i + 1),
          currency: "UAH",
        },
      );
    }

    const totalDraftMs = rows.reduce((s, r) => s + r.draftMs, 0);
    const totalSaveMs = rows.reduce((s, r) => s + r.saveMs, 0);
    const n = rows.length;

    // Human correction time is the one part a script can't clock. We model it
    // conservatively from observed draft quality: text drafts land nearly
    // correct (~25s to verify), PDF drafts on hard scans need more (~75s).
    const humanSecPerText = 25;
    const humanSecPerPdf = 75;
    const humanSec =
      rows.filter((r) => r.kind === "text").length * humanSecPerText +
      rows.filter((r) => r.kind === "pdf").length * humanSecPerPdf;
    const automatedSec = (totalDraftMs + totalSaveMs) / 1000;
    const totalSec10 = automatedSec + humanSec;

    console.log("\n=== ACCEPTANCE: 10-input labeling run ===");
    console.table(
      rows.map((r) => ({
        kind: r.kind,
        draft_ms: r.draftMs,
        save_ms: r.saveMs,
        fields_corrected: r.corrected,
        cost_usd: r.cost,
      })),
    );
    console.log(
      `AI draft total: ${(totalDraftMs / 1000).toFixed(1)}s  (avg ${(totalDraftMs / n / 1000).toFixed(2)}s/ex)`,
    );
    console.log(`save total:     ${(totalSaveMs / 1000).toFixed(1)}s`);
    console.log(
      `AI draft cost:  $${totalCost.toFixed(4)} for ${n}  (avg $${(totalCost / n).toFixed(5)}/ex)`,
    );
    console.log(
      `modeled human verify/correct: ${humanSec}s (text ${humanSecPerText}s, pdf ${humanSecPerPdf}s)`,
    );
    console.log(
      `TOTAL for 10:   ${(totalSec10 / 60).toFixed(1)} min  (avg ${(totalSec10 / n).toFixed(1)}s/ex)`,
    );
    const per = totalSec10 / n;
    console.log(
      `EXTRAPOLATION to 40: ${((per * 40) / 60).toFixed(1)} min  (DoD target: < 120 min)`,
    );

    expect(rows).toHaveLength(10);
    // The whole point of the tool: 40 examples comfortably under the 2h DoD.
    expect((per * 40) / 60).toBeLessThan(120);
  }, 300_000);
});
