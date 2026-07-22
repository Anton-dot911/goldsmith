import { describe, expect, it } from "vitest";
import { detectFormat, parseCsv, parseJsonl, textInputKey } from "../src/lib/bulk-import.ts";

describe("textInputKey", () => {
  it("maps presets to their input key (PLAN.md conventions)", () => {
    expect(textInputKey("routing")).toBe("question");
    expect(textInputKey("qa")).toBe("question");
    expect(textInputKey("extraction")).toBe("text");
    expect(textInputKey("classification")).toBe("text");
    expect(textInputKey("custom")).toBe("text");
  });
});

describe("detectFormat", () => {
  it("recognizes csv / jsonl / ndjson", () => {
    expect(detectFormat("inputs.CSV")).toBe("csv");
    expect(detectFormat("inputs.jsonl")).toBe("jsonl");
    expect(detectFormat("inputs.ndjson")).toBe("jsonl");
    expect(detectFormat("inputs.txt")).toBeNull();
  });
});

describe("parseJsonl", () => {
  it("parses bare strings and object inputs, skipping blank lines", () => {
    const text = ['"first"', "", '{"question": "second"}', "   ", '"third"'].join("\n");
    const res = parseJsonl(text, "question");
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { input: { question: "first" } },
      { input: { question: "second" } },
      { input: { question: "third" } },
    ]);
  });

  it("REPORTS malformed lines instead of dropping them, keeping the good ones", () => {
    const text = ['"ok one"', "{not valid json", '"ok two"', "42", '""'].join("\n");
    const res = parseJsonl(text, "text");
    // Two good rows survive.
    expect(res.rows).toEqual([{ input: { text: "ok one" } }, { input: { text: "ok two" } }]);
    // Three problems reported with their 1-based line numbers.
    expect(res.errors.map((e) => e.line)).toEqual([2, 4, 5]);
    expect(res.errors[0]?.message).toMatch(/invalid JSON/);
    expect(res.errors[1]?.message).toMatch(/string or object/);
    expect(res.errors[2]?.message).toMatch(/empty/);
    // Nothing was silently lost: good + bad accounts for every non-blank line.
    expect(res.rows.length + res.errors.length).toBe(5);
  });
});

describe("parseCsv", () => {
  it("uses a header column and parses each data row", () => {
    const text = "question\nwhat is x?\nhow about y?";
    const res = parseCsv(text, "question");
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { input: { question: "what is x?" } },
      { input: { question: "how about y?" } },
    ]);
  });

  it("treats a headerless single column as text inputs", () => {
    const text = "first\nsecond\nthird";
    const res = parseCsv(text, "text");
    expect(res.rows).toEqual([
      { input: { text: "first" } },
      { input: { text: "second" } },
      { input: { text: "third" } },
    ]);
  });

  it("handles quoted fields with commas and picks the named column among many", () => {
    const text = 'id,text,note\n1,"hello, world",x\n2,"line\nbreak",y';
    const res = parseCsv(text, "text");
    expect(res.errors).toEqual([]);
    expect(res.rows).toEqual([
      { input: { text: "hello, world" } },
      { input: { text: "line\nbreak" } },
    ]);
  });

  it("REPORTS empty cells and missing columns instead of dropping rows", () => {
    // Header puts `text` at index 1, so a short row genuinely misses it.
    //   line 2: "1,good"  -> valid
    //   line 3: "2,"      -> empty value
    //   line 4: "3"       -> missing the text column entirely
    const text = "id,text\n1,good\n2,\n3";
    const res = parseCsv(text, "text");
    expect(res.rows).toEqual([{ input: { text: "good" } }]);
    expect(res.errors.some((e) => e.line === 3 && /empty/.test(e.message))).toBe(true);
    expect(res.errors.some((e) => e.line === 4 && /missing column/.test(e.message))).toBe(true);
    // Nothing dropped silently: 1 good + 2 reported == 3 data rows.
    expect(res.rows.length + res.errors.length).toBe(3);
  });
});
