import { describe, expect, it } from "vitest";
import {
  emptyObject,
  emptyValue,
  enumValues,
  fieldShape,
  objectFields,
  seedExpected,
  type JsonSchema,
} from "../src/lib/preset-form.ts";

describe("objectFields", () => {
  it("lists properties in declaration order with required flags", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["b"],
    };
    expect(objectFields(schema).map((f) => [f.key, f.required])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });
});

describe("fieldShape", () => {
  it("maps primitive types to widget kinds", () => {
    expect(fieldShape({ type: "string" }).kind).toBe("string");
    expect(fieldShape({ type: "string", format: "date" }).kind).toBe("date");
    expect(fieldShape({ type: "number" }).kind).toBe("number");
    expect(fieldShape({ type: "integer" }).kind).toBe("number");
    expect(fieldShape({ type: "boolean" }).kind).toBe("boolean");
    expect(fieldShape({ type: "object" }).kind).toBe("object");
  });

  it("distinguishes arrays of objects from arrays of scalars", () => {
    expect(fieldShape({ type: "array", items: { type: "object" } }).kind).toBe("array-objects");
    expect(fieldShape({ type: "array", items: { type: "string" } }).kind).toBe("array-scalars");
  });

  it("flags a union with null as nullable and picks the non-null base type", () => {
    const shape = fieldShape({ type: ["string", "null"] });
    expect(shape.nullable).toBe(true);
    expect(shape.kind).toBe("string");
  });

  it("surfaces string enums", () => {
    const shape = fieldShape({ type: "string", enum: ["a", "b"] });
    expect(shape.enumValues).toEqual(["a", "b"]);
  });
});

describe("enumValues", () => {
  it("returns undefined when there is no enum and only string members otherwise", () => {
    expect(enumValues({ type: "string" })).toBeUndefined();
    expect(enumValues({ enum: ["x", 1, "y"] })).toEqual(["x", "y"]);
  });
});

describe("emptyValue / emptyObject", () => {
  it("mirrors the field type", () => {
    expect(emptyValue({ type: "number" })).toBe(0);
    expect(emptyValue({ type: "boolean" })).toBe(false);
    expect(emptyValue({ type: "string" })).toBe("");
    expect(emptyValue({ type: "array", items: { type: "object" } })).toEqual([]);
  });

  it("seeds every declared property of a row object", () => {
    const item: JsonSchema = {
      type: "object",
      properties: { sku: { type: "string" }, qty: { type: "number" } },
    };
    expect(emptyObject(item)).toEqual({ sku: "", qty: 0 });
  });
});

describe("seedExpected", () => {
  it("seeds required booleans/arrays present for form presets", () => {
    expect(seedExpected("routing")).toEqual({ routes: [], clarify_ok: false });
    expect(seedExpected("qa")).toEqual({ answerable: true, answer: "" });
    expect(seedExpected("extraction")).toEqual({});
    expect(seedExpected("classification")).toEqual({});
    expect(seedExpected("custom")).toEqual({});
  });
});
