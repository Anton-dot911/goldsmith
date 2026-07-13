import { describe, expect, it } from "vitest";
import { datasetInputSchema, presetSchema } from "../src/index.ts";

describe("presetSchema", () => {
  it("accepts every supported preset", () => {
    for (const p of ["extraction", "routing", "qa", "classification", "custom"]) {
      expect(presetSchema.safeParse(p).success).toBe(true);
    }
  });

  it("rejects an unknown preset", () => {
    expect(presetSchema.safeParse("summarization").success).toBe(false);
  });
});

describe("datasetInputSchema", () => {
  it("accepts a well-formed create payload", () => {
    const payload = {
      slug: "docflow-invoices",
      title: "DocFlow Invoices",
      preset: "extraction",
      json_schema: { type: "object" },
    };
    expect(datasetInputSchema.parse(payload)).toEqual(payload);
  });

  it("rejects an empty slug", () => {
    const bad = {
      slug: "",
      title: "x",
      preset: "qa",
      json_schema: { type: "object" },
    };
    expect(datasetInputSchema.safeParse(bad).success).toBe(false);
  });
});
