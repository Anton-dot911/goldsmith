import { describe, expect, it } from "vitest";
import type { ExampleRow } from "@goldsmith/shared";
import { isUnlabeled, labelUnlabeled } from "../src/lib/example-model.ts";
import {
  firstUnlabeledIndex,
  nextIndex,
  orderForLabeling,
  prevIndex,
} from "../src/lib/labeling.ts";

function row(id: string, over: Partial<ExampleRow> = {}): ExampleRow {
  return {
    id,
    dataset_id: "d1",
    version_added: 1,
    active: true,
    input: { text: id },
    expected: { label: "x" },
    tags: [],
    provenance: "human_only",
    ai_draft: null,
    revision: 1,
    updated_at: "2026-07-22T00:00:00.000Z",
    created_at: "2026-07-22T00:00:00.000Z",
    ...over,
  };
}

// An unlabeled queue row: inactive + empty expected (as newUnlabeledInsert makes).
function unlabeled(id: string): ExampleRow {
  return row(id, { active: false, expected: {} });
}

describe("isUnlabeled", () => {
  it("is true only for inactive + empty-expected rows", () => {
    expect(isUnlabeled(unlabeled("a"))).toBe(true);
    // A labeled-but-deactivated row is NOT unlabeled (expected has fields).
    expect(isUnlabeled(row("b", { active: false }))).toBe(false);
    // An active row is never in the queue.
    expect(isUnlabeled(row("c"))).toBe(false);
    // An active row with empty expected is not in the queue either.
    expect(isUnlabeled(row("d", { active: true, expected: {} }))).toBe(false);
  });
});

describe("orderForLabeling — unlabeled first", () => {
  it("puts unlabeled rows before labeled, stable within each group", () => {
    const rows = [row("labeled-1"), unlabeled("unl-1"), row("labeled-2"), unlabeled("unl-2")];
    const ordered = orderForLabeling(rows);
    expect(ordered.map((r) => r.id)).toEqual(["unl-1", "unl-2", "labeled-1", "labeled-2"]);
  });

  it("first unlabeled index is the top of the queue, else 0", () => {
    const ordered = orderForLabeling([row("l1"), unlabeled("u1")]);
    expect(firstUnlabeledIndex(ordered)).toBe(0);
    expect(firstUnlabeledIndex([row("l1"), row("l2")])).toBe(0);
  });
});

describe("save-and-next advances correctly", () => {
  it("nextIndex moves forward and clamps at the last example", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
    expect(nextIndex(2, 3)).toBe(2); // clamp, does not wrap
    expect(nextIndex(0, 0)).toBe(0); // empty queue
  });

  it("prevIndex moves back and clamps at the first example", () => {
    expect(prevIndex(2)).toBe(1);
    expect(prevIndex(0)).toBe(0);
  });

  it("labeling a queued row makes it labeled in place, so the cursor advances past it", () => {
    // Snapshot queue: [unl-1, unl-2, labeled]. Label the first, advance.
    const queue = orderForLabeling([row("labeled"), unlabeled("unl-1"), unlabeled("unl-2")]);
    expect(queue.map((r) => r.id)).toEqual(["unl-1", "unl-2", "labeled"]);

    let index = firstUnlabeledIndex(queue); // 0
    const saved = labelUnlabeled(queue[index] as ExampleRow, {
      input: { text: "unl-1" },
      expected: { label: "done" },
      tags: [],
    });
    // In place: now active, still at revision 1, no longer unlabeled.
    expect(saved.active).toBe(true);
    expect(saved.revision).toBe(1);
    expect(isUnlabeled(saved)).toBe(false);

    // Snapshot ordering keeps unl-1's position; save-and-next lands on unl-2.
    const updated = queue.map((r) => (r.id === saved.id ? saved : r));
    index = nextIndex(index, updated.length);
    expect(index).toBe(1);
    expect(updated[index]?.id).toBe("unl-2");
    expect(isUnlabeled(updated[index] as ExampleRow)).toBe(true);
  });
});
