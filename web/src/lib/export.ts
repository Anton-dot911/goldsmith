import type { DatasetRow, ExampleRow } from "@goldsmith/shared";

// Client-side JSONL export (T5). Same contract as the CI endpoint
// (spec/export.schema.json): the active examples of the chosen version, one
// object per line. The canonical schema + reference-reader test lives in the
// functions package; this mirror produces the identical line shape for the
// in-app "Export .jsonl" download so the user gets the file without a round-trip
// through the function.

export interface ExportLine {
  id: string;
  input: unknown;
  expected: unknown;
  tags: string[];
  provenance: string;
  dataset: string;
  dataset_version: number;
}

// Active examples with version_added <= version (see docs/decisions.md T5).
export function buildExportLines(
  dataset: DatasetRow,
  examples: ExampleRow[],
  version: number,
): ExportLine[] {
  return examples
    .filter((e) => e.active && e.version_added <= version)
    .map((e) => ({
      id: e.id,
      input: e.input,
      expected: e.expected,
      tags: e.tags,
      provenance: e.provenance,
      dataset: dataset.slug,
      dataset_version: version,
    }));
}

export function toJsonl(lines: ExportLine[]): string {
  if (lines.length === 0) {
    return "";
  }
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}

// Trigger a browser download of the given JSONL text.
export function downloadJsonl(filename: string, jsonl: string): void {
  const blob = new Blob([jsonl], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
