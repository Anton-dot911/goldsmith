import type { Preset } from "@goldsmith/shared";
import type { JsonSchema } from "../../lib/preset-form.ts";
import { ExtractionForm } from "./ExtractionForm.tsx";
import { RoutingForm } from "./RoutingForm.tsx";
import { QaForm } from "./QaForm.tsx";
import { ClassificationForm } from "./ClassificationForm.tsx";

// Dispatch to the renderer for a dataset's preset. Returns null for `custom`
// (no preset form — the dialog shows the raw-JSON editor for it). Every
// renderer emits the same `expected` object the ajv gate validates, so form
// mode and raw mode share one validation path.
export function PresetForm({
  preset,
  schema,
  input,
  value,
  onChange,
}: {
  preset: Preset;
  schema: JsonSchema;
  input: unknown;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  switch (preset) {
    case "extraction":
      return <ExtractionForm schema={schema} value={value} onChange={onChange} />;
    case "routing":
      return <RoutingForm schema={schema} input={input} value={value} onChange={onChange} />;
    case "qa":
      return <QaForm input={input} value={value} onChange={onChange} />;
    case "classification":
      return <ClassificationForm schema={schema} value={value} onChange={onChange} />;
    case "custom":
    default:
      return null;
  }
}

// Whether a preset has a custom form at all (drives the dialog's default mode
// and whether the raw/form toggle is offered).
export function hasPresetForm(preset: Preset): boolean {
  return preset !== "custom";
}
