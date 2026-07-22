import { useMemo, useRef, useState } from "react";
import type { DatasetRow } from "@goldsmith/shared";
import {
  detectFormat,
  parseBulk,
  textInputKey,
  type ImportFormat,
  type ImportResult,
} from "../lib/bulk-import.ts";
import { addUnlabeledExamples } from "../lib/examples.ts";
import { uploadInputFile } from "../lib/storage.ts";

interface Props {
  dataset: DatasetRow;
  onBack: () => void;
  // Called after any import so the label queue / detail counts refresh.
  onImported?: () => void;
}

interface FileResult {
  name: string;
  ok: boolean;
  detail: string;
}

// The Import page (T4): two ways to create unlabeled examples.
//  1. Bulk text: paste or upload CSV/JSONL of text inputs. Parsing reports
//     malformed lines instead of dropping them; only the good rows are
//     imported, each as an unlabeled example (expected null, inactive).
//  2. File inputs: pick or drop files (single or many) -> each is uploaded to
//     the private goldsmith-inputs bucket and becomes an unlabeled example with
//     input {"file_ref": "storage://..."}.
export function Import({ dataset, onBack, onImported }: Props) {
  const key = textInputKey(dataset.preset);

  // --- Bulk text state ---
  const [format, setFormat] = useState<ImportFormat>("jsonl");
  const [content, setContent] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [textMsg, setTextMsg] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);

  const parsed: ImportResult | null = useMemo(() => {
    if (content.trim() === "") {
      return null;
    }
    return parseBulk(content, format, key);
  }, [content, format, key]);

  function onPickTextFile(file: File) {
    const detected = detectFormat(file.name);
    if (detected !== null) {
      setFormat(detected);
    }
    file
      .text()
      .then((t) => {
        setContent(t);
        setTextMsg(null);
        setTextErr(null);
      })
      .catch((cause: unknown) =>
        setTextErr(cause instanceof Error ? cause.message : String(cause)),
      );
  }

  async function runTextImport() {
    if (parsed === null || parsed.rows.length === 0) {
      return;
    }
    setTextBusy(true);
    setTextMsg(null);
    setTextErr(null);
    try {
      const created = await addUnlabeledExamples({
        dataset_id: dataset.id,
        version_added: dataset.current_version,
        inputs: parsed.rows.map((r) => r.input),
      });
      setTextMsg(
        `Imported ${created.length} unlabeled example${created.length === 1 ? "" : "s"}.` +
          (parsed.errors.length > 0 ? ` ${parsed.errors.length} line(s) skipped (see below).` : ""),
      );
      setContent("");
      onImported?.();
    } catch (cause) {
      setTextErr(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTextBusy(false);
    }
  }

  // --- File inputs state ---
  const [dragOver, setDragOver] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    setFileBusy(true);
    setFileResults([]);
    const results: FileResult[] = [];
    for (const file of files) {
      try {
        const uploaded = await uploadInputFile(dataset.slug, file);
        await addUnlabeledExamples({
          dataset_id: dataset.id,
          version_added: dataset.current_version,
          inputs: [{ file_ref: uploaded.file_ref }],
        });
        results.push({ name: file.name, ok: true, detail: uploaded.file_ref });
      } catch (cause) {
        results.push({
          name: file.name,
          ok: false,
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      }
      setFileResults([...results]);
    }
    setFileBusy(false);
    onImported?.();
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-8">
      <button onClick={onBack} className="mb-4 text-sm text-slate-500 hover:text-slate-800">
        ← {dataset.title}
      </button>
      <h1 className="mb-1 text-xl font-bold text-slate-900">Import · {dataset.title}</h1>
      <p className="mb-6 text-sm text-slate-500">
        Imported inputs become <span className="font-medium">unlabeled</span> examples, queued for
        the label page and excluded from export until labeled.
      </p>

      {/* Bulk text import */}
      <section className="mb-10 flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">Bulk text ({key} inputs)</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-slate-500">Format</span>
            <select
              className="rounded border border-slate-300 px-2 py-1"
              value={format}
              onChange={(e) => setFormat(e.target.value as ImportFormat)}
            >
              <option value="jsonl">JSONL</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <label className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100">
            Choose file…
            <input
              type="file"
              accept=".csv,.jsonl,.ndjson,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  onPickTextFile(f);
                }
              }}
            />
          </label>
        </div>
        <textarea
          className="h-40 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
          placeholder={
            format === "jsonl"
              ? '{"' + key + '": "first input"}\n"second input"'
              : key + "\nfirst input\nsecond input"
          }
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
        />

        {parsed !== null && (
          <div className="text-sm">
            <p className="text-slate-600">
              {parsed.rows.length} valid input{parsed.rows.length === 1 ? "" : "s"}
              {parsed.errors.length > 0 && (
                <span className="text-red-700"> · {parsed.errors.length} malformed line(s)</span>
              )}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="mt-1 max-h-32 overflow-auto rounded bg-red-50 px-3 py-2 font-mono text-xs text-red-700">
                {parsed.errors.map((err, i) => (
                  <li key={i}>
                    line {err.line}: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <button
            onClick={() => void runTextImport()}
            disabled={textBusy || parsed === null || parsed.rows.length === 0}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {textBusy
              ? "Importing…"
              : `Import ${parsed?.rows.length ?? 0} input${(parsed?.rows.length ?? 0) === 1 ? "" : "s"}`}
          </button>
        </div>
        {textMsg !== null && (
          <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{textMsg}</p>
        )}
        {textErr !== null && (
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{textErr}</p>
        )}
      </section>

      {/* File inputs */}
      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700">File inputs (single or bulk)</h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void uploadFiles([...e.dataTransfer.files]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded border-2 border-dashed px-6 py-10 text-center text-sm ${
            dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300"
          }`}
        >
          <span className="text-slate-600">Drop files here, or click to choose</span>
          <span className="text-xs text-slate-400">
            PDF / images / any document · stored in a private bucket
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files) {
                void uploadFiles([...files]);
              }
            }}
          />
        </div>
        {fileBusy && <p className="text-sm text-slate-400">Uploading…</p>}
        {fileResults.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {fileResults.map((r, i) => (
              <li key={i} className={r.ok ? "text-slate-700" : "text-red-700"}>
                {r.ok ? "✓" : "✗"} <span className="font-medium">{r.name}</span>{" "}
                <span className="font-mono text-xs text-slate-500">{r.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
