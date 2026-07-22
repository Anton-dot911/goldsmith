// Pure core of the AI pre-label flow (T5). All I/O — the model call, Supabase
// reads, metering, prompt/file loading — is injected via `DraftDeps`, so the
// wiring (real Anthropic + Supabase clients) lives in deps.ts and the unit
// tests can drive this with fakes. The one hard rule this encodes: every draft
// is metered (CLAUDE.md rule 5), and the draft is never auto-confirmed — this
// only proposes an `expected`; a human save is always required (rule 4).

import { costUsd } from "./prices.ts";

export type Preset = "extraction" | "routing" | "qa" | "classification" | "custom";

export const PRESETS: readonly Preset[] = [
  "extraction",
  "routing",
  "qa",
  "classification",
  "custom",
];

export function isPreset(value: unknown): value is Preset {
  return typeof value === "string" && (PRESETS as readonly string[]).includes(value);
}

export interface DatasetMeta {
  id: string;
  slug: string;
  preset: Preset;
  json_schema: Record<string, unknown>;
  current_version: number;
}

// A file input fetched server-side and shaped for a Claude content block.
export interface FileContent {
  // "document" for PDFs (Claude reads them natively); "image" for png/jpg/etc.
  kind: "document" | "image";
  media_type: string;
  base64: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelResult {
  // The tool_use input the model produced — the drafted `expected`.
  draft: unknown;
  // The model id the API actually served (echoed back for the meter row).
  model: string;
  usage: Usage;
  request_id: string | null;
  latency_ms: number;
}

export interface CallModelArgs {
  system: string;
  schema: Record<string, unknown>;
  preset: Preset;
  input: unknown;
  file: FileContent | null;
}

// Mirrors the shared meter-dev project's `llm_calls` columns.
export interface MeterRecord {
  project: string;
  component: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  latency_ms: number;
  status: "ok" | "error";
  error_type: string | null;
  request_id: string | null;
}

export interface DraftDeps {
  // The model that will be used; also stamped on the error meter row when the
  // call fails before the API echoes a model back.
  model: string;
  loadDataset(datasetId: string): Promise<DatasetMeta>;
  loadPrompt(preset: Preset): Promise<string>;
  fetchFile(fileRef: string): Promise<FileContent>;
  callModel(args: CallModelArgs): Promise<ModelResult>;
  meter(record: MeterRecord): Promise<void>;
}

export interface DraftRequest {
  dataset_id: string;
  input: unknown;
}

export interface DraftResponse {
  draft: unknown;
  model: string;
  cost_usd: number | null;
}

function isFileRefInput(input: unknown): input is { file_ref: string } {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    typeof (input as Record<string, unknown>).file_ref === "string"
  );
}

// Metering must never sink a draft the model already produced (and that we
// already paid for): a failed insert into llm_calls is logged, not thrown.
async function safeMeter(deps: DraftDeps, record: MeterRecord): Promise<void> {
  try {
    await deps.meter(record);
  } catch (cause) {
    console.warn(`meter insert failed (${record.component}): ${String(cause)}`);
  }
}

// POST {dataset_id, input} -> {draft, model, cost_usd}. Loads the dataset
// schema, picks the preset prompt, fetches a file input server-side for
// extraction datasets, calls the model with structured output (tool use bound
// to the dataset schema, temperature 0), meters the call, and returns the draft
// for a human to verify. It never writes the example — saving is the human's.
export async function draftExpected(req: DraftRequest, deps: DraftDeps): Promise<DraftResponse> {
  const dataset = await deps.loadDataset(req.dataset_id);
  const prompt = await deps.loadPrompt(dataset.preset);
  const component = `draft_${dataset.preset}`;

  // Only extraction inputs carry files; other presets are text-only.
  let file: FileContent | null = null;
  if (dataset.preset === "extraction" && isFileRefInput(req.input)) {
    file = await deps.fetchFile(req.input.file_ref);
  }

  const started = Date.now();
  let result: ModelResult;
  try {
    result = await deps.callModel({
      system: prompt,
      schema: dataset.json_schema,
      preset: dataset.preset,
      input: req.input,
      file,
    });
  } catch (cause) {
    await safeMeter(deps, {
      project: "goldsmith",
      component,
      model: deps.model,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
      latency_ms: Date.now() - started,
      status: "error",
      error_type: cause instanceof Error ? cause.name : "Error",
      request_id: null,
    });
    throw cause;
  }

  const cost = costUsd(result.model, result.usage);
  await safeMeter(deps, {
    project: "goldsmith",
    component,
    model: result.model,
    tokens_in: result.usage.input_tokens,
    tokens_out: result.usage.output_tokens,
    cost_usd: cost,
    latency_ms: result.latency_ms,
    status: "ok",
    error_type: null,
    request_id: result.request_id,
  });

  return { draft: result.draft, model: result.model, cost_usd: cost };
}
