import { useEffect, useState } from "react";
import type { DatasetInput, DatasetRow } from "@goldsmith/shared";
import { CreateDatasetDialog } from "../components/CreateDatasetDialog.tsx";
import { createDataset, listDatasets } from "../lib/datasets.ts";

interface Props {
  // Open a dataset's detail page (examples table).
  onOpen: (dataset: DatasetRow) => void;
}

// Datasets page: list existing datasets and open the create dialog.
export function Datasets({ onOpen }: Props) {
  const [datasets, setDatasets] = useState<DatasetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function refresh() {
    listDatasets()
      .then(setDatasets)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }

  useEffect(refresh, []);

  async function onCreate(input: DatasetInput) {
    const row = await createDataset(input);
    setDatasets((prev) => (prev === null ? [row] : [row, ...prev]));
    setDialogOpen(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Datasets</h1>
          <p className="text-sm text-slate-500">Golden datasets for evals.</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New dataset
        </button>
      </header>

      {error !== null && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {datasets === null && error === null && <p className="text-slate-400">Loading…</p>}

      {datasets !== null && datasets.length === 0 && (
        <p className="text-slate-400">No datasets yet. Create one to get started.</p>
      )}

      {datasets !== null && datasets.length > 0 && (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4 font-medium">Title</th>
              <th className="py-2 pr-4 font-medium">Slug</th>
              <th className="py-2 pr-4 font-medium">Preset</th>
              <th className="py-2 pr-4 font-medium">Version</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr
                key={d.id}
                onClick={() => onOpen(d)}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="py-2 pr-4 text-slate-900">{d.title}</td>
                <td className="py-2 pr-4 font-mono text-slate-600">{d.slug}</td>
                <td className="py-2 pr-4 text-slate-600">{d.preset}</td>
                <td className="py-2 pr-4 text-slate-600">v{d.current_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialogOpen && (
        <CreateDatasetDialog onCancel={() => setDialogOpen(false)} onCreate={onCreate} />
      )}
    </main>
  );
}
