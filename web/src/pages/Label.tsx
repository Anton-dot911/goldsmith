import { useCallback, useEffect, useMemo, useState } from "react";
import type { DatasetRow, ExampleRow } from "@goldsmith/shared";
import { InputPane } from "../components/InputPane.tsx";
import { hasPresetForm, PresetForm } from "../components/forms/PresetForm.tsx";
import { isUnlabeled } from "../lib/example-model.ts";
import { listExamples, saveLabel } from "../lib/examples.ts";
import { firstUnlabeledIndex, nextIndex, orderForLabeling, prevIndex } from "../lib/labeling.ts";
import { seedExpected, type JsonSchema } from "../lib/preset-form.ts";
import { validateExpected, type ReadableError } from "../lib/validate.ts";

interface Props {
  dataset: DatasetRow;
  onBack: () => void;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pretty(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

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

// Two-pane labeling (T4). Left = the input (text render or file preview from
// Storage); right = the T3 preset form for `expected`. The queue is ordered
// unlabeled-first and walked by index; save-and-next is the primary action.
// Keyboard: ⌘/Ctrl+Enter save-and-next, ArrowLeft/ArrowRight prev/next.
// On mobile the two panes stack vertically.
export function Label({ dataset, onBack }: Props) {
  const preset = dataset.preset;
  const [queue, setQueue] = useState<ExampleRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable state for the CURRENT example; reset whenever the cursor lands on
  // a different row (or the current row changes after a save).
  const [inputValue, setInputValue] = useState<unknown>({});
  const [expectedValue, setExpectedValue] = useState<Record<string, unknown>>({});
  const [rawMode, setRawMode] = useState(false);
  const [expectedText, setExpectedText] = useState("{}");
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [schemaErrors, setSchemaErrors] = useState<ReadableError[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listExamples(dataset.id)
      .then((rows) => {
        const ordered = orderForLabeling(rows);
        setQueue(ordered);
        setIndex(firstUnlabeledIndex(ordered));
      })
      .catch((cause: unknown) => {
        setLoadError(cause instanceof Error ? cause.message : String(cause));
      });
  }, [dataset.id]);

  const current = queue !== null ? (queue[index] ?? null) : null;
  const currentKey = current === null ? "" : `${current.id}:${current.updated_at}`;

  // Reset the editable fields when the cursor lands on a different row (or the
  // current row changes after a save). Done as a render-time reset keyed on
  // currentKey (React's "adjust state when a prop changes" pattern) rather than
  // in an effect — unlabeled rows open with the preset seed, labeled rows with
  // their stored value (form mode for a plain object, else raw JSON, same rule
  // as the T3 dialog).
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (current !== null && currentKey !== prevKey) {
    setPrevKey(currentKey);
    setError(null);
    setSchemaErrors([]);
    setInputValue(current.input ?? {});
    const unlabeled = isUnlabeled(current);
    setExpectedValue(
      unlabeled ? seedExpected(preset) : isPlainObject(current.expected) ? current.expected : {},
    );
    setExpectedText(pretty(unlabeled ? seedExpected(preset) : current.expected));
    setRawMode(!hasPresetForm(preset) || (!unlabeled && !isPlainObject(current.expected)));
    setTagsText(current.tags.join(", "));
  }

  const total = queue?.length ?? 0;
  const remaining = useMemo(() => (queue ?? []).filter(isUnlabeled).length, [queue]);

  function goPrev() {
    setIndex((i) => prevIndex(i));
  }
  function goNext() {
    setIndex((i) => nextIndex(i, total));
  }

  const saveAndNext = useCallback(async () => {
    if (current === null || saving) {
      return;
    }
    setError(null);
    setSchemaErrors([]);

    let expected: unknown;
    if (rawMode) {
      try {
        expected = JSON.parse(expectedText);
      } catch (cause) {
        setError(`Expected is not valid JSON: ${(cause as Error).message}`);
        return;
      }
    } else {
      expected = expectedValue;
    }

    // Rule 2: the save-gate. Invalid expected cannot be saved.
    const check = validateExpected(dataset.json_schema, expected);
    if (!check.valid) {
      setSchemaErrors(check.errors);
      return;
    }

    setSaving(true);
    try {
      const saved = await saveLabel(current, {
        input: inputValue,
        expected,
        tags: parseTags(tagsText),
      });
      // Update the row in place (keeps its queue position) and advance.
      setQueue((prev) => (prev ?? []).map((r) => (r.id === saved.id ? saved : r)));
      setIndex((i) => nextIndex(i, total));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [
    current,
    saving,
    rawMode,
    expectedText,
    expectedValue,
    dataset.json_schema,
    inputValue,
    tagsText,
    total,
  ]);

  // Keyboard flow. ⌘/Ctrl+Enter is the primary save-and-next; the arrows
  // navigate. Ignored while focus is in a text field for the arrows so caret
  // movement still works; save-and-next always fires.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void saveAndNext();
        return;
      }
      const target = e.target as HTMLElement | null;
      const inField =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField) {
        return;
      }
      if (e.key === "ArrowLeft") {
        setIndex((i) => prevIndex(i));
      } else if (e.key === "ArrowRight") {
        setIndex((i) => nextIndex(i, total));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAndNext, total]);

