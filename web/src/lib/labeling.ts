import type { ExampleRow } from "@goldsmith/shared";
import { isUnlabeled } from "./example-model.ts";

// Pure ordering + navigation for the two-pane label queue (T4). Kept DOM-free
// so "unlabeled-first" and "save-and-next advances correctly" are unit-testable
// without React.

// Unlabeled-first ordering: examples that still need a label come first, then
// labeled ones, each group keeping its incoming (stable) order. The label page
// snapshots this once on load and then walks it by index, so a save that turns
// an unlabeled row into a labeled one does not reshuffle the queue under the
// cursor.
export function orderForLabeling(rows: ExampleRow[]): ExampleRow[] {
  const unlabeled: ExampleRow[] = [];
  const labeled: ExampleRow[] = [];
  for (const row of rows) {
    (isUnlabeled(row) ? unlabeled : labeled).push(row);
  }
  return [...unlabeled, ...labeled];
}

// The index of the first example still needing a label, or 0 when there is none
// (an all-labeled queue opens at the top).
export function firstUnlabeledIndex(ordered: ExampleRow[]): number {
  const idx = ordered.findIndex(isUnlabeled);
  return idx === -1 ? 0 : idx;
}

// Save-and-next / arrow navigation. Clamped at the ends: advancing past the
// last example stays on it (the primary action stops rather than wrapping), and
// going back from the first stays on the first.
export function nextIndex(current: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return Math.min(current + 1, length - 1);
}

export function prevIndex(current: number): number {
  return Math.max(current - 1, 0);
}
