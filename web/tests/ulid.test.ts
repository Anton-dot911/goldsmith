import { describe, expect, it } from "vitest";
import { newExampleId, ulid } from "../src/lib/ulid.ts";

// Crockford base32: digits + A–Z minus I, L, O, U.
const ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

describe("ulid", () => {
  it("is 26 Crockford-base32 chars", () => {
    expect(ulid()).toMatch(ULID_RE);
  });

  it("encodes the timestamp in the leading 10 chars (sorts by time)", () => {
    const early = ulid(1_000_000_000_000);
    const late = ulid(2_000_000_000_000);
    // The random tail differs, but the time prefix orders them.
    expect(early.slice(0, 10) < late.slice(0, 10)).toBe(true);
  });

  it("is unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      seen.add(ulid());
    }
    expect(seen.size).toBe(5000);
  });
});

describe("newExampleId", () => {
  it("prefixes a ULID with ex_ (export-contract id shape)", () => {
    const id = newExampleId();
    expect(id.startsWith("ex_")).toBe(true);
    expect(id.slice(3)).toMatch(ULID_RE);
  });

  it("is unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      seen.add(newExampleId());
    }
    expect(seen.size).toBe(5000);
  });
});
