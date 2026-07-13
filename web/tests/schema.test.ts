import { describe, expect, it } from "vitest";
import { PRESETS } from "@goldsmith/shared";
import { checkSchemaText, presetSchemaText } from "../src/lib/schema.ts";

describe("presetSchemaText", () => {
  it("prefills a valid, non-empty JSON Schema for every preset", () => {
    for (const preset of PRESETS) {
      const text = presetSchemaText(preset);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed.type).toBe("object");
      // Whatever a preset prefills must itself pass the create-time check.
      expect(checkSchemaText(text).valid).toBe(true);
    }
  });

  it("prefills the routing preset with routes + clarify_ok", () => {
    const parsed = JSON.parse(presetSchemaText("routing")) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(parsed.properties)).toEqual(["routes", "clarify_ok"]);
  });

  it("prefills custom with an open object", () => {
    const parsed = JSON.parse(presetSchemaText("custom")) as Record<string, unknown>;
    expect(parsed).toEqual({ type: "object", additionalProperties: true });
  });
});

describe("checkSchemaText", () => {
  it("accepts a valid JSON Schema", () => {
    expect(checkSchemaText('{"type":"object","properties":{"a":{"type":"string"}}}')).toEqual({
      valid: true,
    });
  });

  it("rejects malformed JSON", () => {
    const result = checkSchemaText("{not json}");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/valid JSON/i);
  });

  it("rejects a non-object schema", () => {
    const result = checkSchemaText("[1, 2, 3]");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/object/i);
  });

  it("rejects a structurally invalid JSON Schema", () => {
    // `type` must be a string or array of strings, not a number.
    const result = checkSchemaText('{"type": 123}');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/valid JSON Schema/i);
  });
});
