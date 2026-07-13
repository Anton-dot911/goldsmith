import { z } from "zod";

// Shared contract between web/ and netlify/functions/: domain types that cross
// a boundary (HTTP or the Supabase wire) live here as the single source of
// truth. Keep this package dependency-free apart from zod (it ships TS source,
// no build step).

// The five dataset presets. "custom" means a raw pasted JSON Schema with no
// preset default. Mirrors the CHECK constraint in
// supabase/migrations/001_init.sql.
export const PRESETS = ["extraction", "routing", "qa", "classification", "custom"] as const;
export const presetSchema = z.enum(PRESETS);
export type Preset = z.infer<typeof presetSchema>;

// The subset of `datasets` columns the create form supplies. `json_schema` is
// the (parsed) JSON Schema for a dataset's `expected` value.
export const datasetInputSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  preset: presetSchema,
  json_schema: z.record(z.string(), z.unknown()),
});
export type DatasetInput = z.infer<typeof datasetInputSchema>;

// A `datasets` row as returned by Supabase.
export const datasetRowSchema = datasetInputSchema.extend({
  id: z.string(),
  current_version: z.number().int(),
  created_at: z.string(),
});
export type DatasetRow = z.infer<typeof datasetRowSchema>;

// Provenance tag every example carries (rule 4). The AI path (T5) sets
// "ai_drafted+human_verified"; manual adds in T2 are always "human_only".
export const provenanceSchema = z.enum(["human_only", "ai_drafted+human_verified"]);
export type Provenance = z.infer<typeof provenanceSchema>;

// `input` and `expected` are arbitrary JSON values on the wire (jsonb columns).
// Their shape is preset-specific for `input` and gated by the dataset's own
// JSON Schema for `expected` (rule 2) — so at this layer they stay unknown and
// the ajv save-gate is the only thing that constrains `expected`.
export const jsonValueSchema = z.unknown();

// An `examples` row as returned by Supabase. Mirrors the DDL in
// supabase/migrations/001_init.sql. One row per example `id`; edits bump
// `revision` in place (rule 3, see docs/decisions.md).
export const exampleRowSchema = z.object({
  id: z.string(), // "ex_" + ulid, stable across versions (export contract)
  dataset_id: z.string(),
  version_added: z.number().int(),
  active: z.boolean(),
  input: jsonValueSchema,
  expected: jsonValueSchema,
  tags: z.array(z.string()),
  provenance: provenanceSchema,
  ai_draft: jsonValueSchema.nullable(),
  revision: z.number().int(),
  updated_at: z.string(),
  created_at: z.string(),
});
export type ExampleRow = z.infer<typeof exampleRowSchema>;
