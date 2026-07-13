import Ajv, { type AnySchema, type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

// The save-gate for `expected` (CLAUDE.md rule 2): every example is validated
// against its dataset's JSON Schema on save, and invalid expected-output cannot
// be saved. This module turns ajv's raw errors into human-readable rows
// (path + message) so the form can render them instead of dumping JSON.

// Same ajv configuration as lib/schema.ts (strict:false so exotic-but-legal
// schemas compile; formats registered). allErrors so the user sees every
// problem at once rather than fixing them one round-trip at a time.
function newAjv(): Ajv {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

export interface ReadableError {
  // Dotted instance path to the offending value, e.g. "amount" or
  // "lines.0.qty"; "(root)" for a problem with the top-level value itself.
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ReadableError[];
}

// Turn one ajv ErrorObject into a { path, message } pair. For `required` and
// `additionalProperties` ajv reports the *parent* as the instance path and
// names the property in params; we fold that name into the path so the error
// points at the actual field (a missing `amount` reads as path "amount", not
// "(root)").
function toReadable(err: ErrorObject): ReadableError {
  let instancePath = err.instancePath;
  const params = err.params as Record<string, unknown>;
  if (err.keyword === "required" && typeof params.missingProperty === "string") {
    instancePath = `${instancePath}/${params.missingProperty}`;
  } else if (
    err.keyword === "additionalProperties" &&
    typeof params.additionalProperty === "string"
  ) {
    instancePath = `${instancePath}/${params.additionalProperty}`;
  }
  const path = instancePath === "" ? "(root)" : instancePath.replace(/^\//, "").replace(/\//g, ".");
  return { path, message: err.message ?? "is invalid" };
}

// Validate `value` against `schema` (the dataset's json_schema). `schema` was
// already compile-checked at dataset creation (lib/schema.ts), so a compile
// failure here is surfaced as a single (root) error rather than thrown, to keep
// the save path from crashing on a legacy/exotic schema.
export function validateExpected(schema: unknown, value: unknown): ValidationResult {
  let validate;
  try {
    validate = newAjv().compile(schema as AnySchema);
  } catch (cause) {
    return {
      valid: false,
      errors: [{ path: "(root)", message: `dataset schema is not compilable: ${String(cause)}` }],
    };
  }
  if (validate(value)) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: (validate.errors ?? []).map(toReadable),
  };
}
