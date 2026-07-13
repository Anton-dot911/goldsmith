import { describe, expect, it } from "vitest";
import { slugify } from "../src/lib/slug.ts";

describe("slugify", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugify("DocFlow Invoices")).toBe("docflow-invoices");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("SQL  router / v2!!")).toBe("sql-router-v2");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Hello, World--  ")).toBe("hello-world");
  });

  it("strips Latin diacritics", () => {
    expect(slugify("Café Menu")).toBe("cafe-menu");
  });

  it("returns empty for a title with no Latin alphanumerics", () => {
    expect(slugify("Рахунок")).toBe("");
  });
});
