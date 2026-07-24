import { describe, expect, it } from "vitest";
import {
  draftExpected,
  type CallModelArgs,
  type DatasetMeta,
  type DraftDeps,
  type FileContent,
  type MeterRecord,
  type ModelResult,
} from "../functions/lib/draft.ts";

// Mocked-LLM unit tests for the AI pre-label core. No network: a fake DraftDeps
// records what draftExpected wired together (schema, prompt, file) and returns a
// canned ModelResult, so we assert the schema/tool wiring, the metering, and the
// error path without hitting Anthropic or Supabase.

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: { invoice_number: { type: "string" }, total_amount: { type: "number" } },
  required: ["invoice_number", "total_amount"],
} as const;

function dataset(overrides: Partial<DatasetMeta> = {}): DatasetMeta {
  return {
    id: "ds-1",
    slug: "docflow-invoices",
    preset: "extraction",
    json_schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    current_version: 1,
    ...overrides,
  };
}

interface Recorder {
  calls: CallModelArgs[];
  meters: MeterRecord[];
  prompts: string[];
  fetched: string[];
}

function makeDeps(
  ds: DatasetMeta,
  modelResult: ModelResult | (() => Promise<ModelResult>),
  opts: { model?: string; file?: FileContent } = {},
): { deps: DraftDeps; rec: Recorder } {
  const rec: Recorder = { calls: [], meters: [], prompts: [], fetched: [] };
  const deps: DraftDeps = {
    model: opts.model ?? "claude-haiku-4-5-20251001",
    loadDataset: async () => ds,
    loadPrompt: async (preset) => {
      rec.prompts.push(preset);
      return `PROMPT for ${preset}`;
    },
    fetchFile: async (ref) => {
      rec.fetched.push(ref);
      return opts.file ?? { kind: "document", media_type: "application/pdf", base64: "AAAA" };
    },
    callModel: async (args) => {
      rec.calls.push(args);
      return typeof modelResult === "function" ? await modelResult() : modelResult;
    },
    meter: async (record) => {
      rec.meters.push(record);
    },
  };
  return { deps, rec };
}

const okResult: ModelResult = {
  draft: { invoice_number: "INV-1", total_amount: 42 },
  model: "claude-haiku-4-5-20251001",
  usage: { input_tokens: 1000, output_tokens: 50 },
  request_id: "req_test",
  latency_ms: 123,
};

describe("draftExpected — schema + prompt wiring", () => {
  it("passes the dataset schema and preset prompt to the model and returns the draft", async () => {
    const ds = dataset();
    const { deps, rec } = makeDeps(ds, okResult);

    const out = await draftExpected({ dataset_id: "ds-1", input: { text: "hi" } }, deps);

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!.schema).toBe(ds.json_schema);
    expect(rec.calls[0]!.system).toBe("PROMPT for extraction");
    expect(rec.calls[0]!.preset).toBe("extraction");
    expect(out.draft).toEqual({ invoice_number: "INV-1", total_amount: 42 });
    expect(out.model).toBe("claude-haiku-4-5-20251001");
  });

  it("computes cost_usd from usage and the model price table", async () => {
    const { deps } = makeDeps(dataset(), okResult);
    const out = await draftExpected({ dataset_id: "ds-1", input: { text: "hi" } }, deps);
    // 1000/1e6*1.0 + 50/1e6*5.0 = 0.001 + 0.00025 = 0.00125
    expect(out.cost_usd).toBeCloseTo(0.00125, 8);
  });

  it("reports cost_usd null for an unpriced model", async () => {
    const { deps } = makeDeps(dataset(), { ...okResult, model: "some-unknown-model" });
    const out = await draftExpected({ dataset_id: "ds-1", input: { text: "hi" } }, deps);
    expect(out.cost_usd).toBeNull();
  });
});

describe("draftExpected — metering (rule 5)", () => {
  it("records one ok meter row scoped to project goldsmith / component draft_<preset>", async () => {
    const { deps, rec } = makeDeps(dataset({ preset: "routing" }), {
      ...okResult,
      draft: { routes: ["sql"], clarify_ok: false },
    });
    await draftExpected({ dataset_id: "ds-1", input: { question: "q" } }, deps);

    expect(rec.meters).toHaveLength(1);
    const m = rec.meters[0]!;
    expect(m.project).toBe("goldsmith");
    expect(m.component).toBe("draft_routing");
    expect(m.status).toBe("ok");
    expect(m.tokens_in).toBe(1000);
    expect(m.tokens_out).toBe(50);
    expect(m.request_id).toBe("req_test");
  });

  it("a meter insert failure does not sink an already-produced draft", async () => {
    const ds = dataset();
    const { deps } = makeDeps(ds, okResult);
    deps.meter = async () => {
      throw new Error("llm_calls insert blew up");
    };
    const out = await draftExpected({ dataset_id: "ds-1", input: { text: "hi" } }, deps);
    expect(out.draft).toEqual({ invoice_number: "INV-1", total_amount: 42 });
  });
});

describe("draftExpected — file inputs (extraction)", () => {
  it("fetches a file_ref input server-side and forwards it to the model", async () => {
    const file: FileContent = { kind: "document", media_type: "application/pdf", base64: "PDF64" };
    const { deps, rec } = makeDeps(dataset(), okResult, { file });

    await draftExpected(
      { dataset_id: "ds-1", input: { file_ref: "storage://goldsmith-inputs/x/y.pdf" } },
      deps,
    );

    expect(rec.fetched).toEqual(["storage://goldsmith-inputs/x/y.pdf"]);
    expect(rec.calls[0]!.file).toEqual(file);
  });

  it("does not fetch a file for a text extraction input", async () => {
    const { deps, rec } = makeDeps(dataset(), okResult);
    await draftExpected({ dataset_id: "ds-1", input: { text: "plain text" } }, deps);
    expect(rec.fetched).toEqual([]);
    expect(rec.calls[0]!.file).toBeNull();
  });

  it("does not fetch a file for a non-extraction preset even with a file_ref", async () => {
    const { deps, rec } = makeDeps(dataset({ preset: "qa" }), {
      ...okResult,
      draft: { answerable: true, answer: "a" },
    });
    await draftExpected({ dataset_id: "ds-1", input: { file_ref: "storage://x/y.pdf" } }, deps);
    expect(rec.fetched).toEqual([]);
  });
});

describe("draftExpected — error path", () => {
  it("records an error meter row and rethrows when the model call fails", async () => {
    const { deps, rec } = makeDeps(dataset(), () => Promise.reject(new TypeError("model down")));

    await expect(
      draftExpected({ dataset_id: "ds-1", input: { text: "hi" } }, deps),
    ).rejects.toThrow("model down");

    expect(rec.meters).toHaveLength(1);
    const m = rec.meters[0]!;
    expect(m.status).toBe("error");
    expect(m.error_type).toBe("TypeError");
    expect(m.component).toBe("draft_extraction");
    expect(m.model).toBe("claude-haiku-4-5-20251001");
    expect(m.cost_usd).toBeNull();
  });
});