  function switchToRaw() {
    setError(null);
    setSchemaErrors([]);
    setExpectedText(pretty(expectedValue));
    setRawMode(true);
  }
  function switchToForm() {
    setError(null);
    setSchemaErrors([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(expectedText);
    } catch (cause) {
      setError(`Expected is not valid JSON: ${(cause as Error).message}`);
      return;
    }
    if (!isPlainObject(parsed)) {
      setError("Expected must be a JSON object to edit as a form.");
      return;
    }
    setExpectedValue(parsed);
    setRawMode(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <button onClick={onBack} className="mb-4 text-sm text-slate-500 hover:text-slate-800">
        ← {dataset.title}
      </button>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">Label · {dataset.title}</h1>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>
            {total === 0 ? 0 : index + 1} / {total}
          </span>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
            {remaining} unlabeled
          </span>
        </div>
      </header>

      {loadError !== null && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}
      {queue !== null && total === 0 && loadError === null && (
        <p className="text-slate-400">
          No examples yet. Add some on the dataset page or via bulk import.
        </p>
      )}

      {current !== null && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* LEFT: the input */}
          <section className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Input</span>
              {isUnlabeled(current) && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  unlabeled
                </span>
              )}
            </div>
            <InputPane input={inputValue} onChange={setInputValue} />
          </section>

          {/* RIGHT: the expected form */}
          <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Expected <span className="font-normal text-slate-400">(validated on save)</span>
              </span>
              {hasPresetForm(preset) && (
                <button
                  type="button"
                  onClick={rawMode ? switchToForm : switchToRaw}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  {rawMode ? "Edit as form" : "Raw JSON"}
                </button>
              )}
            </div>

            {rawMode ? (
              <textarea
                className="h-72 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                value={expectedText}
                onChange={(e) => setExpectedText(e.target.value)}
                spellCheck={false}
                aria-label="Expected (JSON)"
              />
            ) : (
              <div className="rounded border border-slate-200 p-3">
                <PresetForm
                  preset={preset}
                  schema={dataset.json_schema as JsonSchema}
                  input={inputValue}
                  value={expectedValue}
                  onChange={setExpectedValue}
                />
              </div>
            )}

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
          </section>
        </div>
      )}

      {current !== null && (
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={goPrev}
              disabled={index === 0}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              disabled={index >= total - 1}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
          <button
            onClick={() => void saveAndNext()}
            disabled={saving}
            className="rounded bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            title="⌘/Ctrl + Enter"
          >
            {saving ? "Saving…" : "Save & next"}
          </button>
        </footer>
      )}
    </main>
  );
}
