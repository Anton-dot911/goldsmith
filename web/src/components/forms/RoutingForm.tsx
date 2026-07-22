import { asSchema, enumValues, setKey, type JsonSchema } from "../../lib/preset-form.ts";
import { BoolInput } from "./fields.tsx";
import { QuestionContext } from "./context.tsx";

// `routing` renderer: the input question as read-only context, the target
// routes as a multi-select drawn from the schema enum, and a clarify_ok toggle.
// Expected shape: { routes: string[], clarify_ok: boolean }.

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function RoutingForm({
  schema,
  input,
  value,
  onChange,
}: {
  schema: JsonSchema;
  input: unknown;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  // Route options come from the schema (properties.routes.items.enum), not a
  // hardcoded list, so a dataset can define its own route set.
  const routeOptions = enumValues(asSchema(asSchema(schema.properties?.routes).items)) ?? [];
  const selected = asStringArray(value.routes);
  const clarifyOk = value.clarify_ok === true;

  function toggleRoute(route: string, on: boolean) {
    // Preserve enum order rather than click order so the array is stable.
    const next = routeOptions.filter((r) => (r === route ? on : selected.includes(r)));
    onChange(setKey(value, "routes", next));
  }

  return (
    <div className="flex flex-col gap-4">
      <QuestionContext input={input} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">
          Routes<span className="text-red-500"> *</span>
        </legend>
        {routeOptions.length === 0 ? (
          <p className="text-sm text-slate-400 italic">schema defines no route enum</p>
        ) : (
          routeOptions.map((route) => (
            <BoolInput
              key={route}
              value={selected.includes(route)}
              label={route}
              onChange={(on) => toggleRoute(route, on)}
            />
          ))
        )}
      </fieldset>

      <BoolInput
        value={clarifyOk}
        label="clarify_ok"
        onChange={(on) => onChange(setKey(value, "clarify_ok", on))}
      />
    </div>
  );
}
