import { exampleRowSchema, type ExampleRow } from "@goldsmith/shared";
import {
  newExampleInsert,
  reviseExample,
  setActive,
  type ExampleEdit,
  type NewExampleParams,
} from "./example-model.ts";
import { supabase } from "./supabase.ts";

// Data access for the `examples` table. Like datasets.ts, the browser talks to
// Supabase directly (anon key + RLS). The revisioning/active rules live in
// example-model.ts; this file only maps them onto wire calls.

const COLUMNS =
  "id, dataset_id, version_added, active, input, expected, tags, provenance, ai_draft, revision, updated_at, created_at";

export async function listExamples(datasetId: string): Promise<ExampleRow[]> {
  const { data, error } = await supabase
    .from("examples")
    .select(COLUMNS)
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false });
  if (error !== null) {
    throw new Error(error.message);
  }
  return exampleRowSchema.array().parse(data);
}

export async function addExample(params: NewExampleParams): Promise<ExampleRow> {
  const { data, error } = await supabase
    .from("examples")
    .insert(newExampleInsert(params))
    .select(COLUMNS)
    .single();
  if (error !== null) {
    throw new Error(error.message);
  }
  return exampleRowSchema.parse(data);
}

// Rule 3: an edit is a new revision of the same id. We compute the revised row
// with the pure model, then persist only the columns it changes (revision +
// updated_at are set explicitly — the DDL's now() default fires on insert, not
// update).
export async function editExample(existing: ExampleRow, edit: ExampleEdit): Promise<ExampleRow> {
  const revised = reviseExample(existing, edit);
  const { data, error } = await supabase
    .from("examples")
    .update({
      input: revised.input,
      expected: revised.expected,
      tags: revised.tags,
      revision: revised.revision,
      updated_at: revised.updated_at,
    })
    .eq("id", existing.id)
    .select(COLUMNS)
    .single();
  if (error !== null) {
    throw new Error(error.message);
  }
  return exampleRowSchema.parse(data);
}

// Rule 3: deactivate / reactivate — never a delete.
export async function setExampleActive(existing: ExampleRow, active: boolean): Promise<ExampleRow> {
  const next = setActive(existing, active);
  const { data, error } = await supabase
    .from("examples")
    .update({ active: next.active, updated_at: next.updated_at })
    .eq("id", existing.id)
    .select(COLUMNS)
    .single();
  if (error !== null) {
    throw new Error(error.message);
  }
  return exampleRowSchema.parse(data);
}
