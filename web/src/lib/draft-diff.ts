// The hard-cases signal (T5, CLAUDE.md rule 4): which fields did the human
// change from the AI's draft? Those corrections are the most valuable eval
// signal, so the Label page marks them. This is a pure diff over the top-level
// fields of the expected object; kept DOM-free so it is unit-testable.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Stable stringify so key order doesn't produce false diffs.
function canonical(value: unknown): string {
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  return JSON.stringify(value) ?? "null";
}

// The set of top-level field names whose value differs between the AI draft and
// the human-verified final. A field present in one and absent in the other
// counts as changed. Returns [] when there is no draft to compare against.
export function changedFields(aiDraft: unknown, finalValue: unknown): string[] {
  if (!isPlainObject(aiDraft) || !isPlainObject(finalValue)) {
    // If either side isn't an object, treat the whole value as one field.
    if (aiDraft === undefined) {
      return [];
    }
    return canonical(aiDraft) === canonical(finalValue) ? [] : ["(value)"];
  }
  const keys = new Set([...Object.keys(aiDraft), ...Object.keys(finalValue)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (canonical(aiDraft[key]) !== canonical(finalValue[key])) {
      changed.push(key);
    }
  }
  return changed;
}
