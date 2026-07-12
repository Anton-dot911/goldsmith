import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import type { Preset } from "@goldsmith/shared";
import classification from "@spec/presets/classification.schema.json";
import extraction from "@spec/presets/extraction.schema.json";
import qa from "@spec/presets/qa.schema.json";
import routing from "@spec/presets/routing.schema.json";

// Registry of preset -> default `expected` JSON Schema, sourced from
// spec/presets/*.schema.json (the canonical location). `custom` has no preset
// default: the user pastes their own schema.
const PRESET_SCHEMAS: Record<Exclude<Preset, "custom">, unknown> = {
  extraction,
  routing,
  qa,
  classification,
};

// The default schema text the create form prefills for a chosen preset,
// pretty-printed and editable. `custom` starts from a minimal open object.
export function presetSchemaText(preset: Preset): string {
  const schema =
    preset === "custom" ? { type: "object", additionalProperties: true } : PRESET_SCHEMAS[preset];
  return JSON.stringify(schema, null, 2);
}

// A fresh Ajv used only to check that a pasted schema is itself a valid JSON
// Schema (rule: ajv validation of the schema on create). strict:false so
// exotic-but-legal schemas aren't rejected over strict-mode warnings; formats
// are registered so "format" keywords compile.
function newAjv(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

export interface SchemaCheck {
  valid: boolean;
  error?: string;
}

// Parse `text` as JSON and compile it as a JSON Schema. Returns the reason on
// failure so the create dialog can show it. An invalid schema cannot be saved.
export function checkSchemaText(text: string): SchemaCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return { valid: false, error: `Not valid JSON: ${(cause as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Schema must be a JSON object" };
  }
  try {
    newAjv().compile(parsed as AnySchema);
    return { valid: true };
  } catch (cause) {
    return { valid: false, error: `Not a valid JSON Schema: ${(cause as Error).message}` };
  }
}
