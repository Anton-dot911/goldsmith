import { useEffect, useRef, useState } from "react";
import {
  deleteKey,
  emptyObject,
  emptyValue,
  fieldShape,
  objectFields,
  setKey,
  type JsonSchema,
} from "../../lib/preset-form.ts";
import { BoolInput, DateInput, Field, NumberInput, SelectInput, TextInput } from "./fields.tsx";

// Schema-driven renderer for the `extraction` preset (CLAUDE.md rule 6). It
// walks the dataset's json_schema: nested objects become sections, arrays of
// objects become repeatable row groups, and primitives render by type
// (string/date/number/boolean, enum→select). Nullable fields carry an explicit
// null toggle because null is a legitimate expected value in extraction
// datasets. Every edit is an immutable update of the `expected` object, so keys
// the schema doesn't draw (additionalProperties) round-trip untouched.

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// A JSON value editor for schema shapes the form doesn't model directly
// (the "unknown" fallback). Buffers text so an in-progress edit isn't discarded
// mid-keystroke; emits the parsed value only when it parses.
function JsonInput({ value, onChange }: { value: unknown; onChange: (next: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null));
  const lastEmitted = useRef(value);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(JSON.stringify(value ?? null));
      setBad(false);
    }
  }, [value]);

  function handle(next: string) {
    setText(next);
    try {
      const parsed: unknown = JSON.parse(next);
      lastEmitted.current = parsed;
      setBad(false);
      onChange(parsed);
    } catch {
      setBad(true);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={`h-16 rounded border px-3 py-2 font-mono text-xs ${
          bad ? "border-red-400" : "border-slate-300"
        }`}
        value={text}
        onChange={(e) => handle(e.target.value)}
        spellCheck={false}
      />
      {bad ? <span className="text-xs text-red-600">not valid JSON</span> : null}
    </div>
  );
}

// Draw the primitive/section input for a field, given its already-resolved
// (non-null) value. Nullability is handled one level up in SchemaField. `path`
// is the dotted location of this field (e.g. "lines.0.qty") used as the input's
// accessible name.
function FieldBody({
  schema,
  value,
  onChange,
  disabled,
  path,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  path: string;
}) {
  const shape = fieldShape(schema);

  if (shape.enumValues !== undefined && (shape.kind === "string" || shape.kind === "date")) {
    return (
      <SelectInput
        value={typeof value === "string" ? value : undefined}
        options={shape.enumValues}
        disabled={disabled}
        ariaLabel={path}
        onChange={(next) => onChange(next ?? "")}
      />
    );
  }

  switch (shape.kind) {
    case "string":
      return (
        <TextInput
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          ariaLabel={path}
          onChange={onChange}
        />
      );
    case "date":
      return (
        <DateInput
          value={typeof value === "string" ? value : ""}
          disabled={disabled}
          ariaLabel={path}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <NumberInput
          value={typeof value === "number" ? value : undefined}
          disabled={disabled}
          ariaLabel={path}
          onChange={(next) => onChange(next)}
        />
      );
    case "boolean":
      return (
        <BoolInput
          value={value === true}
          label={value === true ? "true" : "false"}
          ariaLabel={path}
          onChange={onChange}
        />
      );
    case "object":
      return (
        <div className="ml-3 border-l border-slate-200 pl-3">
          <ObjectFields schema={schema} value={value} onChange={onChange} path={path} />
        </div>
      );
    case "array-objects":
      return (
        <RowGroup itemSchema={shape.items ?? {}} value={value} onChange={onChange} path={path} />
      );
    case "array-scalars":
      return (
        <ScalarList itemSchema={shape.items ?? {}} value={value} onChange={onChange} path={path} />
      );
    default:
      return <JsonInput value={value} onChange={onChange} />;
  }
}

function childPath(parent: string, key: string | number): string {
  return parent === "" ? String(key) : `${parent}.${key}`;
}

// One named property: wires the null toggle (for nullable fields) around the
// field body. `onChange(undefined)` removes the key; any other value sets it.
function SchemaField({
  name,
  required,
  schema,
  value,
  onChange,
  path,
}: {
  name: string;
  required: boolean;
  schema: JsonSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  path: string;
}) {
  const shape = fieldShape(schema);
  const isNull = value === null;

  return (
    <Field
      label={name}
      required={required}
      nullable={shape.nullable}
      isNull={isNull}
      nullAriaLabel={`${path} null`}
      onToggleNull={(next) => onChange(next ? null : emptyValue(schema))}
    >
      <FieldBody
        schema={schema}
        value={isNull ? emptyValue(schema) : value}
        disabled={isNull}
        onChange={onChange}
        path={path}
      />
    </Field>
  );
}

// The properties of an object schema as a stack of fields. Editing a field
// immutably updates the parent object; a number cleared to empty removes its
// key so it doesn't linger as a stray value.
export function ObjectFields({
  schema,
  value,
  onChange,
  path = "",
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  path?: string;
}) {
  const obj = asRecord(value);
  return (
    <div className="flex flex-col gap-3">
      {objectFields(schema).map(({ key, required, schema: propSchema }) => (
        <SchemaField
          key={key}
          name={key}
          required={required}
          schema={propSchema}
          value={obj[key]}
          path={childPath(path, key)}
          onChange={(next) =>
            onChange(next === undefined ? deleteKey(obj, key) : setKey(obj, key, next))
          }
        />
      ))}
    </div>
  );
}

// A repeatable group of object rows (array whose items are objects).
function RowGroup({
  itemSchema,
  value,
  onChange,
  path,
}: {
  itemSchema: JsonSchema;
  value: unknown;
  onChange: (next: unknown[]) => void;
  path: string;
}) {
  const rows = asArray(value);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="rounded border border-slate-200 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">#{i + 1}</span>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-red-600"
              aria-label={`remove ${childPath(path, i)}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
          <ObjectFields
            schema={itemSchema}
            value={row}
            path={childPath(path, i)}
            onChange={(next) => onChange(rows.map((r, j) => (j === i ? next : r)))}
          />
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        aria-label={`add ${path}`}
        onClick={() => onChange([...rows, emptyObject(itemSchema)])}
      >
        + Add row
      </button>
    </div>
  );
}

// A repeatable list of primitive values (array of strings/numbers/etc).
function ScalarList({
  itemSchema,
  value,
  onChange,
  path,
}: {
  itemSchema: JsonSchema;
  value: unknown;
  onChange: (next: unknown[]) => void;
  path: string;
}) {
  const items = asArray(value);
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <FieldBody
              schema={itemSchema}
              value={item}
              path={childPath(path, i)}
              onChange={(next) => onChange(items.map((it, j) => (j === i ? next : it)))}
            />
          </div>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-red-600"
            aria-label={`remove ${childPath(path, i)}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        aria-label={`add ${path}`}
        onClick={() => onChange([...items, emptyValue(itemSchema)])}
      >
        + Add item
      </button>
    </div>
  );
}

// Top-level extraction renderer: the dataset schema's fields over the `expected`
// object.
export function ExtractionForm({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return <ObjectFields schema={schema} value={value} onChange={onChange} />;
}
