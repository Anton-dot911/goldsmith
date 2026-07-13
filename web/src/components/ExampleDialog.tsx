import { useState } from "react";
import type { DatasetRow, ExampleRow } from "@goldsmith/shared";
import { validateExpected, type ReadableError } from "../lib/validate.ts";

interface ExampleValues {
  input: unknown;
  expected: unknown;
  tags: string[];
}

interface Props {
  dataset: DatasetRow;
  // Present => edit mode (creates a new revision on save); absent => add.
  existing?: ExampleRow;
  onCancel: () => void;
  onSave: (values: ExampleValues) => Promise<void>;
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

// Split a comma/newline separated tag string into a clean, de-duped list.
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const t of raw.split(/[,\n]/)) {
    const trimmed = t.trim();
    if (trimmed !== "") {
      seen.add(trimmed);
    }
  }
  return [...seen];
}

// Manual add/edit form: raw-JSON textareas for input and expected plus a tags
// field. `expected` is validated against the dataset's JSON Schema on save
// (rule 2); invalid expected blocks the save and the errors render as a
// readable list (path + message), never a JSON dump. Preset form renderers
// arrive in T3 — this is the raw-JSON path.
export function ExampleDialog({ dataset, existing, onCancel, onSave }: Props) {
  const [inputText, setInputText] = useState(() =>
    existing === undefined ? "{}" : pretty(existing.input),
  );
  const [expectedText, setExpectedText] = useState(() =>
    existing === undefined ? "{}" : pretty(existing.expected),
  );
  const [tagsText, setTagsText] = useState(() =>
    existing === undefined ? "" : existing.tags.join(", "),
  );
  const [submitting, setSubmitting] = useState(false);
  // A single top-of-form message (parse failures, save failures).
  const [error, setError] = useState<string | null>(null);
  // The ajv save-gate failures for `expected`, rendered as a readable list.
  const [schemaErrors, setSchemaErrors] = useState<ReadableError[]>([]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSchemaErrors([]);

    let input: unknown;
    try {
      input = JSON.parse(inputText);
    } catch (cause) {
      setError(`Input is not valid JSON: ${(cause as Error).message}`);
      return;
    }

    let expected: unknown;
    try {
      expected = JSON.parse(expectedText);
    } catch (cause) {
      setError(`Expected is not valid JSON: ${(cause as Error).message}`);
      return;
    }

    // Rule 2: the save-gate. Invalid expected cannot be saved.
    const check = validateExpected(dataset.json_schema, expected);
    if (!check.valid) {
      setSchemaErrors(check.errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSave({ input, expected, tags: parseTags(tagsText) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={onSubmit}
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-xl font-semibold text-slate-900">
          {existing === undefined ? "Add example" : `Edit example (new revision)`}
        </h2>
        {existing !== undefined && (
          <p className="-mt-2 font-mono text-xs text-slate-400">
            {existing.id} · rev {existing.revision} → {existing.revision + 1}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Input (JSON)</span>
          <textarea
            className="h-32 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Expected (JSON){" "}
            <span className="font-normal text-slate-400">
              (validated against the dataset schema on save)
            </span>
          </span>
          <textarea
            className="h-40 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
            value={expectedText}
            onChange={(e) => setExpectedText(e.target.value)}
            spellCheck={false}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Tags <span className="font-normal text-slate-400">(comma separated)</span>
          </span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="scan, multipage"
          />
        </label>

        {error !== null && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {schemaErrors.length > 0 && (
          <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="mb-1 font-medium">Expected does not match the dataset schema:</p>
            <ul className="flex flex-col gap-0.5">
              {schemaErrors.map((e, i) => (
                <li key={i} className="font-mono text-xs">
                  <span className="font-semibold">{e.path}</span> {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : existing === undefined ? "Add example" : "Save revision"}
          </button>
        </div>
      </form>
    </div>
  );
}
