import type { ExampleRow } from "@goldsmith/shared";
import { describe, expect, it } from "vitest";
import { labelUnlabeled, reviseExample } from "../src/lib/example-model.ts";

// Rule 4 wiring (T5): the AI pre-label path flips provenance and stores the raw
// draft, while a plain human edit leaves both untouched.
function row(overrides: Partial<ExampleRow> = {}): ExampleRow {
  return {
    id: "ex_01ABCDEFGHJKMNPQRSTVWXYZ00",
    dataset_id: "d1",
    version_added: 1,
    active: false,
    input: { text: "hi" },
    expected: {},
    tags: [],
    provenance: "human_only",
    ai_draft: null,
    revision: 1,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("labelUnlabeled with an AI draft", () => {
  it("marks provenance ai_drafted+human_verified and stores the raw draft", () => {
    const next = labelUnlabeled(row(), {
      input: { text: "hi" },
      expected: { invoice_number: "INV-1", total_amount: 120 },
      tags: [],
      provenance: "ai_drafted+human_verified",
      ai_draft: { invoice_number: "INV-1", total_amount: 100 },
    });
    expect(next.active).toBe(true);
    expect(next.provenance).toBe("ai_drafted+human_verified");
    expect(next.ai_draft).toEqual({ invoice_number: "INV-1", total_amount: 100 });
    // First real save keeps revision at 1 (it's the initial label, not an edit).
    expect(next.revision).toBe(1);
  });

  it("leaves provenance human_only for a plain (no-draft) label", () => {
    const next = labelUnlabeled(row(), {
      input: { text: "hi" },
      expected: { label: "x" },
      tags: [],
    });
    expect(next.provenance).toBe("human_only");
    expect(next.ai_draft).toBeNull();
  });
});

describe("reviseExample preserves AI provenance across later human edits", () => {
  it("keeps the existing provenance and stored draft when the edit omits them", () => {
    const existing = row({
      active: true,
      provenance: "ai_drafted+human_verified",
      ai_draft: { total_amount: 100 },
      expected: { total_amount: 120 },
    });
    const next = reviseExample(existing, {
      input: existing.input,
      expected: { total_amount: 130 },
      tags: [],
    });
    expect(next.revision).toBe(2);
    expect(next.provenance).toBe("ai_drafted+human_verified");
    expect(next.ai_draft).toEqual({ total_amount: 100 });
  });
});
