import { deleteKey, setKey } from "../../lib/preset-form.ts";
import { BoolInput, TextInput } from "./fields.tsx";
import { QuestionContext } from "./context.tsx";

// `qa` renderer: answerable toggle, answer textarea, and an optional
// source_hint. Expected shape: { answerable: boolean, answer: string,
// source_hint?: string }. source_hint is omitted entirely when blank (it's
// optional) rather than saved as an empty string.

export function QaForm({
  input,
  value,
  onChange,
}: {
  input: unknown;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const answerable = value.answerable === true;
  const answer = typeof value.answer === "string" ? value.answer : "";
  const sourceHint = typeof value.source_hint === "string" ? value.source_hint : "";

  return (
    <div className="flex flex-col gap-4">
      <QuestionContext input={input} />

      <BoolInput
        value={answerable}
        label="answerable"
        onChange={(on) => onChange(setKey(value, "answerable", on))}
      />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">
          answer<span className="text-red-500"> *</span>
        </span>
        <textarea
          className="h-24 rounded border border-slate-300 px-3 py-2 text-sm"
          value={answer}
          aria-label="answer"
          onChange={(e) => onChange(setKey(value, "answer", e.target.value))}
          spellCheck={false}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">
          source_hint <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <TextInput
          value={sourceHint}
          ariaLabel="source_hint"
          onChange={(next) =>
            onChange(
              next === "" ? deleteKey(value, "source_hint") : setKey(value, "source_hint", next),
            )
          }
        />
      </label>
    </div>
  );
}
