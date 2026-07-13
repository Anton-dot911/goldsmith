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

// Provenance tag every example carries (rule 4). Not used until T2, but it is
// part of the wire contract, so it lives here.
export const provenanceSchema = z.enum(["human_only", "ai_drafted+human_verified"]);
export type Provenance = z.infer<typeof provenanceSchema>;
