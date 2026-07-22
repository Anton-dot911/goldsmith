import type { DatasetRow, ExampleRow } from "@goldsmith/shared";
import { describe, expect, it } from "vitest";
import { buildExportLines, toJsonl } from "../src/lib/export.ts";

// The in-app JSONL download mirrors the CI export contract (the canonical schema
// + reference-reader test lives in the functions package). Here we check the
// browser-side selection and line shape.
const dataset: DatasetRow = {
  id: "d1",
  slug: "docflow-invoices",
  title: "Invoices",
  preset: "extraction",
  json_schema: { type: "object" },
  current_version: 2,
  created_at: "2026-07-22T00:00:00.000Z",
};

function ex(overrides: Partial<ExampleRow>): ExampleRow {
  return {
    id: "ex_01ABCDEFGHJKMNPQRSTVWXYZ00",
    dataset_id: "d1",
    version_added: 1,
    active: true,
    input: { text: "x" },
    expected: { invoice_number: "INV-1", total_amount: 1 },
    tags: [],
    provenance: "human_only",
    ai_draft: null,
    revision: 1,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildExportLines", () => {
  it("emits active examples with version_added <= version, in contract shape", () => {
    const rows = [
      ex({ id: "ex_a", active: true, version_added: 1 }),
      ex({ id: "ex_b", active: false, version_added: 1 }), // inactive -> excluded
      ex({ id: "ex_c", active: true, version_added: 2 }),
      ex({ id: "ex_d", active: true, version_added: 3 }), // future version -> excluded
    ];
    const lines = buildExportLines(dataset, rows, 2);
    expect(lines.map((l) => l.id)).toEqual(["ex_a", "ex_c"]);
    expect(lines[0]).toEqual({
      id: "ex_a",
      input: { text: "x" },
      expected: { invoice_number: "INV-1", total_amount: 1 },
      tags: [],
      provenance: "human_only",
      dataset: "docflow-invoices",
      dataset_version: 2,
    });
  });

  it("toJsonl is one object per line with a trailing newline (empty -> '')", () => {
    const lines = buildExportLines(dataset, [ex({ id: "ex_a" })], 2);
    const jsonl = toJsonl(lines);
    expect(jsonl.endsWith("\n")).toBe(true);
    expect(jsonl.trim().split("\n")).toHaveLength(1);
    expect(toJsonl([])).toBe("");
  });
});
