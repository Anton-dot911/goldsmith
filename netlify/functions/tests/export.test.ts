import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import exportSchema from "@spec/export.schema.json";
import {
  assembleExport,
  selectForExport,
  toJsonl,
  type ExampleForExport,
} from "../lib/export-line.ts";

// The export contract test (CLAUDE.md testing conventions): a fixture dataset ->
// export -> every line validates against spec/export.schema.json AND parses with
// the exact reference reader snippet other repos copy (docs/PLAN.md). Both halves
// run: ajv for the schema, and python3 for the reader.

// The reference reader, verbatim from docs/PLAN.md — this is the snippet
// consumer repos paste into their eval scripts, so the test exercises it as-is.
const REFERENCE_READER = `
import json, sys
def load_golden(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]
rows = load_golden(sys.argv[1])
print(len(rows))
for r in rows:
    print("|".join(sorted(r.keys())))
`;

// A fixture spanning presets, a deactivated row, an unlabeled import-queue row,
// and a later-version row — so the version/active selection is exercised.
const FIXTURE: ExampleForExport[] = [
  {
    id: "ex_01J000000000000000000000A1",
    input: { file_ref: "storage://goldsmith-inputs/docflow/a.pdf" },
    expected: { invoice_number: "INV-1", total_amount: 100 },
    tags: ["scan", "multipage"],
    provenance: "ai_drafted+human_verified",
    active: true,
    version_added: 1,
  },
  {
    id: "ex_01J000000000000000000000A2",
    input: { text: "raw invoice text" },
    expected: { invoice_number: "INV-2", total_amount: 50 },
    tags: [],
    provenance: "human_only",
    active: true,
    version_added: 1,
  },
  {
    // deactivated — must not appear in export
    id: "ex_01J000000000000000000000A3",
    input: { text: "removed" },
    expected: { invoice_number: "INV-3", total_amount: 0 },
    tags: ["stale"],
    provenance: "human_only",
    active: false,
    version_added: 1,
  },
  {
    // unlabeled import-queue row (active=false, empty expected) — must not appear
    id: "ex_01J000000000000000000000A4",
    input: { file_ref: "storage://goldsmith-inputs/docflow/queued.pdf" },
    expected: {},
    tags: [],
    provenance: "human_only",
    active: false,
    version_added: 1,
  },
  {
    // added at v2 — excluded from a v1 export, included from v2
    id: "ex_01J000000000000000000000A5",
    input: { text: "added later" },
    expected: { invoice_number: "INV-5", total_amount: 5 },
    tags: ["v2"],
    provenance: "human_only",
    active: true,
    version_added: 2,
  },
];

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validateLine = ajv.compile(exportSchema as AnySchema);

describe("export assembly — version + active selection", () => {
  it("v1 export = active examples with version_added <= 1 (no inactive, no unlabeled, no v2)", () => {
    const lines = assembleExport(FIXTURE, "docflow-invoices", 1);
    expect(lines.map((l) => l.id)).toEqual([
      "ex_01J000000000000000000000A1",
      "ex_01J000000000000000000000A2",
    ]);
    for (const line of lines) {
      expect(line.dataset).toBe("docflow-invoices");
      expect(line.dataset_version).toBe(1);
    }
  });

  it("v2 export includes the v2 row too", () => {
    const lines = assembleExport(FIXTURE, "docflow-invoices", 2);
    expect(lines.map((l) => l.id)).toContain("ex_01J000000000000000000000A5");
    expect(lines.every((l) => l.dataset_version === 2)).toBe(true);
  });

  it("never emits an inactive or unlabeled row", () => {
    const selected = selectForExport(FIXTURE, 99);
    expect(selected.some((e) => !e.active)).toBe(false);
    expect(selected.some((e) => e.id === "ex_01J000000000000000000000A4")).toBe(false);
  });
});

describe("export contract — every line validates against export.schema.json", () => {
  it("passes ajv for every line of a v2 export", () => {
    const lines = assembleExport(FIXTURE, "docflow-invoices", 2);
    for (const line of lines) {
      const ok = validateLine(line);
      if (!ok) {
        throw new Error(`line ${line.id} failed schema: ${JSON.stringify(validateLine.errors)}`);
      }
      expect(ok).toBe(true);
    }
  });

  it("rejects a line missing a required contract field", () => {
    const bad = { id: "ex_x", input: {}, expected: {}, tags: [], provenance: "human_only" };
    expect(validateLine(bad)).toBe(false);
  });

  it("rejects an unknown provenance", () => {
    const lines = assembleExport(FIXTURE, "docflow-invoices", 1);
    const bad = { ...lines[0]!, provenance: "robot_only" };
    expect(validateLine(bad)).toBe(false);
  });
});

describe("export contract — the reference reader parses the export", () => {
  it("python3 load_golden reads every line back with the contract keys", () => {
    const lines = assembleExport(FIXTURE, "docflow-invoices", 2);
    const jsonl = toJsonl(lines);
    const dir = mkdtempSync(join(tmpdir(), "goldsmith-export-"));
    const file = join(dir, "docflow-invoices.v2.jsonl");
    writeFileSync(file, jsonl);

    const out = execFileSync("python3", ["-c", REFERENCE_READER, file], { encoding: "utf8" });
    const printed = out.trim().split("\n");
    // First line is the row count; the rest are per-row sorted key lists.
    expect(printed[0]).toBe(String(lines.length));
    const expectedKeys = "dataset|dataset_version|expected|id|input|provenance|tags";
    for (let i = 1; i < printed.length; i++) {
      expect(printed[i]).toBe(expectedKeys);
    }
  });

  it("an empty export is valid (no lines, reader returns 0 rows)", () => {
    const jsonl = toJsonl([]);
    expect(jsonl).toBe("");
    const dir = mkdtempSync(join(tmpdir(), "goldsmith-export-"));
    const file = join(dir, "empty.jsonl");
    writeFileSync(file, jsonl);
    const out = execFileSync("python3", ["-c", REFERENCE_READER, file], { encoding: "utf8" });
    expect(out.trim()).toBe("0");
  });
});
