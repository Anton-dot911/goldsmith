// Read-only display of the example's `input` question, shown as context above
// the routing / qa expected forms (the label task is "given this question,
// what's the target?"). `input` is whatever raw JSON the dialog holds; we pull
// a `question` (or `text`) string if present and otherwise say so.

function questionOf(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const q = record.question ?? record.text;
  return typeof q === "string" ? q : null;
}

export function QuestionContext({ input }: { input: unknown }) {
  const question = questionOf(input);
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-slate-500">Question (from input)</div>
      {question === null ? (
        <div className="text-sm text-slate-400 italic">no question in input</div>
      ) : (
        <div className="text-sm text-slate-700">{question}</div>
      )}
    </div>
  );
}
