import { describe, expect, it } from "vitest";
import { changedFields } from "../src/lib/draft-diff.ts";

// The hard-cases signal: which fields the human changed from the AI draft (T5).
describe("changedFields", () => {
  it("returns [] when the final matches the draft exactly", () => {
    const draft = { invoice_number: "INV-1", total_amount: 100 };
    expect(changedFields(draft, { ...draft })).toEqual([]);
  });

  it("ignores key order (canonical comparison)", () => {
    const draft = { a: 1, b: { x: 1, y: 2 } };
    const final = { b: { y: 2, x: 1 }, a: 1 };
    expect(changedFields(draft, final)).toEqual([]);
  });

  it("lists a top-level field the human corrected", () => {
    const draft = { invoice_number: "INV-1", total_amount: 100 };
    const final = { invoice_number: "INV-1", total_amount: 120 };
    expect(changedFields(draft, final)).toEqual(["total_amount"]);
  });

  it("counts an added or removed field as changed", () => {
    expect(changedFields({ a: 1 }, { a: 1, b: 2 })).toEqual(["b"]);
    expect(changedFields({ a: 1, b: 2 }, { a: 1 })).toEqual(["b"]);
  });

  it("detects a nested change under a top-level key", () => {
    const draft = { routes: ["sql"], clarify_ok: false };
    const final = { routes: ["sql", "rag"], clarify_ok: false };
    expect(changedFields(draft, final)).toEqual(["routes"]);
  });

  it("returns [] when there is no draft to compare against", () => {
    expect(changedFields(undefined, { a: 1 })).toEqual([]);
  });
});
