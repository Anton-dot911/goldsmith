import { asSchema, deleteKey, enumValues, setKey, type JsonSchema } from "../../lib/preset-form.ts";
import { SelectInput } from "./fields.tsx";

// `classification` renderer: a single label select drawn from the schema enum.
// Expected shape: { label: string }. Choosing the placeholder clears the key so
// an unset label fails the ajv gate (label is required) rather than saving "".

export function ClassificationForm({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const options = enumValues(asSchema(schema.properties?.label)) ?? [];
  const label = typeof value.label === "string" ? value.label : undefined;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">
        label<span className="text-red-500"> *</span>
      </span>
      {options.length === 0 ? (
        <p className="text-sm text-slate-400 italic">schema defines no label enum</p>
      ) : (
        <SelectInput
          value={label}
          options={options}
          ariaLabel="label"
          onChange={(next) =>
            onChange(next === undefined ? deleteKey(value, "label") : setKey(value, "label", next))
          }
        />
      )}
    </div>
  );
}
