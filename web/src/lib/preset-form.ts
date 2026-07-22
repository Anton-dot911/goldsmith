import type { Preset } from "@goldsmith/shared";

// Pure, DOM-free helpers that turn a dataset's JSON Schema into the field
// descriptors the preset renderers draw (CLAUDE.md rule 6: a custom renderer
// for the presets, no generic json-schema-form library). Kept separate from
// the React components so the schema→fields mapping is unit-testable and the
// renderers stay thin.

// A permissive view of the slice of JSON Schema the renderers understand. Real
// schemas carry more keywords; we read only what drives the form and pass the
// rest through untouched.
export interface JsonSchema {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  [keyword: string]: unknown;
}

// How a single property is drawn. "date" is a string with a date/date-time
// format; "array-objects" is a repeatable row group; "array-scalars" a
// repeatable list of primitives; "unknown" falls back to a JSON value editor.
export type FieldKind =
  | "string"
  | "date"
  | "number"
  | "boolean"
  | "object"
  | "array-objects"
  | "array-scalars"
  | "unknown";

export interface FieldShape {
  kind: FieldKind;
  // A field is nullable when its `type` is an array containing "null"
  // (e.g. {"type": ["string", "null"]}); such fields get an explicit null
  // toggle — null is a legitimate expected value in extraction datasets.
  nullable: boolean;
  // Enumerated string options, if the property constrains `enum` (rendered as
  // a select rather than a free text input).
  enumValues?: string[];
  // For array kinds: the schema of one item.
  items?: JsonSchema;
}

export interface FieldDescriptor {
  key: string;
  required: boolean;
  schema: JsonSchema;
}

// Coerce an unknown (a nested `properties`/`items` slot) to a JsonSchema view,
// defaulting to an open object so navigation never throws on a malformed schema.
export function asSchema(value: unknown): JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonSchema)
    : {};
}

// The ordered, named properties of an object schema plus whether each is
// required. Order follows the schema's `properties` declaration order, which is
// preserved by JSON parsing and by our preset schema files.
export function objectFields(schema: JsonSchema): FieldDescriptor[] {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return Object.keys(properties).map((key) => ({
    key,
    required: required.has(key),
    schema: asSchema(properties[key]),
  }));
}

// The non-null primitive type names declared by a property, in order. A missing
// `type` yields [] (kind resolves to "unknown").
function typeNames(schema: JsonSchema): string[] {
  const t = schema.type;
  const list = Array.isArray(t) ? t : t === undefined ? [] : [t];
  return list.filter((name) => name !== "null");
}

export function enumValues(schema: JsonSchema): string[] | undefined {
  if (!Array.isArray(schema.enum)) {
    return undefined;
  }
  return schema.enum.filter((v): v is string => typeof v === "string");
}

// Classify a property schema into the widget the renderer should draw.
export function fieldShape(schema: JsonSchema): FieldShape {
  const t = schema.type;
  const nullable = Array.isArray(t) && t.includes("null");
  const base = typeNames(schema)[0];
  const enums = enumValues(schema);

  let kind: FieldKind;
  switch (base) {
    case "object":
      kind = "object";
      break;
    case "array": {
      const items = asSchema(schema.items);
      kind = typeNames(items)[0] === "object" ? "array-objects" : "array-scalars";
      break;
    }
    case "number":
    case "integer":
      kind = "number";
      break;
    case "boolean":
      kind = "boolean";
      break;
    case "string":
      kind = schema.format === "date" || schema.format === "date-time" ? "date" : "string";
      break;
    default:
      kind = "unknown";
  }

  return {
    kind,
    nullable,
    ...(enums !== undefined ? { enumValues: enums } : {}),
    ...(kind.startsWith("array") ? { items: asSchema(schema.items) } : {}),
  };
}

// An empty value for one item of an array-of-objects row group: every declared
// property present at its type default so a freshly added row renders all its
// inputs. Required-ness is enforced by the ajv gate on save, not here.
export function emptyObject(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, schema: propSchema } of objectFields(schema)) {
    out[key] = emptyValue(propSchema);
  }
  return out;
}

// The starting value for a field the user has just made present (a new row's
// cell, or the non-null side of a null toggle). Mirrors the field's type so the
// value validates on shape as soon as it's filled.
export function emptyValue(schema: JsonSchema): unknown {
  const shape = fieldShape(schema);
  switch (shape.kind) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object":
      return emptyObject(schema);
    case "array-objects":
    case "array-scalars":
      return [];
    default:
      return "";
  }
}

// Immutable object updates used by every renderer so untouched keys — including
// ones the form doesn't draw (e.g. properties under additionalProperties) —
// survive a round-trip unchanged.
export function setKey(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...obj, [key]: value };
}

export function deleteKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _omit, ...rest } = obj;
  return rest;
}

// The initial `expected` for a brand-new example in form mode. Required
// booleans are seeded present (a toggle always has a state); everything else is
// left to the ajv gate to demand. `custom` has no form and starts blank.
export function seedExpected(preset: Preset): Record<string, unknown> {
  switch (preset) {
    case "routing":
      return { routes: [], clarify_ok: false };
    case "qa":
      return { answerable: true, answer: "" };
    case "extraction":
    case "classification":
    case "custom":
    default:
      return {};
  }
}
