import type { ExampleRow } from "@goldsmith/shared";
import { newExampleId } from "./ulid.ts";

// Pure business rules for examples, kept out of the Supabase data layer so the
// rules (rule 3: revisions + deactivate, never destroy) are unit-testable
// without a database. lib/examples.ts translates these into wire calls.

export interface NewExampleParams {
  dataset_id: string;
  // Stamped from the dataset's current_version (export-contract `version_added`).
  version_added: number;
  input: unknown;
  expected: unknown;
  tags: string[];
}

// The insert payload for a brand-new example. Manual adds are always
// "human_only" (rule 4; the AI path arrives in T5). `active`, `revision`,
// `ai_draft`, and the timestamps are left to the DDL defaults
// (active=true, revision=1, ai_draft=null, now()).
export interface ExampleInsert {
  id: string;
  dataset_id: string;
  version_added: number;
  input: unknown;
  expected: unknown;
  tags: string[];
  provenance: "human_only";
}

export function newExampleInsert(params: NewExampleParams): ExampleInsert {
  return {
    id: newExampleId(),
    dataset_id: params.dataset_id,
    version_added: params.version_added,
    input: params.input,
    expected: params.expected,
    tags: params.tags,
    provenance: "human_only",
  };
}

export interface ExampleEdit {
  input: unknown;
  expected: unknown;
  tags: string[];
}

// Rule 3: editing an example creates a NEW revision of the SAME id — one row,
// revision+1, fields replaced, updated_at bumped. id, version_added,
// provenance, created_at, and active are preserved. Returns the full revised
// row; the data layer sends only the changed columns.
export function reviseExample(
  existing: ExampleRow,
  edit: ExampleEdit,
  now: Date = new Date(),
): ExampleRow {
  return {
    ...existing,
    input: edit.input,
    expected: edit.expected,
    tags: edit.tags,
    revision: existing.revision + 1,
    updated_at: now.toISOString(),
  };
}

// Rule 3: "delete" never removes a row — it flips `active` off. Reactivation is
// the same operation with `active` on. Neither touches `revision`: toggling
// visibility is not an edit of the labeled value.
export function setActive(
  existing: ExampleRow,
  active: boolean,
  now: Date = new Date(),
): ExampleRow {
  return { ...existing, active, updated_at: now.toISOString() };
}

// The export takes active examples of the chosen dataset version; the detail
// page's active count and default filter use the same predicate.
export function activeExamples(rows: ExampleRow[]): ExampleRow[] {
  return rows.filter((r) => r.active);
}
