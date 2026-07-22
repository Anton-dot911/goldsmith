import { useEffect, useState } from "react";
import {
  extensionOf,
  fileNameFromRef,
  isFileRefInput,
  type FileRefInput,
} from "../lib/file-ref.ts";
import { signedUrlForRef } from "../lib/storage.ts";

// The label page's LEFT pane: the example's input. Two shapes (T4):
//  - a file input ({"file_ref": "storage://..."}) -> a preview from Storage
//    (PDF via <embed>, image via <img>) fetched through a short-lived signed
//    URL, plus the filename; not editable — the bytes are the input.
//  - a text input ({"text"|"question"|...: "..."}) -> an editable textarea, so
//    a bulk-imported or hand-typed input can be corrected while labeling.
// Anything else falls back to a read-only JSON view.

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"]);
const TEXT_KEYS = ["text", "question", "prompt", "content", "input"] as const;

function firstTextKey(input: Record<string, unknown>): string | null {
  for (const key of TEXT_KEYS) {
    if (typeof input[key] === "string") {
      return key;
    }
  }
  // A single string-valued property is treated as the text field too.
  const stringKeys = Object.keys(input).filter((k) => typeof input[k] === "string");
  return stringKeys.length === 1 ? (stringKeys[0] ?? null) : null;
}

function FilePreview({ input }: { input: FileRefInput }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filename = fileNameFromRef(input.file_ref) ?? input.file_ref;
  const ext = extensionOf(filename);

  // The component is remounted (keyed by file_ref) whenever the input changes,
  // so state starts fresh and this effect only sets state from the async result
  // — no synchronous reset needed.
  useEffect(() => {
    let cancelled = false;
    signedUrlForRef(input.file_ref)
      .then((signed) => {
        if (!cancelled) {
          setUrl(signed);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [input.file_ref]);

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="font-mono text-xs text-slate-500" title={input.file_ref}>
        {filename}
      </p>
      {error !== null && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {error === null && url === null && <p className="text-slate-400">Loading preview…</p>}
      {url !== null && ext === "pdf" && (
        <embed
          src={url}
          type="application/pdf"
          className="h-[70vh] w-full rounded border border-slate-200"
        />
      )}
      {url !== null && IMAGE_EXTS.has(ext) && (
        <img
          src={url}
          alt={filename}
          className="max-h-[70vh] w-full rounded border border-slate-200 object-contain"
        />
      )}
      {url !== null && ext !== "pdf" && !IMAGE_EXTS.has(ext) && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-blue-600 underline hover:text-blue-800"
        >
          Open file ({ext || "unknown type"})
        </a>
      )}
    </div>
  );
}

export function InputPane({
  input,
  onChange,
}: {
  input: unknown;
  // Called with the full input object when a text field is edited. Absent =>
  // read-only.
  onChange?: (next: Record<string, unknown>) => void;
}) {
  if (isFileRefInput(input)) {
    // Keyed by file_ref so switching examples remounts with fresh preview state.
    return <FilePreview key={input.file_ref} input={input} />;
  }

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    const key = firstTextKey(obj);
    if (key !== null && onChange !== undefined) {
      return (
        <label className="flex h-full flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Input · {key}</span>
          <textarea
            className="h-[60vh] w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
            value={String(obj[key] ?? "")}
            onChange={(e) => onChange({ ...obj, [key]: e.target.value })}
            aria-label={`Input ${key}`}
            spellCheck={false}
          />
        </label>
      );
    }
  }

  // Fallback: show the raw input, read-only.
  return (
    <div className="flex h-full flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">Input</span>
      <pre className="h-[60vh] overflow-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
        {JSON.stringify(input, null, 2)}
      </pre>
    </div>
  );
}
