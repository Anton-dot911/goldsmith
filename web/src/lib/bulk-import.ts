import type { Preset } from "@goldsmith/shared";

// Pure parsing for the bulk import of TEXT inputs (T4): CSV or JSONL in, a list
// of input objects + a list of per-line errors out. Malformed lines are
// REPORTED (with their line number), never silently dropped — that is the whole
// point of the feature, so a botched row can't quietly become a hole in the
// dataset. The parsed inputs become unlabeled examples (expected null, inactive)
// via lib/examples.ts; this module never touches the network or the DB.

export type ImportFormat = "csv" | "jsonl";

export interface ParsedInputRow {
  input: Record<string, unknown>;
}

export interface ImportError {
  // 1-based line number in the source file (for CSV, the line the record began
  // on — a quoted field may span lines).
  line: number;
  message: string;
}

export interface ImportResult {
  rows: ParsedInputRow[];
  errors: ImportError[];
}

// The input key a preset's text inputs use (docs/PLAN.md input conventions):
// routing/qa read {"question": ...}; extraction/classification/custom read
// {"text": ...}. A JSONL line that is already an object is trusted as-is, so
// this only names the wrapper for bare-string / single-column rows.
export function textInputKey(preset: Preset): "text" | "question" {
  return preset === "routing" || preset === "qa" ? "question" : "text";
}

// Guess the format from a filename; null when neither extension matches (the
// caller then asks the user to pick).
export function detectFormat(filename: string): ImportFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) {
    return "jsonl";
  }
  if (lower.endsWith(".csv")) {
    return "csv";
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// JSONL: one JSON value per non-blank line.
//  - a string          -> {[key]: string} (the common "just the texts" case)
//  - an object         -> used as the input as-is (already an input shape, e.g.
//                         {"question": ...} or {"file_ref": ...})
//  - anything else      -> reported error (number/boolean/null/array)
// Blank lines are skipped (not errors); a parse failure is an error, not a drop.
export function parseJsonl(text: string, key: "text" | "question"): ImportResult {
  const rows: ParsedInputRow[] = [];
  const errors: ImportError[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (trimmed === "") {
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch (cause) {
      errors.push({ line: lineNo, message: `invalid JSON: ${(cause as Error).message}` });
      return;
    }
    if (typeof value === "string") {
      if (value.trim() === "") {
        errors.push({ line: lineNo, message: "empty text input" });
        return;
      }
      rows.push({ input: { [key]: value } });
    } else if (isPlainObject(value)) {
      if (Object.keys(value).length === 0) {
        errors.push({ line: lineNo, message: "empty input object" });
        return;
      }
      rows.push({ input: value });
    } else {
      errors.push({ line: lineNo, message: "expected a JSON string or object input" });
    }
  });
  return { rows, errors };
}

interface CsvRecord {
  fields: string[];
  line: number;
}

// A small RFC 4180-ish tokenizer: comma-separated fields, double-quoted fields
// may contain commas, newlines, and "" escapes. Each record remembers the
// physical line it began on so errors point at the right place even when a
// quoted field spans lines.
function parseCsvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let hasContent = false;
  let line = 1;
  let startLine = 1;
  let atRecordStart = true;

  const endField = () => {
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push({ fields, line: startLine });
    fields = [];
    hasContent = false;
    atRecordStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (atRecordStart) {
      startLine = line;
      atRecordStart = false;
    }
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") {
          line++;
        }
        field += c;
      }
      hasContent = true;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (c === ",") {
      endField();
      hasContent = true;
    } else if (c === "\n") {
      line++;
      if (hasContent || fields.length > 0 || field !== "") {
        endRecord();
      } else {
        atRecordStart = true;
      }
    } else if (c === "\r") {
      // ignore; the \n handles the line break
    } else {
      field += c;
      hasContent = true;
    }
  }
  if (hasContent || field !== "" || fields.length > 0) {
    endRecord();
  }
  return records;
}

// CSV: a header row is used when its cells name a known column (the preset's
// key, else "text"/"question"/"input"); otherwise every record is a single
// text input taken from the first column. Each data record contributes one
// input; a record missing the chosen column or with an empty value is reported,
// not dropped.
export function parseCsv(text: string, key: "text" | "question"): ImportResult {
  const rows: ParsedInputRow[] = [];
  const errors: ImportError[] = [];
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { rows, errors };
  }

  const header = (records[0]?.fields ?? []).map((h) => h.trim().toLowerCase());
  const known = ["text", "question", "input"];
  let colIndex: number;
  let dataStart: number;
  const exact = header.indexOf(key);
  const anyKnown = exact >= 0 ? exact : header.findIndex((h) => known.includes(h));
  if (anyKnown >= 0) {
    colIndex = anyKnown;
    dataStart = 1;
  } else {
    colIndex = 0;
    dataStart = 0;
  }

  for (let r = dataStart; r < records.length; r++) {
    const rec = records[r];
    if (rec === undefined) {
      continue;
    }
    if (colIndex >= rec.fields.length) {
      errors.push({ line: rec.line, message: `missing column ${colIndex + 1}` });
      continue;
    }
    const value = (rec.fields[colIndex] ?? "").trim();
    if (value === "") {
      errors.push({ line: rec.line, message: "empty text input" });
      continue;
    }
    rows.push({ input: { [key]: value } });
  }
  return { rows, errors };
}

export function parseBulk(
  text: string,
  format: ImportFormat,
  key: "text" | "question",
): ImportResult {
  return format === "jsonl" ? parseJsonl(text, key) : parseCsv(text, key);
}
