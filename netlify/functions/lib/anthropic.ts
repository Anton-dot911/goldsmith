import Anthropic from "@anthropic-ai/sdk";
import type { CallModelArgs, DraftDeps, ModelResult, Preset } from "./draft.ts";

// The metered Anthropic client and the structured-output call. The draft is
// produced via tool use: a single tool `record_expected` whose input_schema IS
// the dataset's expected-output JSON Schema, forced with tool_choice, at
// temperature 0 (docs/PLAN.md). The tool_use input the model returns is the
// draft. The key never leaves the server (ANTHROPIC_API_KEY, or the shared
// meter-dev METER_ANTHROPIC_API_KEY as a fallback for local runs).

// Default draft model. Haiku 4.5 is what the shared meter-dev project already
// standardized on (see llm_calls), supports tool use AND vision (needed for
// PDF/image extraction inputs), and — unlike the Opus 4.x / Sonnet 5 tiers —
// still accepts `temperature`, which the T5 contract fixes at 0 for
// deterministic drafts. Override with DRAFT_MODEL.
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const TOOL_NAME = "record_expected";

export function makeAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.METER_ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

// Model families that REMOVED the sampling parameters (temperature/top_p/top_k):
// sending `temperature` to them returns a 400. The T5 contract fixes drafts at
// temperature 0, so we send it on the models that still accept it (the default
// Haiku 4.5, plus Sonnet 4.6 / Opus 4.6) and omit it on the newer tiers — which
// keeps DRAFT_MODEL swappable to a stronger vision model without a 400. Those
// tiers are effectively deterministic here anyway: a single forced tool call.
const NO_TEMPERATURE_PREFIXES = [
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-mythos-5",
];

function supportsTemperature(model: string): boolean {
  return !NO_TEMPERATURE_PREFIXES.some((p) => model.startsWith(p));
}

const TEXT_KEYS = ["text", "question", "prompt", "content"] as const;

// A plain-text rendering of a text input for the user turn. Uses the preset's
// natural field (question for routing/qa, text for classification/custom) when
// present, else the whole input as pretty JSON.
function inputToText(input: unknown, _preset: Preset): string {
  if (typeof input === "string") {
    return input;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    for (const key of TEXT_KEYS) {
      if (typeof obj[key] === "string") {
        return obj[key] as string;
      }
    }
  }
  return JSON.stringify(input, null, 2);
}

function buildUserContent(args: CallModelArgs): Anthropic.Messages.ContentBlockParam[] {
  if (args.file !== null) {
    const source = {
      type: "base64" as const,
      media_type: args.file.media_type,
      data: args.file.base64,
    };
    const fileBlock =
      args.file.kind === "document"
        ? ({ type: "document", source } as Anthropic.Messages.ContentBlockParam)
        : ({ type: "image", source } as Anthropic.Messages.ContentBlockParam);
    return [
      fileBlock,
      {
        type: "text",
        text: "Extract the expected fields from this document, following the schema exactly.",
      },
    ];
  }
  return [{ type: "text", text: `Input:\n${inputToText(args.input, args.preset)}` }];
}

export function makeCallModel(client: Anthropic, model: string): DraftDeps["callModel"] {
  return async (args: CallModelArgs): Promise<ModelResult> => {
    const started = Date.now();
    const msg = await client.messages.create({
      model,
      max_tokens: 2048,
      ...(supportsTemperature(model) ? { temperature: 0 } : {}),
      system: args.system,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Record the expected output for this example. The argument must validate against the dataset's expected-output JSON Schema.",
          input_schema: args.schema as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: buildUserContent(args) }],
    });
    const latency = Date.now() - started;

    const block = msg.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    if (block === undefined) {
      throw new Error("model did not return a record_expected tool call");
    }

    return {
      draft: block.input,
      model: msg.model,
      usage: {
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
      },
      request_id: (msg as { _request_id?: string | null })._request_id ?? null,
      latency_ms: latency,
    };
  };
}
