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

// The unlabeled-queue insert (T4 bulk import). An imported input has no
// expected yet. The crucial invariant — an unlabeled row must NEVER leak into
// an export — is carried entirely by `active=false`: the export takes only
// active examples of a version, so it can never emit one, no matter what its
// expected holds. That keeps the export contract and the DDL untouched (no
// migration, no schema change; docs/decisions.md T4).
//
// `expected` is stored as an empty object `{}` (the column is `jsonb not null`,
// so JSON null is not an option) and, together with `active=false`, marks the
// import queue: a not-yet-labeled row is the only inactive row whose expected
// is empty (a real label always has fields — the four presets require them, and
// the ajv save-gate blocks an empty label; the sole corner is a `custom`
// example legitimately labeled `{}` and then deactivated, which would read as
// unlabeled in the queue only — never an export risk). provenance stays
// "human_only" until a human labels it (rule 4; no AI here).
export interface UnlabeledInsert {
  id: string;
  dataset_id: string;
  version_added: number;
  input: unknown;
  expected: Record<string, never>;
  active: false;
  tags: string[];
  provenance: "human_only";
}

export function newUnlabeledInsert(params: {
  dataset_id: string;
  version_added: number;
  input: unknown;
  tags?: string[];
}): UnlabeledInsert {
  return {
    id: newExampleId(),
    dataset_id: params.dataset_id,
    version_added: params.version_added,
    input: params.input,
    expected: {},
    active: false,
    tags: params.tags ?? [],
    provenance: "human_only",
  };
}

function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

// An unlabeled example is the import-queue marker: inactive AND still-empty
// expected. Only affects UI classification (queue ordering, label-vs-revise);
// export-safety rests on `active=false` alone (see above).
export function isUnlabeled(row: ExampleRow): boolean {
  return !row.active && isEmptyObject(row.expected);
}

export interface ExampleEdit {
  input: unknown;
  expected: unknown;
  tags: string[];
}

// Labeling an unlabeled example: its FIRST real save. Sets the human-entered
// input/expected/tags and flips `active` on, leaving `revision` at 1 — this is
// the initial label, not an edit, so it is not a rule-3 revision bump (that is
// what `reviseExample` is for on subsequent edits). Rule 2's ajv save-gate runs
// in the UI before this is called; an unlabeled row is never exported, so it is
// never a valid-but-unvalidated label.
export function labelUnlabeled(
  existing: ExampleRow,
  edit: ExampleEdit,
  now: Date = new Date(),
): ExampleRow {
  return {
    ...existing,
    input: edit.input,
    expected: edit.expected,
    tags: edit.tags,
    active: true,
    updated_at: now.toISOString(),
  };
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
