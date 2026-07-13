import type { ExampleRow } from "@goldsmith/shared";
import { describe, expect, it } from "vitest";
import {
  activeExamples,
  newExampleInsert,
  reviseExample,
  setActive,
} from "../src/lib/example-model.ts";

function sampleRow(overrides: Partial<ExampleRow> = {}): ExampleRow {
  return {
    id: "ex_01ABCDEFGHJKMNPQRSTVWXYZ00",
    dataset_id: "d1",
    version_added: 1,
    active: true,
    input: { text: "hi" },
    expected: { label: "greeting" },
    tags: ["a"],
    provenance: "human_only",
    ai_draft: null,
    revision: 1,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("newExampleInsert", () => {
  it("stamps a fresh ex_ id, version_added, and human_only provenance", () => {
    const insert = newExampleInsert({
      dataset_id: "d1",
      version_added: 3,
      input: { text: "x" },
      expected: { label: "y" },
      tags: ["scan"],
    });
    expect(insert.id.startsWith("ex_")).toBe(true);
    expect(insert.version_added).toBe(3);
    expect(insert.provenance).toBe("human_only");
    // active / revision / timestamps are left to DDL defaults.
    expect(insert).not.toHaveProperty("active");
    expect(insert).not.toHaveProperty("revision");
  });
});

describe("reviseExample (rule 3: edits create a new revision)", () => {
  it("bumps revision by one and preserves the id", () => {
    const before = sampleRow({ revision: 1 });
    const after = reviseExample(
      before,
      { input: before.input, expected: { label: "fixed" }, tags: before.tags },
      new Date("2026-07-13T01:00:00.000Z"),
    );
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(2);
    expect(after.expected).toEqual({ label: "fixed" });
    expect(after.updated_at).toBe("2026-07-13T01:00:00.000Z");
  });

  it("does not destroy identity/provenance/version fields", () => {
    const before = sampleRow({ version_added: 4, provenance: "human_only" });
    const after = reviseExample(before, {
      input: { text: "changed" },
      expected: before.expected,
      tags: ["b", "c"],
    });
    expect(after.version_added).toBe(4);
    expect(after.provenance).toBe("human_only");
    expect(after.created_at).toBe(before.created_at);
    expect(after.tags).toEqual(["b", "c"]);
  });

  it("compounds across successive edits (1 -> 2 -> 3)", () => {
    let row = sampleRow({ revision: 1 });
    row = reviseExample(row, { input: row.input, expected: row.expected, tags: row.tags });
    row = reviseExample(row, { input: row.input, expected: row.expected, tags: row.tags });
    expect(row.revision).toBe(3);
  });
});

describe("setActive (rule 3: deactivate, never delete)", () => {
  it("deactivate flips active off, keeps the row and its revision", () => {
    const before = sampleRow({ active: true, revision: 2 });
    const after = setActive(before, false, new Date("2026-07-13T02:00:00.000Z"));
    expect(after.active).toBe(false);
    expect(after.id).toBe(before.id);
    expect(after.revision).toBe(2); // toggling visibility is not an edit
    expect(after.expected).toEqual(before.expected);
    expect(after.updated_at).toBe("2026-07-13T02:00:00.000Z");
  });

  it("reactivation is symmetric", () => {
    const off = sampleRow({ active: false });
    expect(setActive(off, true).active).toBe(true);
  });
});

describe("activeExamples", () => {
  it("hides deactivated rows from the active list without removing them", () => {
    const rows = [
      sampleRow({ id: "ex_a", active: true }),
      sampleRow({ id: "ex_b", active: false }),
      sampleRow({ id: "ex_c", active: true }),
    ];
    const active = activeExamples(rows);
    expect(active.map((r) => r.id)).toEqual(["ex_a", "ex_c"]);
    // The deactivated row still exists in the full set (not deleted).
    expect(rows).toHaveLength(3);
  });
});
