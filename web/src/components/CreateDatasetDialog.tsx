import { useState } from "react";
import { PRESETS, type DatasetInput, type Preset } from "@goldsmith/shared";
import { checkSchemaText, presetSchemaText } from "../lib/schema.ts";
import { slugify } from "../lib/slug.ts";

interface Props {
  onCancel: () => void;
  onCreate: (input: DatasetInput) => Promise<void>;
}

// Create-dataset dialog: title, auto slug (editable), preset select, and a
// JSON Schema textarea prefilled from the chosen preset. The schema is checked
// with ajv before it can be saved.
export function CreateDatasetDialog({ onCancel, onCreate }: Props) {
  const [title, setTitle] = useState("");
  // slugTouched: once the user edits the slug by hand, stop overwriting it
  // from the title.
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [preset, setPreset] = useState<Preset>("extraction");
  const [schemaText, setSchemaText] = useState(() => presetSchemaText("extraction"));
  // schemaTouched: keep manual schema edits when switching presets? No — a
  // preset switch reloads its default, which is the whole point of presets.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(title);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function onPresetChange(value: Preset) {
    setPreset(value);
    setSchemaText(presetSchemaText(value));
    setError(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (title.trim() === "") {
      setError("Title is required.");
      return;
    }
    if (effectiveSlug === "") {
      setError("Slug is required (the title produced an empty slug — type one).");
      return;
    }
    const check = checkSchemaText(schemaText);
    if (!check.valid) {
      setError(check.error ?? "Schema is invalid.");
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        slug: effectiveSlug,
        preset,
        json_schema: JSON.parse(schemaText) as Record<string, unknown>,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-2xl flex-col gap-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="text-xl font-semibold text-slate-900">New dataset</h2>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Title</span>
          <input
            className="rounded border border-slate-300 px-3 py-2"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="DocFlow Invoices"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Slug</span>
          <input
            className="rounded border border-slate-300 px-3 py-2 font-mono"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            placeholder="docflow-invoices"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Preset</span>
          <select
            className="rounded border border-slate-300 px-3 py-2"
            value={preset}
            onChange={(e) => onPresetChange(e.target.value as Preset)}
          >
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            Expected JSON Schema{" "}
            <span className="font-normal text-slate-400">(editable, validated on save)</span>
          </span>
          <textarea
            className="h-64 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            spellCheck={false}
          />
        </label>

        {error !== null && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
            {submitting ? "Creating…" : "Create dataset"}
          </button>
        </div>
      </form>
    </div>
  );
}
