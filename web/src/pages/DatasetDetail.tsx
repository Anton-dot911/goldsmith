import { useEffect, useMemo, useState } from "react";
import type { DatasetRow, ExampleRow } from "@goldsmith/shared";
import { ExampleDialog } from "../components/ExampleDialog.tsx";
import { activeExamples } from "../lib/example-model.ts";
import { addExample, editExample, listExamples, setExampleActive } from "../lib/examples.ts";

interface Props {
  dataset: DatasetRow;
  onBack: () => void;
}

type ActiveFilter = "all" | "active" | "inactive";

// Truncate a JSON value to a one-line preview for the table.
function inputPreview(value: unknown): string {
  const s = JSON.stringify(value);
  return s.length > 48 ? `${s.slice(0, 48)}…` : s;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 9)}…${id.slice(-3)}` : id;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

// Dataset detail: the examples table with filters (active / tag), an active
// count, and manual add/edit (raw JSON) driving the rule-2 save-gate and the
// rule-3 revision/deactivate model.
export function DatasetDetail({ dataset, onBack }: Props) {
  const [examples, setExamples] = useState<ExampleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  // null = closed; { existing: undefined } = add; { existing: row } = edit.
  const [dialog, setDialog] = useState<{ existing?: ExampleRow } | null>(null);

  function refresh() {
    listExamples(dataset.id)
      .then(setExamples)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }

  useEffect(refresh, [dataset.id]);

  // Every tag present across the dataset's examples, for the tag filter.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const ex of examples ?? []) {
      for (const t of ex.tags) {
        set.add(t);
      }
    }
    return [...set].sort();
  }, [examples]);

  const activeCount = useMemo(() => activeExamples(examples ?? []).length, [examples]);

  const visible = useMemo(() => {
    let rows = examples ?? [];
    if (activeFilter === "active") {
      rows = rows.filter((r) => r.active);
    } else if (activeFilter === "inactive") {
      rows = rows.filter((r) => !r.active);
    }
    if (tagFilter !== "") {
      rows = rows.filter((r) => r.tags.includes(tagFilter));
    }
    return rows;
  }, [examples, activeFilter, tagFilter]);

  async function onSave(values: { input: unknown; expected: unknown; tags: string[] }) {
    if (dialog?.existing === undefined) {
      const row = await addExample({
        dataset_id: dataset.id,
        version_added: dataset.current_version,
        input: values.input,
        expected: values.expected,
        tags: values.tags,
      });
      setExamples((prev) => (prev === null ? [row] : [row, ...prev]));
    } else {
      const updated = await editExample(dialog.existing, values);
      setExamples((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
    }
    setDialog(null);
  }

  async function toggleActive(row: ExampleRow) {
    const updated = await setExampleActive(row, !row.active);
    setExamples((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <button onClick={onBack} className="mb-4 text-sm text-slate-500 hover:text-slate-800">
        ← Datasets
      </button>

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{dataset.title}</h1>
          <p className="text-sm text-slate-500">
            <span className="font-mono">{dataset.slug}</span> · {dataset.preset} · v
            {dataset.current_version} · <span className="text-slate-700">{activeCount}</span> active
            example{activeCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => setDialog({ existing: undefined })}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Add example
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <span className="text-slate-500">Status</span>
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          >
            <option value="all">all</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-500">Tag</span>
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">any</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error !== null && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {examples === null && error === null && <p className="text-slate-400">Loading…</p>}

      {examples !== null && examples.length === 0 && (
        <p className="text-slate-400">No examples yet. Add one to get started.</p>
      )}

      {examples !== null && examples.length > 0 && (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4 font-medium">ID</th>
              <th className="py-2 pr-4 font-medium">Input</th>
              <th className="py-2 pr-4 font-medium">Tags</th>
              <th className="py-2 pr-4 font-medium">Provenance</th>
              <th className="py-2 pr-4 font-medium">Rev</th>
              <th className="py-2 pr-4 font-medium">Active</th>
              <th className="py-2 pr-4 font-medium">Updated</th>
              <th className="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((ex) => (
              <tr
                key={ex.id}
                className={`border-b border-slate-100 ${ex.active ? "" : "opacity-50"}`}
              >
                <td className="py-2 pr-4 font-mono text-xs text-slate-600" title={ex.id}>
                  {shortId(ex.id)}
                </td>
                <td
                  className="py-2 pr-4 font-mono text-xs text-slate-600"
                  title={JSON.stringify(ex.input)}
                >
                  {inputPreview(ex.input)}
                </td>
                <td className="py-2 pr-4 text-slate-600">{ex.tags.join(", ")}</td>
                <td className="py-2 pr-4 text-slate-600">{ex.provenance}</td>
                <td className="py-2 pr-4 text-slate-600">{ex.revision}</td>
                <td className="py-2 pr-4 text-slate-600">{ex.active ? "yes" : "no"}</td>
                <td className="py-2 pr-4 text-slate-500">{formatTime(ex.updated_at)}</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDialog({ existing: ex })}
                      className="text-slate-500 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void toggleActive(ex)}
                      className="text-slate-500 hover:text-slate-900"
                    >
                      {ex.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {visible.length === 0 && examples !== null && examples.length > 0 && (
        <p className="mt-4 text-slate-400">No examples match the current filters.</p>
      )}

      {dialog !== null && (
        <ExampleDialog
          dataset={dataset}
          existing={dialog.existing}
          onCancel={() => setDialog(null)}
          onSave={onSave}
        />
      )}
    </main>
  );
}
