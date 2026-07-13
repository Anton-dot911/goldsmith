import { describe, expect, it } from "vitest";
import { validateExpected } from "../src/lib/validate.ts";

// The ajv save-gate (rule 2). A dataset-shaped schema: `amount` (number) is
// required, `currency` (string) is optional; no extra properties allowed.
const schema = {
  type: "object",
  properties: {
    amount: { type: "number" },
    currency: { type: "string" },
  },
  required: ["amount"],
  additionalProperties: false,
} as const;

describe("validateExpected", () => {
  it("passes a valid expected value", () => {
    const result = validateExpected(schema, { amount: 42, currency: "USD" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("blocks a missing required field with a readable error at that path", () => {
    const result = validateExpected(schema, { currency: "USD" });
    expect(result.valid).toBe(false);
    // The path folds in the missing property name (rule: path + message).
    const err = result.errors.find((e) => e.path === "amount");
    expect(err).toBeDefined();
    expect(err?.message).toMatch(/required/i);
  });

  it("blocks a wrong-typed field with the offending path", () => {
    const result = validateExpected(schema, { amount: "not-a-number" });
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.path === "amount");
    expect(err).toBeDefined();
    expect(err?.message).toMatch(/number/i);
  });

  it("blocks an unexpected extra property, naming it in the path", () => {
    const result = validateExpected(schema, { amount: 1, bogus: true });
    expect(result.valid).toBe(false);
    const err = result.errors.find((e) => e.path === "bogus");
    expect(err).toBeDefined();
  });

  it("reports every problem at once (allErrors)", () => {
    const result = validateExpected(schema, { currency: 5, bogus: true });
    // missing amount + currency wrong type + extra property = 3 distinct errors.
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("distinguishes null from missing: null is present-but-wrong-type, not missing", () => {
    // Missing `amount` -> a `required` error (the property is absent).
    const missing = validateExpected(schema, {});
    const missingErr = missing.errors.find((e) => e.path === "amount");
    expect(missingErr?.message).toMatch(/required/i);

    // `amount: null` -> a `type` error (the property is present, but null is
    // not a number). It is NOT reported as a missing required property.
    const asNull = validateExpected(schema, { amount: null });
    expect(asNull.valid).toBe(false);
    const nullErr = asNull.errors.find((e) => e.path === "amount");
    expect(nullErr).toBeDefined();
    expect(nullErr?.message).toMatch(/number/i);
    expect(nullErr?.message).not.toMatch(/required/i);
    // And there is no separate "required" complaint about amount.
    expect(asNull.errors.some((e) => e.message.match(/required/i))).toBe(false);
  });

  it("renders errors as path+message rows, never a raw JSON dump", () => {
    const result = validateExpected(schema, { currency: 5 });
    for (const e of result.errors) {
      expect(typeof e.path).toBe("string");
      expect(typeof e.message).toBe("string");
      expect(e.path.length).toBeGreaterThan(0);
    }
  });
});
