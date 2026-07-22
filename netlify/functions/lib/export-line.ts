// Pure export-contract assembly (T5). Turns dataset examples into the exact
// JSONL line shape defined in docs/PLAN.md and spec/export.schema.json — the
// public contract other repos' eval scripts read. Kept DOM/DB-free so the
// contract test can drive it with a fixture and validate every line.

export interface ExampleForExport {
  id: string;
  input: unknown;
  expected: unknown;
  tags: string[];
  provenance: string;
  active: boolean;
  version_added: number;
}

export interface ExportLine {
  id: string;
  input: unknown;
  expected: unknown;
  tags: string[];
  provenance: string;
  dataset: string;
  dataset_version: number;
}

// The export takes the ACTIVE examples of the chosen version (CLAUDE.md rule 3):
// active=true excludes deactivated rows and the unlabeled import queue
// (active=false), and version_added <= version means "belongs to version N"
// (an example added at v2 is part of v2, v3, … until deactivated). This is what
// keeps a frozen version's export stable as new examples land in later versions
// (T6 DoD, implemented here at the export boundary).
export function selectForExport(examples: ExampleForExport[], version: number): ExampleForExport[] {
  return examples.filter((e) => e.active && e.version_added <= version);
}

export function toExportLine(ex: ExampleForExport, slug: string, version: number): ExportLine {
  return {
    id: ex.id,
    input: ex.input,
    expected: ex.expected,
    tags: ex.tags,
    provenance: ex.provenance,
    dataset: slug,
    dataset_version: version,
  };
}

export function assembleExport(
  examples: ExampleForExport[],
  slug: string,
  version: number,
): ExportLine[] {
  return selectForExport(examples, version).map((ex) => toExportLine(ex, slug, version));
}

// One JSON object per line, trailing newline when non-empty. The reference
// reader (docs/PLAN.md) is `[json.loads(line) for line in f if line.strip()]`,
// so a trailing newline and empty-input case both parse cleanly.
export function toJsonl(lines: ExportLine[]): string {
  if (lines.length === 0) {
    return "";
  }
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}
